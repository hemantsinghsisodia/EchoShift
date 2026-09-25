/** Invisible axis-aligned trigger volume (room entry, escape chamber). */
export class Trigger {
  constructor(kind, min, max, data = {}) {
    this.kind = kind;
    this.min = min;
    this.max = max;
    this.data = data;
  }

  contains(p) {
    return (
      p.x >= this.min.x && p.x <= this.max.x &&
      p.z >= this.min.z && p.z <= this.max.z &&
      p.y >= this.min.y - 0.5 && p.y <= this.max.y
    );
  }
}
