import { EventBus } from './EventBus.js';
import { FixedLoop } from './FixedLoop.js';
import { Input } from './Input.js';
import { Simulation } from './Simulation.js';
import { Renderer } from '../render/Renderer.js';
import { SceneView } from '../render/SceneView.js';
import { AudioManager } from '../audio/AudioManager.js';
import { UI } from '../ui/UI.js';
import { TimelineEditor } from '../ui/TimelineEditor.js';
import { Tutorial } from '../ui/Tutorial.js';
import { loadSettings, saveSettings } from '../ui/Settings.js';
import { TICK_RATE } from './config.js';

const LOCK_FALLBACK_MS = 450;

/**
 * Top-level game: owns the simulation, renderer, audio and UI, and runs the state machine
 * menu -> briefing -> playing <-> paused -> ended -> (play again) playing.
 */
export class Game {
  constructor(container) {
    this.settings = loadSettings();
    this.bus = new EventBus();
    this.sim = new Simulation({ bus: this.bus });
    this.renderer = new Renderer(container);
    this.view = new SceneView(this.sim, this.renderer);
    this.audio = new AudioManager(this.settings);
    this.input = new Input(this.renderer.canvas, this.settings);
    this.ui = new UI(this.settings, {
      action: (a) => this.onAction(a),
      click: () => {
        this.audio.resume();
        this.audio.play('uiClick');
      },
      hover: () => this.audio.play('uiHover'),
      settingsChanged: (s) => {
        saveSettings(s);
        this.audio.applyVolumes();
      },
    });
    this.tutorial = new Tutorial(this.ui, this.sim);
    this.loop = new FixedLoop({ step: () => this.step(), render: (a, dt) => this.render(a, dt) });
    this.state = 'menu';
    this.time = 0;
    this.autopilot = null;
    this.firstRun = true;
    this.showDebug = new URLSearchParams(location.search).has('debug');
    this.fps = { frames: 0, acc: 0, value: 0 };

    this.input.handlers.restart = () => this.restartRoom();
    this.input.handlers.lockChange = (locked) => this.onLockChange(locked);
    this.timelineEditor = new TimelineEditor(this.sim, {
      onClose: () => this.closeTimeline(),
      onPreview: (echo, cursorTick) => this.view.setTimelinePreview(echo, cursorTick),
    });
    this.input.handlers.keyDown = (code) => {
      if (this.state === 'editing') {
        this.timelineEditor.handleKey(code);
        return true;
      }
      if (code === 'KeyT' && this.state === 'playing') {
        this.openTimeline();
        return true;
      }
      return false;
    };
    this.renderer.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
    });
    this.bindSimEvents();
    this.ui.show('menu');
    this.loop.start();
  }

  // ---------- state machine ----------

  onAction(action) {
    switch (action) {
      case 'play':
        this.ui.show('briefing');
        break;
      case 'begin':
        this.startGame(true);
        break;
      case 'resume':
        this.enterPlaying();
        break;
      case 'restart-room':
        this.restartRoom();
        this.enterPlaying();
        break;
      case 'quit':
        this.toMenu();
        break;
      case 'again':
        this.ui.fadeWhite(false);
        this.startGame(false);
        break;
    }
  }

  startGame(withTutorial) {
    this.audio.resume();
    this.audio.startMusic();
    this.sim.newGame();
    this.input.setLook(this.sim.player.yaw, 0);
    if (withTutorial && this.firstRun) this.tutorial.start();
    else this.tutorial.stop();
    this.firstRun = false;
    this.enterPlaying();
  }

  enterPlaying() {
    this.state = 'starting';
    this.ui.hideScreens();
    this.ui.showHUD(true);
    this.input.enabled = true;
    this.input.requestLock();
    clearTimeout(this.lockTimer);
    this.lockTimer = setTimeout(() => {
      if (this.state === 'starting') this.setPlaying();
    }, LOCK_FALLBACK_MS);
  }

  setPlaying() {
    this.state = 'playing';
    this.loop.simulating = true;
    this.input.enabled = true;
    this.ui.hideScreens();
    this.ui.showHUD(true);
  }

  pause() {
    this.state = 'paused';
    this.loop.simulating = false;
    this.input.enabled = false;
    this.ui.show('pause');
  }

  openTimeline() {
    const result = this.sim.openTimeline();
    if (!result.ok) {
      this.bus.emit('ability:blocked', { ability: 'timeline', reason: result.reason });
      return;
    }
    this.state = 'editing';
    this.loop.simulating = false;
    this.input.enabled = false;
    this.input.exitLock();
    this.timelineEditor.open(result.echo, result.remaining);
    this.bus.emit('timeline:open', { echo: result.echo });
  }

  closeTimeline() {
    if (this.state !== 'editing') return;
    this.view.clearTimelinePreview();
    this.enterPlaying();
  }

  toMenu() {
    this.input.exitLock();
    this.state = 'menu';
    this.loop.simulating = false;
    this.autopilot = null;
    this.tutorial.stop();
    this.sim.newGame();
    this.input.setLook(0, 0);
    this.ui.showHUD(false);
    this.ui.fadeWhite(false);
    this.ui.show('menu');
  }

  onLockChange(locked) {
    if (this.state === 'editing') return;
    if (locked) {
      if (this.state === 'starting' || this.state === 'paused') this.setPlaying();
    } else if (this.state === 'playing' && !this.autopilot) {
      this.pause();
    }
  }

  restartRoom() {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.sim.restartRoom();
  }

  // ---------- loop ----------

  step() {
    let input;
    if (this.autopilot) {
      input = this.autopilot.next();
      this.input.setLook(input.yaw, input.pitch);
      if (this.autopilot.done) {
        if (this.autopilot.error) console.warn(this.autopilot.error.message);
        this.autopilot = null;
      }
    } else {
      input = this.input.snapshot();
    }
    this.sim.step(input);
  }

  render(alpha, dt) {
    this.time += dt;
    const menu = this.state === 'menu';
    const look = menu ? { yaw: Math.sin(this.time * 0.12) * 0.55, pitch: 0.02 + Math.sin(this.time * 0.07) * 0.05 } : { yaw: this.input.yaw, pitch: this.input.pitch };
    this.view.render(alpha, dt, this.time, look);
    this.audio.setListener(this.sim.player.pos, look.yaw);
    if (!menu) {
      this.ui.update(this.sim);
      if (this.state === 'playing') this.tutorial.update(dt);
    }
    if (this.showDebug) this.updateDebug(dt);
  }

  updateDebug(dt) {
    const f = this.fps;
    f.frames++;
    f.acc += dt;
    if (f.acc >= 0.5) {
      f.value = f.frames / f.acc;
      f.frames = 0;
      f.acc = 0;
      const info = this.renderer.info.render;
      const p = this.sim.player.pos;
      this.ui.debug(
        `FPS ${f.value.toFixed(0)}  calls ${info.calls}  tris ${info.triangles}\n` +
          `room ${this.sim.room.index + 1} clock ${(this.sim.room.clock / TICK_RATE).toFixed(2)}s  state ${this.sim.state}/${this.state}\n` +
          `pos ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`,
      );
    }
  }

  // ---------- sim -> audio / UI ----------

  bindSimEvents() {
    const bus = this.bus;
    const a = this.audio;
    const ui = this.ui;
    bus.on('player:step', ({ sprint }) => a.play('step', { sprint }));
    bus.on('echo:step', ({ pos }) => a.play('step', { pos, echo: true }));
    bus.on('player:jump', () => a.play('jump'));
    bus.on('echo:jump', ({ pos }) => a.play('jump', { pos, echo: true }));
    bus.on('player:land', ({ impact }) => impact > 4 && a.play('land', { impact }));
    bus.on('switch:press', ({ pos, by }) => a.play('switch', { pos, echo: by === 'echo' }));
    bus.on('button:press', ({ pos, by }) => a.play('button', { pos, echo: by === 'echo' }));
    bus.on('button:expire', ({ pos }) => a.play('buttonExpire', { pos }));
    bus.on('plate:change', ({ plate, pressed }) => a.play(pressed ? 'plateOn' : 'plateOff', { pos: plate.pos }));
    bus.on('laser:toggle', ({ active, pos }) => a.play(active ? 'laserOn' : 'laserOff', { pos }));
    bus.on('door:move', ({ door, opening, pos }) => {
      a.play(opening ? 'doorOpen' : 'doorClose', { pos, heavy: door.role !== 'puzzle' });
      if (opening && door.role === 'exit' && this.sim.state === 'ending') {
        ui.banner('EMERGENCY EXIT OPEN', 'red');
        ui.setObjectiveDone('Get to the escape chamber.');
      }
    });
    bus.on('echo:spawn', ({ echo }) => {
      a.play('echoSpawn', { pos: echo.pos });
      ui.pulseCycle();
    });
    bus.on('echo:collapse', ({ echo, reason }) => {
      if (reason === 'cleared' || reason === 'sacrifice') return;
      a.play('echoCollapse', { pos: echo.pos });
      if (reason === 'paradox') ui.banner(`PARADOX // ECHO ${echo.serial} COLLAPSED`, 'red');
    });
    bus.on('node:activate', ({ node }) => a.play('nodeActivate', { pos: node.pos }));
    bus.on('echo:swap', () => {
      a.play('swap');
      ui.flash('rgba(95, 227, 255, 0.55)', 0.35);
      ui.flashAbility('swap');
    });
    bus.on('echo:freeze', ({ pos }) => {
      a.play('freeze', { pos });
      ui.flashAbility('freeze');
    });
    bus.on('echo:unfreeze', ({ pos }) => a.play('unfreeze', { pos }));
    bus.on('echo:blink', ({ pos }) => a.play('blink', { pos }));
    bus.on('echo:sacrifice', ({ pos }) => a.play('sacrifice', { pos }));
    bus.on('furnace:lit', ({ pos }) => a.play('furnaceLit', { pos }));
    bus.on('ability:blocked', ({ ability, reason }) => {
      a.play('blocked');
      ui.banner(`${ability.toUpperCase()} // ${reason}`, 'red');
    });
    bus.on('paradox:change', () => ui.bumpParadox());
    bus.on('room:complete', ({ final }) => {
      a.play('complete');
      if (!final) {
        ui.banner('ROOM CLEAR');
        ui.setObjectiveDone('Exit unlocked. Proceed.');
      }
    });
    bus.on('room:enter', ({ room }) => {
      ui.setRoom(room);
      a.setMusicIntensity(room.index / 7);
      if (room.kind === 'puzzle') {
        const code = String(room.cfg.id).padStart(2, '0');
        ui.toast(`ROOM ${code} // ${room.cfg.name}`, room.cfg.hint);
      }
    });
    bus.on('room:reset', ({ reason }) => {
      this.input.setLook(this.sim.player.yaw, 0);
      a.play('restart');
      ui.flash('rgba(95, 227, 255, 0.5)', 0.4);
      ui.banner(reason === 'death' ? 'TIMELINE RESET' : 'ROOM RESET', 'cyan');
    });
    bus.on('player:respawn', () => this.input.setLook(this.sim.player.yaw, 0));
    bus.on('player:death', ({ reason }) => {
      a.play('death');
      ui.flash('var(--red)', 0.7);
      ui.banner(reason === 'laser' ? 'LASER CONTACT' : 'FELL INTO THE VOID', 'red');
    });
    bus.on('cycle:warning', ({ seconds }) => a.play('tick', { last: seconds === 1 }));
    bus.on('ending:start', () => {
      a.play('powerDown');
      ui.banner('REACTOR ONLINE // LAB POWERING DOWN', 'red');
      ui.setObjectiveDone('Reach the emergency exit.');
      setTimeout(() => a.setMusicMode('alarm'), 2500);
    });
    bus.on('ending:escaped', ({ stats }) => {
      a.play('escape');
      ui.fadeWhite(true);
      setTimeout(() => {
        this.state = 'ended';
        this.loop.simulating = false;
        this.input.enabled = false;
        this.input.exitLock();
        ui.showEnd(stats);
        ui.fadeWhite(false);
      }, 1900);
    });
    bus.on('game:new', () => {
      a.setMusicMode('ambient');
      ui.setRoom(this.sim.room);
    });
    bus.on('hunter:alert', ({ hunter }) => a.play('hunterAlert', { pos: hunter.pos }));
    bus.on('hunter:strike', ({ pos }) => a.play('hunterStrike', { pos }));
    bus.on('timeline:open', () => a.play('editorOpen'));
    bus.on('timeline:edit', () => a.play('edit'));
    bus.on('echo:corrupt', () => {
      a.play('crackle');
      document.body.classList.add('corrupt');
      this.view.lightRig.flicker(0.3);
      setTimeout(() => document.body.classList.remove('corrupt'), 300);
    });
  }
}
