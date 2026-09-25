import { InteractiveObject } from './InteractiveObject.js';
import { makeBox } from '../physics/Collision.js';
import { DT, DOOR_BLOCK_THRESHOLD, DOOR_WIDTH, TICK_RATE } from '../core/config.js';

/**
 * Sliding door driven by a logic condition (`opensWhen`). Blocks movement while mostly closed.
 * axis 'x': the door spans along X (sits in a wall of constant Z). axis 'z': spans along Z.
 */
export class Door extends InteractiveObject {
  constructor(cfg, room) {
    super(cfg, room);
    this.axis = cfg.axis ?? 'x';
    this.width = cfg.width ?? DOOR_WIDTH;
    this.doorHeight = cfg.height ?? 3.2;
    this.thickness = cfg.thickness ?? 0.35;
    this.openTime = cfg.openTime ?? 0.5;
    this.closeTime = cfg.closeTime ?? 0.5;
    this.sealed = !!cfg.sealed;
    this.delayTicks = Math.round((cfg.openDelay ?? 0) * TICK_RATE);
    this.role = cfg.role ?? 'puzzle';
    this.locked = false;
    this.openAmount = 0;
    this.wantOpen = false;
    this.wantSince = 0;
    const hw = this.width / 2;
    const ht = this.thickness / 2;
    const { x, y, z } = this.pos;
    this.box =
      this.axis === 'x'
        ? makeBox(x - hw, y, z - ht, x + hw, y + this.doorHeight, z + ht, this)
        : makeBox(x - ht, y, z - hw, x + ht, y + this.doorHeight, z + hw, this);
    this.boxes = [this.box];
  }

  get blocking() {
    return this.openAmount < DOOR_BLOCK_THRESHOLD;
  }

  get isOpen() {
    return !this.blocking;
  }

  actuate(ctx) {
    const want = !this.sealed && !this.locked && !!this.condValue;
    if (want !== this.wantOpen) {
      this.wantOpen = want;
      this.wantSince = this.room.clock;
      if (!want || this.delayTicks === 0) ctx.bus?.emit('door:move', { door: this, opening: want, pos: this.pos });
    }
    const delayed = want && this.room.clock - this.wantSince < this.delayTicks;
    if (want && this.delayTicks > 0 && this.room.clock - this.wantSince === this.delayTicks) {
      ctx.bus?.emit('door:move', { door: this, opening: true, pos: this.pos });
    }
    const target = want && !delayed ? 1 : 0;
    const wasBlocking = this.blocking;
    if (target > this.openAmount) this.openAmount = Math.min(1, this.openAmount + DT / this.openTime);
    else if (target < this.openAmount) this.openAmount = Math.max(0, this.openAmount - DT / this.closeTime);
    this.signal = !this.blocking;
    if (wasBlocking !== this.blocking) ctx.bus?.emit(this.blocking ? 'door:closed' : 'door:opened', { door: this, pos: this.pos });
  }

  /** Force the door shut; it animates closed over the following ticks. */
  lock() {
    this.locked = true;
  }

  colliders() {
    return this.blocking ? this.boxes : NONE;
  }

  reset() {
    super.reset();
    this.openAmount = 0;
    this.wantOpen = false;
    this.wantSince = 0;
  }
}

const NONE = [];
