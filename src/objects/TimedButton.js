import { Console } from './Console.js';
import { TICK_RATE } from '../core/config.js';

/** Stays active for `duration` seconds after each press (a press restarts the timer). */
export class TimedButton extends Console {
  constructor(cfg, room) {
    super(cfg, room);
    this.durationTicks = Math.round((cfg.duration ?? 3) * TICK_RATE);
    this.activeUntil = -Infinity;
  }

  interact(actor, ctx) {
    const t = this.room.clock;
    this.lastPressTick = t;
    this.lastPressBy = actor.kind;
    this.activeUntil = t + this.durationTicks;
    ctx.bus?.emit('button:press', { obj: this, by: actor.kind, pos: this.pos });
  }

  get remaining() {
    return Math.max(0, (this.activeUntil - this.room.clock) / this.durationTicks);
  }

  sense(ctx) {
    const was = this.signal;
    this.signal = this.room.clock < this.activeUntil;
    if (was && !this.signal) ctx.bus?.emit('button:expire', { obj: this, pos: this.pos });
  }

  reset() {
    super.reset();
    this.activeUntil = -Infinity;
  }
}
