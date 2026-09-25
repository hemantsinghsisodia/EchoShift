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
