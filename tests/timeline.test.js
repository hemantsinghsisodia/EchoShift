import { describe, it, expect } from 'vitest';
import { TimelineMap, TimelineEdits, EDIT_TYPES } from '../src/echo/TimelineEdits.js';
import { EchoRecorder } from '../src/echo/EchoRecorder.js';
import { Echo } from '../src/echo/Echo.js';
import { Simulation } from '../src/core/Simulation.js';
import { CYCLE_TICKS, TIMELINE_COST } from '../src/core/config.js';

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

function editHarness() {
  const echo = { isActivator: true, timeline: new TimelineMap(900) };
  const charges = [];
  const events = [];
  const sim = {
    room: { cfg: { edits: { delete: 2, freeze: 2, reverse: 2, restart: 2 } } },
    echoes: { echoes: [echo] },
    paradox: { add: (amount, reason) => charges.push({ amount, reason }) },
    bus: { emit: (type, payload) => events.push({ type, payload }) },
  };
  return { edits: new TimelineEdits(sim), echo, charges, events };
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

describe('TimelineEdits', () => {
  it('decrements only the selected room edit use', () => {
    const { edits, echo } = editHarness();

    edits.apply(echo, 'freeze', 120);

    expect(edits.remaining).toEqual({ delete: 2, freeze: 1, reverse: 2, restart: 2 });
  });

  it.each(EDIT_TYPES.map((type) => [type, TIMELINE_COST[type]]))('charges the exact %s Paradox cost', (type, cost) => {
    const { edits, echo, charges } = editHarness();

    edits.apply(echo, type, 120);

    expect(charges).toEqual([{ amount: cost, reason: `timeline:${type}` }]);
  });

  it('emits timeline:edit with the applied operation', () => {
    const { edits, echo, events } = editHarness();

    const result = edits.apply(echo, 'delete', 120);

    expect(events).toEqual([
      {
        type: 'timeline:edit',
        payload: { echo, type: 'delete', cursorTick: 120, op: result.op },
      },
    ]);
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

describe('Timeline integration', () => {
  const roomConfig = {
    id: 97,
    name: 'TIMELINE TEST',
    w: 12,
    d: 12,
    entranceX: 0,
    exitX: 0,
    maxEchoes: 2,
    edits: { delete: 1, restart: 1 },
    objects: [],
  };

  it('resets room edit uses on restart but preserves Paradox', () => {
    const sim = new Simulation({ roomConfigs: [roomConfig] });
    expect(sim.timelineEdits.newestEcho()).toBeNull();
    sim.timelineEdits.remaining.delete = 0;
    sim.paradox.add(5, 'timeline:delete');

    sim.restartRoom();

    expect(sim.timelineEdits.remaining.delete).toBe(sim.room.cfg.edits.delete);
    expect(sim.paradox.value).toBe(5);
  });

  it('opens on the newest live Echo without changing simulation state', () => {
    const sim = new Simulation({ roomConfigs: [roomConfig] });
    const older = { isActivator: true };
    const newest = { isActivator: true };
    sim.echoes.echoes.push(older, newest);

    const result = sim.openTimeline();

    expect(result).toEqual({
      ok: true,
      echo: newest,
      remaining: { delete: 1, restart: 1 },
    });
    expect(sim.state).toBe('playing');
    result.remaining.delete = 0;
    expect(sim.timelineEdits.remaining.delete).toBe(1);
  });

  it('reports locked and empty timelines without changing simulation state', () => {
    const { edits: _edits, ...lockedConfig } = roomConfig;
    const locked = new Simulation({ roomConfigs: [lockedConfig] });
    const empty = new Simulation({ roomConfigs: [roomConfig] });

    expect(locked.openTimeline()).toEqual({ ok: false, reason: 'TIMELINE LOCKED' });
    expect(empty.openTimeline()).toEqual({ ok: false, reason: 'NO ECHO' });
    expect(locked.state).toBe('playing');
    expect(empty.state).toBe('playing');
  });

  it('increments cycleIndex before spawn and resets cycle systems on restart', () => {
    const sim = new Simulation({ roomConfigs: [roomConfig] });
    const spawnCycles = [];
    sim.bus.on('echo:spawn', () => spawnCycles.push(sim.cycleIndex));

    for (let tick = 0; tick < CYCLE_TICKS; tick++) sim.step();

    expect(spawnCycles).toEqual([1]);
    expect(sim.cycleIndex).toBe(1);
    expect(sim.resonance.cellsBySerial.size).toBe(1);

    sim.restartRoom();
    expect(sim.cycleIndex).toBe(0);
    expect(sim.resonance.cellsBySerial.size).toBe(0);
  });

  it('keeps one resonance registration listener across room restarts', () => {
    const sim = new Simulation({ roomConfigs: [roomConfig] });
    sim.restartRoom();
    sim.restartRoom();
    let registrations = 0;
    sim.resonance.register = () => registrations++;

    sim.bus.emit('echo:spawn', { echo: {} });

    expect(registrations).toBe(1);
  });

  it('consumes only the selected room edit and adds the exact Paradox cost', () => {
    const sim = new Simulation();
    sim.roomManager.begin(6);
    const fake = {
      isActivator: true,
      timeline: new TimelineMap(900),
    };
    sim.echoes.echoes.push(fake);
    expect(sim.timelineEdits.apply(fake, 'delete', 180)).toMatchObject({ ok: true });
    expect(sim.timelineEdits.remaining.delete).toBe(sim.room.cfg.edits.delete - 1);
    expect(sim.paradox.value).toBe(5);
    expect(sim.timelineEdits.apply(fake, 'delete', 240)).toMatchObject({ ok: false, reason: 'NO EDITS LEFT' });
  });
});
