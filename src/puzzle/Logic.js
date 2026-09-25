import { TICK_RATE } from '../core/config.js';

/**
 * Declarative logic expressions used by room configs, compiled into closures.
 * A bare string is a reference to an object's signal (or 'room.complete').
 */
export const ref = (id) => ({ op: 'ref', id });
export const all = (args) => ({ op: 'all', args });
export const any = (args) => ({ op: 'any', args });
export const not = (arg) => ({ op: 'not', args: [arg] });
/** At least n of the listed signals active at the same time. */
export const count = (args, n) => ({ op: 'count', args, n });
/** Latches true once every listed signal has had a rising edge within `windowSec` of each other. */
export const sync = (ids, windowSec) => ({ op: 'sync', ids, window: windowSec });
/** Latches true once its argument has been true. */
export const latch = (arg) => ({ op: 'latch', args: [arg] });

/**
 * Compile an expression. getSignal(id) -> bool, getTick() -> int.
 * Children are always all evaluated (no short-circuit) so stateful nodes (sync/latch)
 * observe every tick exactly once. Evaluate the returned fn once per tick.
 */
export function compile(expr, getSignal, getTick) {
  const resets = [];
  const refs = new Set();

  function build(e) {
    if (e === true || e === false || e === undefined || e === null) {
      const v = e !== false;
      return () => v;
    }
    if (typeof e === 'string') {
      refs.add(e);
      return () => !!getSignal(e);
    }
    switch (e.op) {
      case 'ref':
        refs.add(e.id);
        return () => !!getSignal(e.id);
      case 'all': {
        const fs = e.args.map(build);
        return () => {
          let r = true;
          for (const f of fs) if (!f()) r = false;
          return r;
        };
      }
      case 'any': {
        const fs = e.args.map(build);
        return () => {
          let r = false;
          for (const f of fs) if (f()) r = true;
          return r;
        };
      }
      case 'not': {
        const f = build(e.args[0]);
        return () => !f();
      }
      case 'count': {
        const fs = e.args.map(build);
        return () => {
          let n = 0;
          for (const f of fs) if (f()) n++;
          return n >= e.n;
        };
      }
      case 'latch': {
        const f = build(e.args[0]);
        const st = { on: false };
        resets.push(() => (st.on = false));
        return () => {
          if (f()) st.on = true;
          return st.on;
        };
      }
      case 'sync': {
        for (const id of e.ids) refs.add(id);
        const windowTicks = Math.round(e.window * TICK_RATE);
        const st = { prev: {}, rise: {}, fired: false };
        resets.push(() => {
          st.prev = {};
          st.rise = {};
          st.fired = false;
        });
        return () => {
          const t = getTick();
          for (const id of e.ids) {
            const v = !!getSignal(id);
            if (v && !st.prev[id]) st.rise[id] = t;
            st.prev[id] = v;
          }
          if (!st.fired) {
            let lo = Infinity;
            let hi = -Infinity;
            let complete = true;
            for (const id of e.ids) {
              const r = st.rise[id];
              if (r === undefined) {
                complete = false;
                break;
              }
              lo = Math.min(lo, r);
              hi = Math.max(hi, r);
            }
            if (complete && hi - lo <= windowTicks) st.fired = true;
          }
          return st.fired;
        };
      }
      default:
        throw new Error(`Unknown logic op: ${e.op}`);
    }
  }

  const fn = build(expr);
  return {
    fn,
    refs,
    reset() {
      for (const r of resets) r();
    },
  };
}
