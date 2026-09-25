import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/core/Simulation.js';
import { Autopilot } from '../src/debug/Autopilot.js';
import { EchoRecorder } from '../src/echo/EchoRecorder.js';
import { ABILITIES, CYCLE_TICKS, PARADOX_COST, TICK_RATE } from '../src/core/config.js';
import { yawTo } from '../src/math/vec.js';

function drive(sim, steps, maxTicks = 60 * 60) {
  const pilot = new Autopilot(sim, steps);
  for (let i = 0; i < maxTicks && !pilot.done; i++) sim.step(pilot.next());
  if (pilot.error) throw pilot.error;
  return pilot;
}

/** Spawn an echo that just stands at a room-local position. */
function staticEcho(sim, x, z, y = 0) {
  const room = sim.room;
  const w = room.toWorld(x, y, z);
  const fake = { pos: { ...w }, yaw: 0, pitch: 0, flags: 1, platform: null };
  const rec = new EchoRecorder();
  rec.start(fake);
  return sim.echoes.spawn(rec.finish(2, fake), 4, room.platforms);
}

function placePlayerFacing(sim, x, z, echo) {
  const w = sim.room.toWorld(x, 0, z);
  sim.player.teleport(w.x, 0, w.z, yawTo(w.x, w.z, echo.pos.x, echo.pos.z));
}

describe('Echo Swap', () => {
  const room3Swap = [
    { wait: 3 },
    { goto: [0, -1.6], sprint: false },
    { waitRoom: 15.05 },
    { goto: [0, 0.8], sprint: false },
    { waitEcho: 1, near: [0, 3.8], tol: 0.25 },
    { swap: 1 },
  ];

  it('trades places and shifts the echo\'s whole remaining path by the swap vector', () => {
    const sim = new Simulation();
    sim.roomManager.begin(2);
    drive(sim, room3Swap);
    const room = sim.room;
    const echo = sim.echoes.echoes[0];
    expect(sim.player.pos.z - room.origin.z).toBeCloseTo(3.8, 0);
    expect(echo.offset.z).toBeCloseTo(-3, 0);
    for (let i = 0; i < 5 * TICK_RATE; i++) sim.step();
    expect(echo.pos.z - room.origin.z).toBeCloseTo(-4.6, 0);
    expect(sim.paradox.value).toBe(PARADOX_COST.swap);
  });

  it('writes a blink frame into the recording so the future echo teleports instead of sliding', () => {
    const rec = new EchoRecorder();
    const p = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, flags: 1, platform: null };
    rec.start(p);
    rec.record(2, p);
    p.pos.x = 10;
    rec.markBlink(5, p);
    p.pos.x = 11;
    rec.record(6, p);
    const track = rec.finish(6, p);
    const out = {};
    track.sample(4, { i: 0 }, [], out);
    expect(out.x).toBe(0);
    track.sample(5.5, { i: 0 }, [], out);
    expect(out.x).toBeCloseTo(10.5, 5);
    expect(track.events.some((e) => e.type === 'swap' && e.tick === 5)).toBe(true);
  });

  it('is blocked by walls and closed doors (no line of sight)', () => {
    const sim = new Simulation();
    sim.roomManager.begin(2);
    const e = staticEcho(sim, 5, -5);
    placePlayerFacing(sim, 5, 0, e);
    expect(sim.abilities.trySwap()).toBe(false);
    expect(sim.abilities.lastResult.reason).toBe('OBSTRUCTED');

    const sim2 = new Simulation();
    sim2.roomManager.begin(3);
    const e2 = staticEcho(sim2, 6, -3.5);
    placePlayerFacing(sim2, 6, -0.5, e2);
    expect(sim2.abilities.trySwap()).toBe(false);
    expect(sim2.abilities.lastResult.reason).toBe('OBSTRUCTED');
  });

  it('sees through glass and lasers', () => {
    const sim = new Simulation();
    sim.roomManager.begin(3);
    const e = staticEcho(sim, -2, 5.5);
    placePlayerFacing(sim, 2, 5.5, e);
    expect(sim.abilities.trySwap()).toBe(true);
  });

  it('will not swap the player into a hazard', () => {
    const sim = new Simulation();
    sim.roomManager.begin(2);
    const e = staticEcho(sim, 0, -3);
    placePlayerFacing(sim, 0, 0, e);
    expect(sim.abilities.trySwap()).toBe(false);
    expect(sim.abilities.lastResult.reason).toBe('HAZARD');
  });

  it('respects the cooldown and is unavailable where the room does not allow it', () => {
    const sim = new Simulation();
    sim.roomManager.begin(2);
    const e = staticEcho(sim, 0, 3);
    placePlayerFacing(sim, 0, 0, e);
    expect(sim.abilities.trySwap()).toBe(true);
    sim.player.yaw = yawTo(sim.player.pos.x, sim.player.pos.z, e.pos.x, e.pos.z);
    expect(sim.abilities.trySwap()).toBe(false);
    expect(sim.abilities.lastResult.reason).toBe('RECHARGING');
    for (let i = 0; i < ABILITIES.swapCooldown * TICK_RATE; i++) sim.step({ ...idle(sim), yaw: sim.player.yaw });
    expect(sim.abilities.trySwap()).toBe(true);

    const sim1 = new Simulation();
    const e1 = staticEcho(sim1, 0, 3);
    placePlayerFacing(sim1, 0, 1, e1);
    expect(sim1.abilities.trySwap()).toBe(false);
    expect(sim1.abilities.lastResult).toBeNull();
  });
});

