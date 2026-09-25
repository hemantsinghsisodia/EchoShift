/** Trauma-based camera shake: offset = trauma^2 * smooth noise; trauma decays over time. */
export class CameraShake {
  constructor() {
    this.trauma = 0;
    this.sustained = 0;
    this.t = 0;
    this.offset = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };
  }

  add(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - 1.4 * dt);
    const k = this.trauma * this.trauma + this.sustained;
    const t = this.t;
    const n = (a, b, c) => Math.sin(t * a + c) * 0.6 + Math.sin(t * b + c * 1.7) * 0.4;
    const o = this.offset;
    o.x = n(23.1, 37.7, 1.1) * 0.05 * k;
    o.y = n(29.3, 41.9, 2.3) * 0.05 * k;
    o.z = n(19.7, 33.1, 3.7) * 0.03 * k;
    o.pitch = n(31.1, 47.3, 4.1) * 0.02 * k;
    o.yaw = n(27.7, 43.9, 5.3) * 0.02 * k;
    o.roll = n(21.3, 39.1, 6.7) * 0.03 * k;
    return o;
  }
}
