import { describe, it, expect } from 'vitest';
import { TimelineMap, TimelineEdits } from '../src/echo/TimelineEdits.js';
import { EchoRecorder } from '../src/echo/EchoRecorder.js';
import { Echo } from '../src/echo/Echo.js';

const advance = (map, ticks) => Array.from({ length: ticks }, () => map.advance());

function eventTrack() {
  const rec = new EchoRecorder();
  const player = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, flags: 1, platform: null };
  rec.start(player);
  for (let tick = 1; tick <= 300; tick++) {
    player.pos.x = tick / 60;
    rec.record(tick, player);
    if (tick === 100 || tick === 180 || tick === 260) rec.recordEvent(tick, 'interact', `switch${tick}`);
  }
  return rec.finish(300, player);
}

function runEcho(echo, ticks) {
  const fired = [];
  const ctx = { platforms: [], onEvent: (_echo, event) => fired.push(event.targetId) };
  for (let i = 0; i < ticks; i++) echo.update(ctx);
  return fired;
}

describe('TimelineMap', () => {
  it('delete skips 120 track ticks and marks a discontinuity', () => {
    const map = new TimelineMap(900);
    map.add('delete', 120, 0);
    const states = advance(map, 121);
    expect(states[119].trackTick).toBe(120);
    expect(states[120]).toMatchObject({ previousTick: 120, trackTick: 241, direction: 1, discontinuity: true });
  });

  it('delete clamps its jump to the track end', () => {
    const map = new TimelineMap(900, 900);
    map.add('delete', 900, 900);
    expect(map.advance()).toMatchObject({ previousTick: 900, trackTick: 900, direction: 1, discontinuity: true });
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

it('delete drops events inside the skipped section', () => {
  const echo = new Echo(eventTrack(), 1, []);
  echo.timeline.add('delete', 90, 0);
  expect(runEcho(echo, 200)).toEqual(['switch260']);
});

it('reverse does not fire interactions while track time moves backward', () => {
  const echo = new Echo(eventTrack(), 1, []);
  echo.timeline.add('reverse', 90, 0);
  expect(runEcho(echo, 300)).toEqual(['switch260']);
});

it('restart rewinds the event cursor so later events fire again', () => {
  const echo = new Echo(eventTrack(), 1, []);
  expect(runEcho(echo, 220)).toEqual(['switch100', 'switch180']);
  echo.restartFrom(80);
  expect(runEcho(echo, 140)).toEqual(['switch100', 'switch180']);
});
