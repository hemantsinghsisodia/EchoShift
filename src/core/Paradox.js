/**
 * Run-wide PARADOX meter (0-100). Rises with timeline-bending actions, never falls;
 * only a new game resets it. Hidden until it first rises.
 */
export class Paradox {
  constructor(bus = null) {
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.value = 0;
    this.visible = false;
    this.history = [];
  }

  get percent() {
    return Math.round(this.value);
  }

  add(amount, reason) {
    if (!(amount > 0) || this.value >= 100) return;
    const before = this.value;
    this.value = Math.min(100, this.value + amount);
    this.visible = true;
    this.history.push({ reason, amount: this.value - before });
    this.bus?.emit('paradox:change', { value: this.value, delta: this.value - before, reason });
  }
}
