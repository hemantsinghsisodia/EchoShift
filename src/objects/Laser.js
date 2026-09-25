import { InteractiveObject } from './InteractiveObject.js';
import { makeBox, capsuleOverlapsBox } from '../physics/Collision.js';

/**
 * Laser barrier: a box-shaped beam volume. Deadly to the player while active (`activeWhen`,
 * default always). Echoes pass through harmlessly.
 */
export class Laser extends InteractiveObject {
  constructor(cfg, room) {
    const min = room.toWorld(cfg.min[0], cfg.min[1], cfg.min[2]);
    const max = room.toWorld(cfg.max[0], cfg.max[1], cfg.max[2]);
    super({ ...cfg, pos: [(cfg.min[0] + cfg.max[0]) / 2, cfg.min[1], (cfg.min[2] + cfg.max[2]) / 2] }, room);
    this.box = makeBox(min.x, min.y, min.z, max.x, max.y, max.z, this);
    this.hasCondition = cfg.activeWhen !== undefined;
    this.active = !this.hasCondition;
  }

  actuate(ctx) {
    const next = this.hasCondition ? !!this.condValue : true;
    if (next !== this.active) ctx.bus?.emit('laser:toggle', { laser: this, active: next, pos: this.pos });
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
