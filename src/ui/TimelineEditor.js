import { CYCLE_TICKS, TIMELINE, TICK_RATE } from '../core/config.js';
import { EDIT_TYPES } from '../echo/TimelineEdits.js';

const $ = (id) => document.getElementById(id);
const HELP = 'A/D SELECT TIME · 1-4 SELECT EDIT · ENTER APPLY · T CLOSE';
const HELP_TOUCH = 'TAP TIME · TAP EDIT · APPLY · CLOSE';

export class TimelineEditor {
  constructor(sim, { onClose, onPreview } = {}) {
    this.sim = sim;
    this.onClose = onClose;
    this.onPreview = onPreview;
    this.root = $('timeline-editor');
    this.isOpen = false;
    this.cursorTick = 0;
    this.selected = 'delete';
    this.echo = null;
    this.bindTouch();
  }

  bindTouch() {
    const track = $('timeline-track');
    const scrub = (e) => {
      if (!this.isOpen) return;
      const rect = track.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const tick = Math.round((t * CYCLE_TICKS) / TIMELINE.cursorStepTicks) * TIMELINE.cursorStepTicks;
      this.cursorTick = Math.max(0, Math.min(CYCLE_TICKS - TIMELINE.sectionTicks, tick));
      this.render();
    };
    track.addEventListener('pointerdown', (e) => {
      if (!this.isOpen) return;
      scrub(e);
      const move = (ev) => scrub(ev);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    $('timeline-ops').addEventListener('click', (e) => {
      const op = e.target.closest('[data-type]');
      if (!op || !this.isOpen) return;
      const index = EDIT_TYPES.indexOf(op.dataset.type);
      if (index >= 0) this.handleKey(`Digit${index + 1}`);
    });
    $('timeline-apply').addEventListener('click', () => { if (this.isOpen) this.handleKey('Enter'); });
    $('timeline-close').addEventListener('click', () => { if (this.isOpen) this.handleKey('KeyT'); });
  }

  open(echo, remaining) {
    this.echo = echo;
    this.remaining = { ...remaining };
    this.cursorTick = Math.ceil(echo.timeline.trackTick / TIMELINE.cursorStepTicks) * TIMELINE.cursorStepTicks;
    this.cursorTick = Math.max(0, Math.min(CYCLE_TICKS - TIMELINE.sectionTicks, this.cursorTick));
    this.selected = EDIT_TYPES.find((type) => (this.remaining[type] ?? 0) > 0) ?? 'delete';
    this.isOpen = true;
    this.root.classList.remove('hidden');
    const message = $('timeline-message');
    message.textContent = document.body.classList.contains('touch') ? HELP_TOUCH : HELP;
    message.classList.remove('error');
    this.render();
  }

  close() {
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.onClose?.();
  }

  handleKey(code) {
    if (code === 'KeyT' || code === 'Escape') return this.close();
    if (code === 'KeyA') this.cursorTick -= TIMELINE.cursorStepTicks;
    if (code === 'KeyD') this.cursorTick += TIMELINE.cursorStepTicks;
    if (code.startsWith('Digit')) {
      const i = Number(code.slice(-1)) - 1;
      if (EDIT_TYPES[i]) this.selected = EDIT_TYPES[i];
    }
    this.cursorTick = Math.max(0, Math.min(CYCLE_TICKS - TIMELINE.sectionTicks, this.cursorTick));
    if (code === 'Enter') {
      const result = this.sim.timelineEdits.apply(this.echo, this.selected, this.cursorTick);
      $('timeline-message').textContent = result.ok ? `${this.selected.toUpperCase()} APPLIED` : result.reason;
      $('timeline-message').classList.toggle('error', !result.ok);
      if (result.ok) this.remaining = { ...this.sim.timelineEdits.remaining };
    }
    this.render();
  }

  render() {
    $('timeline-echo').textContent = `ECHO ${this.echo.serial}`;
    $('timeline-time').textContent = `${(this.cursorTick / TICK_RATE).toFixed(1)}s`;
    $('timeline-cursor').style.left = `${(this.cursorTick / CYCLE_TICKS) * 100}%`;
    $('timeline-selection').style.left = `${(this.cursorTick / CYCLE_TICKS) * 100}%`;
    $('timeline-played').style.width = `${(this.echo.timeline.trackTick / CYCLE_TICKS) * 100}%`;
    $('timeline-markers').innerHTML = this.echo.track.events
      .map((event) => `<i class="${event.type}" style="left:${(event.tick / CYCLE_TICKS) * 100}%"></i>`)
      .join('');
    $('timeline-ops').innerHTML = EDIT_TYPES.map((type, index) => {
      const count = this.remaining[type] ?? 0;
      return `<button type="button" data-type="${type}" class="timeline-op ${count ? 'allowed' : ''} ${type === this.selected ? 'selected' : ''}">${index + 1} ${type.toUpperCase()} ×${count}</button>`;
    }).join('');
    this.onPreview?.(this.echo, this.cursorTick);
  }
}
