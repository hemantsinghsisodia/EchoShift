export class Resonance {
  constructor() {
    this.cellsBySerial = new Map();
  }

  reset() {
    this.cellsBySerial.clear();
  }

  key(x, z) {
    return `${Math.round(x)},${Math.round(z)}`;
  }

  markOlderCell(serial, x, z) {
    if (!this.cellsBySerial.has(serial)) this.cellsBySerial.set(serial, new Set());
    this.cellsBySerial.get(serial).add(this.key(x, z));
  }

  register(echo) {
    const cells = new Set();
    const out = {};
    const cursor = { i: 0 };
    for (let tick = 0; tick <= echo.track.lengthTicks; tick += 30) {
      echo.track.sample(tick, cursor, [], out);
      cells.add(this.key(out.x, out.z));
    }
    if (echo.track.lengthTicks % 30 !== 0) {
      echo.track.sample(echo.track.lengthTicks, cursor, [], out);
      cells.add(this.key(out.x, out.z));
    }
    this.cellsBySerial.set(echo.serial, cells);
  }

  at(echo, x, z) {
    const key = this.key(x, z);
    for (const [serial, cells] of this.cellsBySerial) {
      if (serial < echo.serial && cells.has(key)) return true;
    }
    return false;
  }
}
