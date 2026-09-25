import { describe, it, expect } from 'vitest';
import { EchoRecorder } from '../src/echo/EchoRecorder.js';
import { Echo } from '../src/echo/Echo.js';
import { ECHO_SPAWN_TICKS } from '../src/core/config.js';

function makeTrack(len = 60, { yawFrom = 0, yawTo = 0, events = [] } = {}) {
  const rec = new EchoRecorder();
  const p = { pos: { x: 0, y: 0, z: 0 }, yaw: yawFrom, pitch: 0, flags: 1, platform: null };
  rec.start(p);
  for (let t = 1; t <= len; t++) {
    p.pos.x = t / 10;
    p.yaw = yawFrom + ((yawTo - yawFrom) * t) / len;
    rec.record(t, p);
  }
  for (const e of events) rec.recordEvent(e.tick, e.type, e.targetId);
  return rec.finish(len, p);
}

describe('EchoTrack / Echo replay', () => {
  it('interpolates position between 30 Hz frames', () => {
    const track = makeTrack();
    const out = {};
    track.sample(3, { i: 0 }, [], out);
    expect(out.x).toBeCloseTo(0.3, 5);
  });

  it('interpolates yaw along the shortest arc across +-PI', () => {
    const rec = new EchoRecorder();
    const p = { pos: { x: 0, y: 0, z: 0 }, yaw: 3.0, pitch: 0, flags: 1, platform: null };
    rec.start(p);
    p.yaw = -3.0;
    rec.record(2, p);
    const track = rec.finish(2, p);
    const out = {};
    track.sample(1, { i: 0 }, [], out);
    expect(Math.abs(out.yaw)).toBeGreaterThan(3.0);
  });

  it('spawns at frame 0, replays, then holds the final pose', () => {
    const track = makeTrack(60);
    const echo = new Echo(track, 1, []);
    expect(echo.pos.x).toBe(0);
    expect(echo.state).toBe('spawning');
    const ctx = { platforms: [] };
    for (let i = 0; i < ECHO_SPAWN_TICKS; i++) echo.update(ctx);
    expect(echo.state).toBe('replaying');
    for (let i = 0; i < 100; i++) echo.update(ctx);
    expect(echo.state).toBe('holding');
    expect(echo.pos.x).toBeCloseTo(6, 5);
    expect(echo.isActivator).toBe(true);
  });

  it('fires each recorded event exactly once at its tick', () => {
    const track = makeTrack(60, { events: [{ tick: 10, type: 'interact', targetId: 'a' }, { tick: 10, type: 'jump' }, { tick: 59, type: 'interact', targetId: 'b' }] });
    const echo = new Echo(track, 1, []);
    const fired = [];
    const ctx = { platforms: [], onEvent: (e, ev) => fired.push([echo.replayTick, ev.type, ev.targetId ?? null]) };
    for (let i = 0; i < 200; i++) echo.update(ctx);
    expect(fired).toEqual([
      [10, 'interact', 'a'],
      [10, 'jump', null],
      [59, 'interact', 'b'],
    ]);
  });

  it('collapses and dies after the dissolve', () => {
    const echo = new Echo(makeTrack(), 1, []);
    echo.collapse('evicted');
    expect(echo.isActivator).toBe(false);
    for (let i = 0; i < 40; i++) echo.update({ platforms: [] });
    expect(echo.dead).toBe(true);
  });
});
