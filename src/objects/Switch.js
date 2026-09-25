import { Console } from './Console.js';
import { TICK_RATE } from '../core/config.js';

/**
 * mode 'toggle': each press flips the state.
 * mode 'pulse' : a press makes the signal true for a short pulse (used with sync()).
 */
export class Switch extends Console {
  constructor(cfg, room) {
    super(cfg, room);
    this.mode = cfg.mode ?? 'toggle';
    this.pulseTicks = Math.round((cfg.pulse ?? 0.6) * TICK_RATE);
    this.on = false;
    this.broken = false;
    this.pulseUntil = -Infinity;
  }

  interact(actor, ctx) {
    if (this.mode === 'breaker' && this.broken) return;
    const t = this.room.clock;
    this.lastPressTick = t;
    this.lastPressBy = actor.kind;
    if (this.mode === 'breaker') {
      if (this.on) {
        this.on = false;
        this.broken = true;
      } else {
        this.on = true;
      }
    } else if (this.mode === 'toggle') {
      this.on = !this.on;
    } else {
      this.pulseUntil = t + this.pulseTicks;
    }
    ctx.bus?.emit('switch:press', { obj: this, by: actor.kind, pos: this.pos });
  }

  sense() {
    this.signal = this.mode === 'pulse' ? this.room.clock < this.pulseUntil : this.on;
  }

  reset() {
    super.reset();
    this.on = false;
    this.broken = false;
    this.pulseUntil = -Infinity;
  }
}