describe('Echo Freeze', () => {
  it('pauses replay and delays every later event by exactly the freeze duration', () => {
    const sim = new Simulation();
    sim.roomManager.begin(7);
    const presses = [];
    sim.bus.on('switch:press', ({ by }) => presses.push({ by, tick: sim.room.clock }));
    drive(sim, [{ goto: [-15, -4.5] }, { waitRoom: 5 }, { interact: 'sw1' }, { waitRoom: 15.02 }]);
    const echo = sim.echoes.echoes[0];
    echo.freeze(ABILITIES.freezeDuration * TICK_RATE);
    const frozenAt = { ...echo.pos };
    for (let i = 0; i < 60; i++) sim.step();
    expect(echo.pos).toEqual(frozenAt);
    for (let i = 0; i < CYCLE_TICKS; i++) sim.step();
    expect(presses[0]).toEqual({ by: 'player', tick: 301 });
    expect(presses[1]).toEqual({ by: 'echo', tick: 301 + CYCLE_TICKS + ABILITIES.freezeDuration * TICK_RATE });
  });

  it('a frozen echo keeps holding its plate (room 4)', () => {
    const sim = new Simulation();
    sim.roomManager.begin(3);
    drive(sim, [
      { goto: [-3, 6.4] },
      { waitRoom: 4 },
      { until: (s, room) => !room.byId.field.active && room.byId.field.pulseRemaining() > 1.4 },
      { goto: [-3, 3], tol: 0.25 },
      { wait: 0.3 },
      { goto: [-3, 0.8] },
      { waitRoom: 15.05 },
      { goto: [0.2, -0.9] },
      { goto: [6, -0.8] },
      { waitEcho: 1, near: [-3, 3], tol: 0.5 },
      { freeze: 1 },
    ]);
    const p1 = sim.room.byId.p1;
    expect(sim.echoes.echoes[0].isFrozen).toBe(true);
    for (let i = 0; i < 4.5 * TICK_RATE; i++) {
      sim.step();
      expect(p1.signal).toBe(true);
    }
    for (let i = 0; i < 2 * TICK_RATE; i++) sim.step();
    expect(p1.signal).toBe(false);
    expect(sim.paradox.value).toBe(PARADOX_COST.freeze);
  });

  it('only one echo can be frozen at a time, with a cooldown', () => {
    const sim = new Simulation();
    sim.roomManager.begin(6);
    const a = staticEcho(sim, 0, 3);
    const b = staticEcho(sim, 3, 3);
    placePlayerFacing(sim, 0, 6, a);
    expect(sim.abilities.tryFreeze()).toBe(true);
    expect(sim.abilities.tryFreeze()).toBe(false);
    expect(sim.abilities.lastResult.reason).toBe('RECHARGING');
    sim.abilities.freezeReadyAt = 0;
    placePlayerFacing(sim, 3, 6, b);
    expect(sim.abilities.tryFreeze()).toBe(false);
    expect(sim.abilities.lastResult.reason).toBe('ONE ECHO AT A TIME');
  });
});

function idle(sim) {
  return { forward: false, back: false, left: false, right: false, sprint: false, jump: false, interact: false, swap: false, freeze: false, yaw: sim.player.yaw, pitch: 0 };
}
