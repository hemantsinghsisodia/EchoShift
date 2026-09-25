function call(fn, payload, type) {
  try {
    fn(payload);
  } catch (err) {
    console.error(`EventBus listener for '${type}' threw`, err);
  }
}

export class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.handlers.get(type)?.delete(fn);
  }

  /** A throwing listener is reported but never interrupts the simulation tick that emitted the event. */
  emit(type, payload = {}) {
    const set = this.handlers.get(type);
    if (set) for (const fn of set) call(fn, payload, type);
    const any = this.handlers.get('*');
    if (any) for (const fn of any) call(fn, { type, ...payload }, type);
  }

  clear() {
    this.handlers.clear();
  }
}
