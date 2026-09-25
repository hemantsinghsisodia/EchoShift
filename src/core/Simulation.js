import { EventBus } from './EventBus.js';
import { Stats } from './Stats.js';
import { CYCLE_TICKS, DEATH_DELAY_TICKS, TICK_RATE } from './config.js';
import { idleInput } from './Input.js';
import { buildLab } from '../puzzle/LabLayout.js';
import { RoomManager } from '../puzzle/RoomManager.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { Player } from '../player/Player.js';
import { findTarget, tryInteract } from '../player/Interaction.js';
import { EchoRecorder } from '../echo/EchoRecorder.js';
import { EchoManager } from '../echo/EchoManager.js';
import { EchoAbilities } from '../echo/EchoAbilities.js';
import { Paradox } from './Paradox.js';
import { ABILITIES, PARADOX_COST } from './config.js';
import { ROOM_CONFIGS, PUZZLE_ROOM_COUNT } from '../rooms/index.js';

/**
 * Headless, deterministic 60 Hz game simulation. No rendering or audio imports:
 * views subscribe to `bus` events and read state each frame.
 *
 * Tick order: platforms -> player -> interaction -> record -> echoes -> sensors -> logic
 *             -> actuators -> hazards -> triggers -> echo cycle.
 */
export class Simulation {
  constructor({ bus = new EventBus(), roomConfigs = ROOM_CONFIGS } = {}) {
    this.bus = bus;
    const lab = buildLab(roomConfigs);
    this.rooms = lab.rooms;
    this.corridors = lab.corridors;
    this.world = new PhysicsWorld(this.rooms, lab.corridorBoxes);
    this.puzzleRoomCount = roomConfigs === ROOM_CONFIGS ? PUZZLE_ROOM_COUNT : this.rooms.filter((r) => r.kind === 'puzzle').length;
    this.player = new Player(bus);
    this.recorder = new EchoRecorder();
    this.echoes = new EchoManager(bus);
    this.roomManager = new RoomManager(this);
    this.stats = new Stats();
    this.tick = 0;
    this.cycleTick = 0;
    this.state = 'playing';
    this.deathTimer = 0;
    this.endingTick = 0;
    this.godMode = false;
    this.target = null;
    this.echoTarget = null;
    this.lastInteracted = null;
    this.activators = [];
    this.paradox = new Paradox(bus);
    this.abilities = new EchoAbilities(this);
    bus.on('echo:collapse', ({ reason }) => {
      if (reason === 'paradox') this.paradox.add(PARADOX_COST.collapse, 'collapse');
    });

    this.ctx = {
      bus,
      activators: this.activators,
      onObjective: () => this.roomManager.complete(this.room),
      onSacrifice: (echo, device) => this.sacrifice(echo, device),
    };
    this.echoCtx = {
      platforms: [],
      doors: [],
      onEvent: (echo, ev) => this.replayEvent(echo, ev),
      onStep: (echo) => bus.emit('echo:step', { echo, pos: echo.pos }),
      onUnfreeze: (echo) => bus.emit('echo:unfreeze', { echo, pos: echo.pos }),
    };
    this.roomManager.begin(0);
  }

  get room() {
    return this.roomManager.current;
  }

  get cycleRemaining() {
    return (CYCLE_TICKS - this.cycleTick) / TICK_RATE;
  }

  get recording() {
    return this.recorder.active;
  }

  newGame() {
    this.stats.reset();
    this.paradox.reset();
    this.abilities.reset();
    this.state = 'playing';
    this.tick = 0;
    this.endingTick = 0;
    this.roomManager.begin(0);
    this.bus.emit('game:new', {});
  }

