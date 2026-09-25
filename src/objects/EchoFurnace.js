import { InteractiveObject } from './InteractiveObject.js';

/**
 * Echo Furnace: a floor field that is harmless to the player but permanently destroys any Echo
 * that enters it. The first sacrifice latches its signal on for good (a one-time mechanism).
 */
export class EchoFurnace extends InteractiveObject {
  constructor(cfg, room) {
    super(cfg, room);
    this.size = cfg.size ?? [2, 2];
    this.lit = false;
    this.litTick = -Infinity;
    this.sacrifices = 0;
  }

  contains(p) {
    return (
      Math.abs(p.x - this.pos.x) <= this.size[0] / 2 &&
      Math.abs(p.z - this.pos.z) <= this.size[1] / 2 &&
      p.y >= this.pos.y - 0.5 &&
      p.y <= this.pos.y + 1.5
    );
  }

  sense(ctx) {
    for (const a of ctx.activators) {
      if (a.kind !== 'echo' || !a.isActivator || !this.contains(a.feet)) continue;
      ctx.onSacrifice?.(a, this);
      this.sacrifices++;
      if (!this.lit) {
        this.lit = true;
        this.litTick = this.room.clock;
        ctx.bus?.emit('furnace:lit', { furnace: this, pos: this.pos });
      }
    }
    this.signal = this.lit;
  }

  reset() {
    super.reset();
    this.lit = false;
    this.litTick = -Infinity;
    this.sacrifices = 0;
  }
}
