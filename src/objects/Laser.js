import { InteractiveObject } from './InteractiveObject.js';
import { makeBox, capsuleOverlapsBox } from '../physics/Collision.js';
import { TICK_RATE } from '../core/config.js';

/**
 * Laser barrier: a box-shaped beam volume. Deadly to the player while active (`activeWhen`,
 * default always). Echoes pass through harmlessly.
 * Optional `pulse: { period, on, offset }` (seconds) cycles it with the room clock; periods
 * should divide the 15 s echo cycle so replays see the same phase.
 */
export class Laser extends InteractiveObject {
  constructor(cfg, room) {
    const min = room.toWorld(cfg.min[0], cfg.min[1], cfg.min[2]);
    const max = room.toWorld(cfg.max[0], cfg.max[1], cfg.max[2]);
    super({ ...cfg, pos: [(cfg.min[0] + cfg.max[0]) / 2, cfg.min[1], (cfg.min[2] + cfg.max[2]) / 2] }, room);
    this.box = makeBox(min.x, min.y, min.z, max.x, max.y, max.z, this);
    this.hasCondition = cfg.activeWhen !== undefined;
    this.pulse = cfg.pulse
      ? {
          period: Math.round(cfg.pulse.period * TICK_RATE),
          on: Math.round(cfg.pulse.on * TICK_RATE),
          offset: Math.round((cfg.pulse.offset ?? 0) * TICK_RATE),
        }
      : null;
    this.active = !this.hasCondition;
  }

  pulseOn(tick) {
    if (!this.pulse) return true;
    const { period, on, offset } = this.pulse;
    return (((tick + offset) % period) + period) % period < on;
  }

  /** Seconds until the pulse state flips (for visuals); Infinity when not pulsing. */
  pulseRemaining() {
    if (!this.pulse) return Infinity;
    const { period, on, offset } = this.pulse;
    const t = (((this.room.clock + offset) % period) + period) % period;
    return (t < on ? on - t : period - t) / TICK_RATE;
  }

  actuate(ctx) {
    const next = (this.hasCondition ? !!this.condValue : true) && this.pulseOn(this.room.clock);
    if (next !== this.active) ctx.bus?.emit('laser:toggle', { laser: this, active: next, pos: this.pos, pulse: !!this.pulse });
    this.active = next;
    this.signal = next;
  }

  hits(player) {
    return this.active && capsuleOverlapsBox(player.pos, player.radius, player.height, this.box);
  }

  reset() {
    super.reset();
    this.active = !this.hasCondition;
    this.signal = this.active;
  }
}
