import { InteractiveObject } from './InteractiveObject.js';
import { makeBox } from '../physics/Collision.js';
import { TICK_RATE } from '../core/config.js';
import { smoothstep, v3, copy3 } from '../math/vec.js';

/**
 * Platform shuttling between A (pos) and B (to), driven purely by the room clock so an echo
 * replays against exactly the same platform phase it was recorded with (periods divide 15 s).
 * `pos` is the centre of the platform's top surface.
 */
export class MovingPlatform extends InteractiveObject {
  constructor(cfg, room) {
    super(cfg, room);
    this.isPlatform = true;
    this.index = -1;
    const to = cfg.to;
    this.a = v3(this.pos.x, this.pos.y, this.pos.z);
    this.b = room.toWorld(to[0], to[1] || 0, to[2]);
    this.size = cfg.size ?? [3, 3];
    this.thickness = cfg.thickness ?? 0.4;
    this.periodTicks = Math.round((cfg.period ?? 7.5) * TICK_RATE);
    this.pauseTicks = Math.round((cfg.pause ?? 1) * TICK_RATE);
    this.travelTicks = this.periodTicks / 2 - this.pauseTicks;
    this.prevPos = v3();
    this.delta = v3();
    this.phase = 'pauseA';
    this.phaseTime = 0;
    this.box = makeBox(0, 0, 0, 0, 0, 0, this);
    this.boxes = [this.box];
    this.setTick(0);
    copy3(this.prevPos, this.pos);
  }

  /** Position at a given room tick. */
  positionAt(tick, out) {
    const t = ((tick % this.periodTicks) + this.periodTicks) % this.periodTicks;
    const P = this.pauseTicks;
    const M = this.travelTicks;
    let u;
    if (t < P) {
      u = 0;
      this.phase = 'pauseA';
      this.phaseTime = t;
    } else if (t < P + M) {
      u = smoothstep((t - P) / M);
      this.phase = 'toB';
      this.phaseTime = t - P;
    } else if (t < 2 * P + M) {
      u = 1;
      this.phase = 'pauseB';
      this.phaseTime = t - P - M;
    } else {
      u = 1 - smoothstep((t - 2 * P - M) / M);
      this.phase = 'toA';
      this.phaseTime = t - 2 * P - M;
    }
    out.x = this.a.x + (this.b.x - this.a.x) * u;
    out.y = this.a.y + (this.b.y - this.a.y) * u;
    out.z = this.a.z + (this.b.z - this.a.z) * u;
    return out;
  }

  setTick(tick) {
    copy3(this.prevPos, this.pos);
    this.positionAt(tick, this.pos);
    this.delta.x = this.pos.x - this.prevPos.x;
    this.delta.y = this.pos.y - this.prevPos.y;
    this.delta.z = this.pos.z - this.prevPos.z;
    const hw = this.size[0] / 2;
    const hd = this.size[1] / 2;
    const b = this.box;
    b.min[0] = this.pos.x - hw;
    b.max[0] = this.pos.x + hw;
    b.min[1] = this.pos.y - this.thickness;
    b.max[1] = this.pos.y;
    b.min[2] = this.pos.z - hd;
    b.max[2] = this.pos.z + hd;
  }

  get moving() {
    return this.phase === 'toA' || this.phase === 'toB';
  }

  colliders() {
    return this.boxes;
  }

  reset() {
    super.reset();
    this.setTick(0);
    copy3(this.prevPos, this.pos);
    this.delta.x = this.delta.y = this.delta.z = 0;
  }
}
