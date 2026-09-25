import { describe, it, expect } from 'vitest';
import { TimelineMap, TimelineEdits } from '../src/echo/TimelineEdits.js';

const advance = (map, ticks) => Array.from({ length: ticks }, () => map.advance());

describe('TimelineMap', () => {
  it('delete skips 120 track ticks and marks a discontinuity', () => {
    const map = new TimelineMap(900);
    map.add('delete', 120, 0);
    const states = advance(map, 121);
    expect(states[119].trackTick).toBe(120);
    expect(states[120]).toMatchObject({ previousTick: 120, trackTick: 241, direction: 1, discontinuity: true });
  });

  it('freeze holds for 120 ticks and delays the rest', () => {
    const map = new TimelineMap(900);
    map.add('freeze', 120, 0);
    const states = advance(map, 240);
    expect(states[119].trackTick).toBe(120);
    expect(states[120].trackTick).toBe(120);
    expect(states[238].trackTick).toBe(120);
    expect(states[239].trackTick).toBe(121);
  });

  it('reverse walks the selected 120 ticks backward and suppresses events', () => {
    const map = new TimelineMap(900);
    map.add('reverse', 120, 0);
    const states = advance(map, 360);
    expect(states[119].trackTick).toBe(120);
    expect(states[120]).toMatchObject({ trackTick: 239, direction: -1, discontinuity: true });
    expect(states[239].trackTick).toBe(120);
    expect(states[240]).toMatchObject({ trackTick: 241, direction: 1, discontinuity: true });
  });

  it('restart jumps into the past and continues forward', () => {
    const map = new TimelineMap(900);
    advance(map, 500);
    map.add('restart', 180, 500);
    expect(map.advance()).toMatchObject({ previousTick: 500, trackTick: 180, direction: 1, discontinuity: true });
    expect(map.advance().trackTick).toBe(181);
  });

  it('clamps forward-only edits to the current replay time', () => {
    const map = new TimelineMap(900);
    advance(map, 300);
    const op = map.add('delete', 100, 300);
    expect(op.start).toBe(300);
  });
});
