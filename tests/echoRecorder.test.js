import { describe, it, expect } from 'vitest';
import { EchoRecorder } from '../src/echo/EchoRecorder.js';
import { CYCLE_TICKS } from '../src/core/config.js';

const fakePlayer = (x = 0, platform = null) => ({ pos: { x, y: 0, z: 0 }, yaw: 0, pitch: 0, flags: 1, platform });

describe('EchoRecorder', () => {
  it('records 30 Hz frames over a 15 s cycle (451 frames incl. start and end)', () => {
    const rec = new EchoRecorder();
    const p = fakePlayer();
    rec.start(p);
    for (let t = 1; t <= CYCLE_TICKS; t++) {
      p.pos.x = t * 0.01;
      rec.record(t, p);
    }
    const track = rec.finish(CYCLE_TICKS, p);
    expect(track.frameCount).toBe(451);
    expect(track.lastTick).toBe(CYCLE_TICKS);
    expect(track.frameTick(1)).toBe(2);
  });

  it('stores interaction events with exact ticks, sorted', () => {
    const rec = new EchoRecorder();
    const p = fakePlayer();
    rec.start(p);
    rec.recordEvent(601, 'interact', 'swA');
    rec.recordEvent(12, 'jump');
    const track = rec.finish(900, p);
    expect(track.events.map((e) => e.tick)).toEqual([12, 601]);
    expect(track.events[1]).toEqual({ tick: 601, type: 'interact', targetId: 'swA' });
    expect(Object.isFrozen(track.events)).toBe(true);
  });

  it('stores platform-relative positions while riding', () => {
    const rec = new EchoRecorder();
    const platform = { index: 0, pos: { x: 10, y: 1, z: -4 } };
    const p = fakePlayer(11, platform);
    p.pos.y = 1;
    p.pos.z = -4;
    rec.start(p);
    const track = rec.finish(2, p);
    expect(track.frames[1]).toBeCloseTo(1);
    expect(track.frames[2]).toBeCloseTo(0);
    expect(track.frames[7]).toBe(0);
  });

  it('reset/stop discards the current cycle and ignores input while inactive', () => {
    const rec = new EchoRecorder();
    const p = fakePlayer();
    rec.start(p);
    rec.record(2, p);
    rec.stop();
    rec.record(4, p);
    rec.recordEvent(4, 'interact', 'x');
    expect(rec.frameCount).toBe(0);
    expect(rec.events.length).toBe(0);
  });
});
