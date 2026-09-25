import { InteractiveObject } from './InteractiveObject.js';

/** Active while any grounded activator (player or echo) stands on it. */
export class PressurePlate extends InteractiveObject {
  constructor(cfg, room) {
    super(cfg, room);
    this.size = cfg.size ?? 1.6;
    this.occupants = 0;
  }

  contains(a) {
    const h = this.size / 2 + 0.1;
    return (
      a.grounded &&
      Math.abs(a.feet.x - this.pos.x) <= h &&
      Math.abs(a.feet.z - this.pos.z) <= h &&
      Math.abs(a.feet.y - this.pos.y) < 0.35
    );
  }

  sense(ctx) {
    let n = 0;
    for (const a of ctx.activators) if (this.contains(a)) n++;
    const pressed = n > 0;
    if (pressed !== this.signal) ctx.bus?.emit('plate:change', { plate: this, pressed });
    this.occupants = n;
    this.signal = pressed;
  }

  reset() {
    super.reset();
    this.occupants = 0;
  }
}
