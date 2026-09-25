import { describe, it, expect } from 'vitest';
import { compile, all, any, not, count, sync, latch } from '../src/puzzle/Logic.js';

function env() {
  const signals = {};
  let tick = 0;
  return {
    signals,
    set: (id, v) => (signals[id] = v),
    advance: (n = 1) => (tick += n),
    get: (id) => !!signals[id],
    tick: () => tick,
  };
}

describe('logic expressions', () => {
  it('ref / all / any / not / count', () => {
    const e = env();
    const c = (x) => compile(x, e.get, e.tick).fn;
    e.set('a', true);
    expect(c('a')()).toBe(true);
    expect(c(all(['a', 'b']))()).toBe(false);
    expect(c(any(['a', 'b']))()).toBe(true);
    expect(c(not('b'))()).toBe(true);
    e.set('b', true);
    expect(c(count(['a', 'b', 'c'], 2))()).toBe(true);
    expect(c(count(['a', 'b', 'c'], 3))()).toBe(false);
  });

  it('latch stays true and resets', () => {
    const e = env();
    const l = compile(latch('a'), e.get, e.tick);
    expect(l.fn()).toBe(false);
    e.set('a', true);
    expect(l.fn()).toBe(true);
    e.set('a', false);
    expect(l.fn()).toBe(true);
    l.reset();
    expect(l.fn()).toBe(false);
  });

  const syncWithGap = (gapTicks) => {
    const e = env();
    const s = compile(sync(['a', 'b'], 1.0), e.get, e.tick);
    s.fn();
    e.set('a', true);
    s.fn();
    for (let i = 0; i < gapTicks; i++) {
      e.advance();
      e.set('a', false);
      s.fn();
    }
    e.set('b', true);
    return s.fn();
  };

  it('sync passes within the window (0.99 s) and fails outside it (1.01 s)', () => {
    expect(syncWithGap(59)).toBe(true);
    expect(syncWithGap(61)).toBe(false);
  });

  it('sync is not short-circuited inside all()', () => {
    const e = env();
    const c = compile(all(['gate', sync(['a', 'b'], 1)]), e.get, e.tick);
    e.set('a', true);
    e.set('b', true);
    c.fn();
    e.set('gate', true);
    expect(c.fn()).toBe(true);
  });

  it('collects referenced ids for wiring visuals', () => {
    const e = env();
    const c = compile(all(['n1', sync(['s1', 's2'], 1)]), e.get, e.tick);
    expect([...c.refs].sort()).toEqual(['n1', 's1', 's2']);
  });
});
