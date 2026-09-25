import { InteractiveObject } from './InteractiveObject.js';
import { makeBox } from '../physics/Collision.js';

/** Base for free-standing interactable consoles (switches, timed buttons): adds a small solid pedestal. */
export class Console extends InteractiveObject {
  constructor(cfg, room) {
    super(cfg, room);
    this.interactable = true;
    this.lastPressTick = -Infinity;
    this.lastPressBy = null;
    const s = 0.25;
    this.box = makeBox(this.pos.x - s, this.pos.y, this.pos.z - s, this.pos.x + s, this.pos.y + 1.1, this.pos.z + s, this);
    this.boxes = [this.box];
    const c = room.center;
    this.facingYaw = Math.atan2(c.x - this.pos.x, c.z - this.pos.z);
    if (cfg.facing !== undefined) this.facingYaw = cfg.facing;
  }

  canInteract() {
    return true;
  }

  colliders() {
    return this.boxes;
  }

  reset() {
    super.reset();
    this.lastPressTick = -Infinity;
    this.lastPressBy = null;
  }
}
