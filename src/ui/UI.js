import { CYCLE_SECONDS } from '../core/config.js';
import { Stats } from '../core/Stats.js';

const $ = (id) => document.getElementById(id);
const RING_LEN = 2 * Math.PI * 42;
const SCREENS = ['menu', 'howto', 'settings', 'briefing', 'pause', 'end', 'loading'];

/** DOM overlay: menus, HUD, prompts, toasts, banners and the end screen. Writes DOM only on change. */
export class UI {
  constructor(settings, handlers) {
    this.settings = settings;
    this.handlers = handlers;
    this.el = {
      hud: $('hud'),
      room: $('hud-room'),
      roomName: $('hud-room-name'),
      objective: $('hud-objective'),
      cycle: document.querySelector('.cycle'),
      ring: $('cycle-ring'),
      time: $('cycle-time'),
      echoCount: $('hud-echo-count'),
      pips: $('echo-pips'),
      crosshair: $('crosshair'),
      prompt: $('prompt'),
      promptText: $('prompt-text'),
      toast: $('toast'),
      toastHead: $('toast-head'),
      toastBody: $('toast-body'),
      tutorial: $('tutorial'),
      tutText: $('tut-text'),
      tutStep: $('tut-step'),
      banner: $('banner'),
      flash: $('flash'),
      fade: $('fade'),
      debug: $('debug-overlay'),
      abilities: $('abilities'),
      ab_swap: $('ab-swap'),
      ab_freeze: $('ab-freeze'),
      paradox: $('paradox'),
      paradoxValue: $('paradox-value'),
    };
    this.cache = {};
    this.settingsReturn = 'menu';
    this.toastTimer = null;
    this.bannerTimer = null;

    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.click?.();
        this.onAction(btn.dataset.action);
      });
      btn.addEventListener('mouseenter', () => handlers.hover?.());
    });
    this.bindSettings();
  }

  onAction(action) {
    if (action === 'howto') return this.show('howto');
    if (action === 'settings') {
      this.settingsReturn = this.current === 'pause' ? 'pause' : 'menu';
      return this.show('settings');
    }
    if (action === 'back') return this.show(this.current === 'settings' ? this.settingsReturn : 'menu');
    this.handlers.action?.(action);
  }

  bindSettings() {
    const bind = (id, out, key, fmt) => {
      const input = $(id);
      const o = $(out);
      input.value = this.settings[key];
      o.textContent = fmt(this.settings[key]);
      input.addEventListener('input', () => {
        this.settings[key] = parseFloat(input.value);
        o.textContent = fmt(this.settings[key]);
        this.handlers.settingsChanged?.(this.settings);
      });
    };
    const pct = (v) => `${Math.round(v * 100)}%`;
    bind('set-master', 'out-master', 'master', pct);
    bind('set-music', 'out-music', 'music', pct);
    bind('set-sens', 'out-sens', 'sensitivity', (v) => `${v.toFixed(2)}x`);
  }

  show(id) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
    this.current = id;
  }

  hideScreens() {
    for (const s of SCREENS) $(s).classList.add('hidden');
    this.current = null;
  }

  showHUD(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  setRoom(room) {
    const code = String(room.cfg.id).padStart(2, '0');
    this.set('room', this.el.room, room.kind === 'escape' ? 'EXIT' : `ROOM ${code}`);
    this.set('roomName', this.el.roomName, room.cfg.name);
    this.set('objective', this.el.objective, room.cfg.objective);
    this.el.objective.classList.remove('done');
    this.cache.pips = null;
  }

  setObjectiveDone(text) {
    this.set('objective', this.el.objective, text);
    this.el.objective.classList.add('done');
  }

  update(sim) {
    const room = sim.room;
    const recording = sim.recording;
    const remaining = sim.cycleRemaining;
    let cls = 'cycle';
    if (!recording) cls += ' idle';
    else if (remaining <= 3) cls += ' warn';
    if (this.spawnPop > 0) cls += ' spawn';
    this.set('cycleCls', this.el.cycle, cls, 'className');
    const timeHtml = recording ? `${remaining.toFixed(1).padStart(4, '0')}<span>s</span>` : room.kind === 'escape' || sim.state === 'ending' ? 'EXIT' : 'CLEAR';
    this.set('time', this.el.time, timeHtml, 'innerHTML');
    const frac = recording ? remaining / CYCLE_SECONDS : 1;
    this.set('ring', this.el.ring.style, `${(RING_LEN * (1 - frac)).toFixed(1)}`, 'strokeDashoffset');

    const count = sim.echoes.count;
    const max = room.maxEchoes;
    this.set('echoCount', this.el.echoCount, `${count}/${max}`);
    const pipKey = `${count}/${max}`;
    if (this.cache.pips !== pipKey) {
      this.cache.pips = pipKey;
      this.el.pips.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < count ? 'on' : ''}"></i>`).join('');
    }

    const live = sim.state === 'playing' || sim.state === 'ending';
    const t = live ? sim.target : null;
    const echo = live && !t ? sim.echoTarget : null;
    let html = '';
    if (t) {
      const label = t.type === 'node' ? `CHARGE ${t.label}` : t.type === 'button' ? 'PRESS BUTTON' : t.mode === 'toggle' ? 'TOGGLE SWITCH' : 'PRESS SWITCH';
      html = `<b>E</b>${label}`;
    } else if (echo) {
      const parts = [];
      if (sim.abilities.allowed('swap')) parts.push(`<b>Q</b>SWAP ECHO ${echo.serial}`);
      if (sim.abilities.allowed('freeze')) parts.push(`<b>F</b>FREEZE`);
      html = parts.join('<span class="sep">|</span>');
    }
    this.set('prompt', this.el.promptText, html, 'innerHTML');
    this.set('promptVis', this.el.prompt, html ? (echo ? 'echo' : '') : 'hidden', 'className');
    this.set('cross', this.el.crosshair, t || echo ? 'target' : '', 'className');

    this.updateAbilities(sim);
    this.updateParadox(sim.paradox);
  }

  updateAbilities(sim) {
    const ab = sim.abilities;
    const any = ab.anyAllowed;
    this.set('abVis', this.el.abilities, any ? 'abilities' : 'abilities hidden', 'className');
    if (!any) return;
    for (const name of ['swap', 'freeze']) {
      const el = this.el[`ab_${name}`];
      const allowed = ab.allowed(name);
      const cd = ab.cooldown(name);
      this.set(`abShow_${name}`, el.style, allowed ? '' : 'none', 'display');
      this.set(`abCool_${name}`, el, `ability${cd > 0 ? ' cooling' : ''}`, 'className');
      this.set(`abBar_${name}`, el.querySelector('.cd').style, `scaleX(${(1 - cd).toFixed(3)})`, 'transform');
    }
  }

  updateParadox(paradox) {
    this.set('pxVis', this.el.paradox, paradox.visible ? 'paradox' : 'paradox hidden', 'className');
    this.set('pxVal', this.el.paradoxValue, `${paradox.percent}%`);
  }

  bumpParadox() {
    const el = this.el.paradox;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  flashAbility(name) {
    const el = this.el[`ab_${name}`];
    el.classList.remove('used');
    void el.offsetWidth;
    el.classList.add('used');
    this.cache[`abCool_${name}`] = null;
  }

  pulseCycle() {
    this.spawnPop = 1;
    clearTimeout(this.popTimer);
    this.popTimer = setTimeout(() => (this.spawnPop = 0), 500);
  }

  toast(head, body, ms = 5200) {
    const t = this.el.toast;
    this.el.toastHead.textContent = head;
    this.el.toastBody.textContent = body;
    t.classList.remove('hidden', 'out');
    void t.offsetWidth;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      t.classList.add('out');
      this.toastTimer = setTimeout(() => t.classList.add('hidden'), 600);
    }, ms);
  }

  banner(text, cls = '') {
    const b = this.el.banner;
    b.textContent = text;
    b.className = cls;
    void b.offsetWidth;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), 2400);
  }

  tutorial(html, step = '') {
    if (!html) {
      this.el.tutorial.classList.add('hidden');
      return;
    }
    this.el.tutText.innerHTML = html;
    this.el.tutStep.textContent = step;
    this.el.tutorial.classList.remove('hidden');
    this.el.tutorial.style.animation = 'none';
    void this.el.tutorial.offsetWidth;
    this.el.tutorial.style.animation = '';
  }

  flash(color = 'var(--red)', strength = 0.55) {
    const f = this.el.flash;
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = String(strength);
    void f.offsetWidth;
    f.style.transition = 'opacity 0.7s ease-out';
    f.style.opacity = '0';
  }

  fadeWhite(on) {
    this.el.fade.style.transition = on ? 'opacity 1.6s ease-in' : 'opacity 0.8s ease-out';
    this.el.fade.style.opacity = on ? '1' : '0';
  }

  showEnd(summary) {
    $('stat-time').textContent = Stats.formatTime(summary.totalSeconds);
    $('stat-echoes').textContent = String(summary.echoesCreated);
    $('stat-rooms').textContent = `${summary.roomsCompleted}/${summary.roomCount}`;
    $('stat-restarts').textContent = String(summary.restarts);
    this.showHUD(false);
    this.show('end');
  }

  debug(text) {
    this.el.debug.classList.remove('hidden');
    this.el.debug.textContent = text;
  }
}
