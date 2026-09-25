import { segmentHitsBox } from './Collision.js';

/**
 * Collects colliders from every room and corridor. Static boxes never change;
 * dynamic boxes (doors, platforms, consoles) are queried from their owners each tick.
 */
export class PhysicsWorld {
  constructor(rooms, corridorBoxes = []) {
    this.rooms = rooms;
    this.staticBoxes = [...corridorBoxes];
    for (const room of rooms) this.staticBoxes.push(...room.staticBoxes);
    this.scratch = [];
  }

  /**
   * True if nothing solid lies between a and b. Glass boxes are transparent; doors count
   * only while blocking (they only report colliders then).
   */
  lineOfSight(a, b) {
    const lo = [Math.min(a.x, b.x), Math.min(a.z, b.z)];
    const hi = [Math.max(a.x, b.x), Math.max(a.z, b.z)];
    const test = (box) => {
      if (box.glass) return false;
      if (box.max[0] < lo[0] || box.min[0] > hi[0] || box.max[2] < lo[1] || box.min[2] > hi[1]) return false;
      return segmentHitsBox(a, b, box);
    };
    for (const box of this.staticBoxes) if (test(box)) return false;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const reach = Math.hypot(b.x - a.x, b.z - a.z) / 2 + 2;
    for (const room of this.rooms) {
      if (!room.nearXZ(mx, mz, reach)) continue;
      for (const box of room.dynamicBoxes()) {
        if (box.owner?.isPlatform || box.owner?.type === 'button' || box.owner?.type === 'switch' || box.owner?.type === 'node') continue;
        if (test(box)) return false;
      }
    }
    return true;
  }

  /** Boxes near a point (cheap broadphase by distance to box). */
  query(x, z, range = 4) {
    const out = this.scratch;
    out.length = 0;
    const add = (b) => {
      if (x < b.min[0] - range || x > b.max[0] + range) return;
      if (z < b.min[2] - range || z > b.max[2] + range) return;
      out.push(b);
    };
    for (let i = 0; i < this.staticBoxes.length; i++) add(this.staticBoxes[i]);
    for (const room of this.rooms) {
      if (!room.nearXZ(x, z, range + 2)) continue;
      for (const b of room.dynamicBoxes()) add(b);
    }
    return out;
  }
}