  step(input = idleInput(this.player.yaw, this.player.pitch)) {
    if (this.state === 'escaped') return;
    this.tick++;
    this.stats.ticks++;

    if (this.state === 'dying') {
      if (--this.deathTimer <= 0) this.roomManager.restart('death');
      return;
    }

    const room = this.room;
    room.clock++;
    if (this.recorder.active) this.cycleTick++;

    room.updatePlatforms();

    const player = this.player;
    const { jumped } = player.update(input, this.world, 1 / TICK_RATE);
    if (jumped) this.recorder.recordEvent(this.cycleTick, 'jump');

    this.target = findTarget(player, room.interactables);
    if (input.interact && this.target) {
      this.lastInteracted = this.target;
      this.target.interact(player, this.ctx);
      this.recorder.recordEvent(this.cycleTick, 'interact', this.target.id);
      this.target = findTarget(player, room.interactables);
    }

    if (this.abilities.anyAllowed) {
      if (input.swap) this.abilities.trySwap();
      if (input.freeze) this.abilities.tryFreeze();
      this.echoTarget = this.abilities.target(Math.max(ABILITIES.swapRange, ABILITIES.freezeRange));
    } else {
      this.echoTarget = null;
    }

    this.recorder.record(this.cycleTick, player);

    this.echoCtx.platforms = room.platforms;
    this.echoCtx.doors = room.doors;
    this.echoes.update(this.echoCtx);

    this.activators.length = 0;
    this.activators.push(player);
    for (const e of this.echoes.echoes) if (e.isActivator) this.activators.push(e);

    room.sense(this.ctx);
    room.evaluate();
    room.actuate(this.ctx);
    const prev = this.rooms[room.index - 1];
    if (prev) for (const d of prev.doors) d.actuate(this.ctx);

    this.checkHazards();
    if (this.state === 'dying') return;

    this.roomManager.checkTriggers();

    if (this.recorder.active && this.cycleTick >= CYCLE_TICKS) {
      const track = this.recorder.finish(this.cycleTick, player);
      this.echoes.spawn(track, this.room.maxEchoes, this.room.platforms);
      this.stats.echoesCreated++;
      this.recorder.start(player);
      this.cycleTick = 0;
    } else if (this.recorder.active) {
      const remaining = CYCLE_TICKS - this.cycleTick;
      if (remaining % TICK_RATE === 0 && remaining <= 3 * TICK_RATE) this.bus.emit('cycle:warning', { seconds: remaining / TICK_RATE });
    }

    if (this.state === 'ending') this.endingTick++;
  }

  replayEvent(echo, ev) {
    if (ev.type === 'interact') {
      const obj = this.room.byId[ev.targetId];
      tryInteract(echo, obj, this.ctx);
    } else if (ev.type === 'jump') {
      this.bus.emit('echo:jump', { echo, pos: echo.pos });
    } else if (ev.type === 'swap') {
      this.bus.emit('echo:blink', { echo, pos: echo.pos });
    }
  }

  sacrifice(echo, device) {
    if (!echo.isActivator) return;
    echo.collapse('sacrifice');
    this.paradox.add(PARADOX_COST.sacrifice, 'sacrifice');
    this.bus.emit('echo:collapse', { echo, reason: 'sacrifice' });
    this.bus.emit('echo:sacrifice', { echo, device, pos: { ...echo.pos } });
  }

  checkHazards() {
    const player = this.player;
    if (player.fellOut) return this.kill('fall');
    if (this.godMode) return;
    for (const laser of this.room.lasers) if (laser.hits(player)) return this.kill('laser');
  }

  kill(reason) {
    if (this.state !== 'playing') {
      if (this.state === 'ending' && reason === 'fall') {
        const s = this.room.spawn;
        this.player.teleport(s.x, s.y, s.z, s.yaw);
        this.bus.emit('player:respawn', {});
      }
      return;
    }
    this.state = 'dying';
    this.deathTimer = DEATH_DELAY_TICKS;
    this.player.dead = true;
    this.bus.emit('player:death', { reason, pos: { ...this.player.pos } });
  }

  restartRoom() {
    if (this.state === 'dying') return false;
    return this.roomManager.restart('manual');
  }

  startEnding() {
    this.state = 'ending';
    this.endingTick = 0;
    this.bus.emit('ending:start', {});
  }

  escape() {
    this.state = 'escaped';
    this.bus.emit('ending:escaped', { stats: this.summary() });
  }

  summary() {
    return {
      totalSeconds: this.stats.totalSeconds,
      echoesCreated: this.stats.echoesCreated,
      roomsCompleted: this.stats.roomsCompleted,
      roomCount: this.puzzleRoomCount,
      restarts: this.stats.restarts,
    };
  }
}
