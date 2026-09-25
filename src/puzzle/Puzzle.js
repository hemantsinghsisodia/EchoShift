import { compile } from './Logic.js';

/**
 * Per-room signal table. Objects publish boolean signals; actuators declare conditions
 * (opensWhen / activeWhen / enabledWhen) that are compiled once and evaluated once per tick.
 */
export class Puzzle {
  constructor(room) {
    this.room = room;
    this.conditions = [];
  }

  signal(id) {
    if (id === 'room.complete') return this.room.complete;
    const obj = this.room.byId[id];
    if (!obj) throw new Error(`Room ${this.room.cfg.id}: unknown signal '${id}'`);
    return obj.signal;
  }

  /** Register a condition for an object; result is written to obj.condValue each tick. */
  bind(obj, expr) {
    const compiled = compile(
      expr,
      (id) => this.signal(id),
      () => this.room.clock,
    );
    const entry = { obj, compiled };
    this.conditions.push(entry);
    obj.condRefs = [...compiled.refs];
    obj.condValue = false;
    return entry;
  }

  evaluate() {
    for (const c of this.conditions) c.obj.condValue = c.compiled.fn();
  }

  reset() {
    for (const c of this.conditions) {
      c.compiled.reset();
      c.obj.condValue = false;
    }
  }
}
