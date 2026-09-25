import { describe, it, expect } from 'vitest';
import { CORRUPTION, TICK_RATE } from '../src/core/config.js';
import { EventBus } from '../src/core/EventBus.js';
import { Echo } from '../src/echo/Echo.js';
import { EchoManager } from '../src/echo/EchoManager.js';
import { EchoRecorder } from '../src/echo/EchoRecorder.js';
import { seededRandom, Corruption } from '../src/echo/Corruption.js';

const RANDOM_TYPES = ['jitter', 'flicker', 'stare', 'ghostPause'];

function fakeEcho(overrides = {}) {
  return {
    serial: 1,
    isActivator: true,
    age: 0,
    yaw: 0.75,
    corruptPauseTicks: 0,
    ghostPauseTicks: 0,
    stareTicks: 0,
    stareYaw: 0,
    visualGlitch: null,
    randomGlitch: null,
    ...overrides,
  };
}

function fakeSim(options = {}) {
  const emitted = [];
  const room = {
    cfg: {
      id: options.roomId ?? 8,
      corruption: options.corruption ?? [],
    },
    clock: options.clock ?? 0,
  };
  return {
    room,
    cycleIndex: options.cycleIndex ?? 0,
    paradox: { value: options.paradox ?? 0 },
    echoes: { echoes: options.echoes ?? [] },
    replayEvent: options.onEvent ?? (() => {}),
    bus: { emit: (type, payload) => emitted.push({ type, payload }) },
    emitted,
  };
}

function makeTrack(lengthTicks = 180, events = []) {
  const recorder = new EchoRecorder();
  const player = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, flags: 1, platform: null };
  recorder.start(player);
  for (let tick = 1; tick <= lengthTicks; tick++) {
    player.pos.x = tick / TICK_RATE;
    recorder.record(tick, player);
  }
  for (const event of events) recorder.recordEvent(event.tick, event.type, event.targetId);
  return recorder.finish(lengthTicks, player);
}

describe('deterministic random corruption', () => {
  it('keeps the seeded random stream stable', () => {
    const random = seededRandom(12345);

    expect([random(), random(), random(), random()]).toEqual([
      0.9797282677609473,
      0.3067522644996643,
      0.484205421525985,
      0.817934412509203,
    ]);
  });

  it('creates the same schedule for the same run state', () => {
    const sim = fakeSim({ paradox: 100, roomId: 8, cycleIndex: 4 });
    const first = new Corruption(sim, 77);
    const second = new Corruption(sim, 77);

    expect(Array.from({ length: 100 }, (_, serial) => first.rollRandom(serial))).toEqual(
      Array.from({ length: 100 }, (_, serial) => second.rollRandom(serial)),
    );
  });

  it('only chooses visual or facing glitches for random corruption', () => {
    const corruption = new Corruption(fakeSim({ paradox: 100, roomId: 8, cycleIndex: 4 }), 77);
    const glitches = Array.from({ length: 200 }, (_, serial) => corruption.rollRandom(serial)).filter(Boolean);

    expect(glitches.length).toBeGreaterThan(0);
    for (const glitch of glitches) {
      expect(RANDOM_TYPES).toContain(glitch.type);
      expect(glitch.atTick).toBeGreaterThanOrEqual(TICK_RATE);
      expect(glitch.duration).toBe(CORRUPTION.visualTicks);
    }
  });

  it('does not alter gameplay state when random glitches are applied', () => {
    const replayed = [];
    const sim = fakeSim({ onEvent: (_echo, event) => replayed.push(event) });
    const corruption = new Corruption(sim, 77);

    for (const type of RANDOM_TYPES) {
      const echo = fakeEcho({
        lastInteractionEvent: { tick: 10, type: 'interact', targetId: 'switch' },
      });
      corruption.apply(echo, { type, duration: 12 }, false);

      expect(echo.corruptPauseTicks).toBe(0);
      expect(echo.yaw).toBe(0.75);
    }
    expect(replayed).toEqual([]);
  });

  it('recreates the same spawn glitch after a room reset', () => {
    const sim = fakeSim({ paradox: 100, roomId: 8, cycleIndex: 4 });
    const corruption = new Corruption(sim, 77);
    const first = fakeEcho({ serial: 9 });
    corruption.onEchoSpawn(first);

    corruption.reset();
    const second = fakeEcho({ serial: 9 });
    corruption.onEchoSpawn(second);

    expect(second.randomGlitch).toEqual(first.randomGlitch);
  });
});

describe('authored corruption', () => {
  it('uses absolute room-clock seconds and cycle only as a generation guard', () => {
    const replayed = [];
    const echo = fakeEcho({
      lastInteractionEvent: { tick: 120, type: 'interact', targetId: 'breaker' },
    });
    const sim = fakeSim({
      cycleIndex: 5,
      clock: 5 * TICK_RATE - 1,
      corruption: [
        { cycle: 5, at: 5, echo: 1, type: 'pause' },
        { cycle: 5, at: 5, echo: 1, type: 'repeat' },
      ],
      echoes: [echo],
      onEvent: (_echo, event) => replayed.push(event.targetId),
    });
    const corruption = new Corruption(sim, 1);

    corruption.update();
    expect(echo.corruptPauseTicks).toBe(0);
    expect(replayed).toEqual([]);

    sim.room.clock = 5 * TICK_RATE;
    corruption.update();
    corruption.update();

    expect(echo.corruptPauseTicks).toBe(CORRUPTION.pauseTicks);
    expect(replayed).toEqual(['breaker']);
  });

  it('does not fire an authored event for another cycle', () => {
    const echo = fakeEcho();
    const sim = fakeSim({
      cycleIndex: 4,
      clock: 100 * TICK_RATE,
      corruption: [{ cycle: 5, at: 5, echo: 1, type: 'pause' }],
      echoes: [echo],
    });

    new Corruption(sim, 1).update();

    expect(echo.corruptPauseTicks).toBe(0);
  });

  it('can fire an authored event again after reset', () => {
    const echo = fakeEcho({
      lastInteractionEvent: { tick: 120, type: 'interact', targetId: 'breaker' },
    });
    const replayed = [];
    const sim = fakeSim({
      cycleIndex: 5,
      clock: 5 * TICK_RATE,
      corruption: [{ cycle: 5, at: 5, echo: 1, type: 'repeat' }],
      echoes: [echo],
      onEvent: (_echo, event) => replayed.push(event.targetId),
    });
    const corruption = new Corruption(sim, 1);

    corruption.update();
    corruption.reset();
    corruption.update();

    expect(replayed).toEqual(['breaker', 'breaker']);
  });

  it('advances an early Echo from its configured spawn offset and skips earlier events', () => {
    const bus = new EventBus();
    const sim = fakeSim({
      cycleIndex: 2,
      corruption: [{ cycle: 2, echo: 1, type: 'early' }],
    });
    const corruption = new Corruption(sim, 1);
    const manager = new EchoManager(bus);
    sim.echoes = manager;
    bus.on('echo:spawn', ({ echo }) => corruption.onEchoSpawn(echo));
    const track = makeTrack(180, [
      { tick: 20, type: 'interact', targetId: 'before-spawn' },
      { tick: 80, type: 'interact', targetId: 'at-early-start' },
      { tick: 81, type: 'interact', targetId: 'after-early-start' },
    ]);
    const echo = manager.spawn(track, 2, [], { startAt: 20 });
    const replayed = [];
    const ctx = { platforms: [], onEvent: (_echo, event) => replayed.push(event.targetId) };

    echo.update(ctx);
    expect(echo.replayTick).toBe(20 + CORRUPTION.earlyTicks);
    expect(replayed).toEqual([]);

    echo.update(ctx);
    expect(replayed).toEqual(['after-early-start']);
  });
});

describe('Echo corruption state', () => {
  it('pauses replay for the authored duration without losing its timeline position', () => {
    const echo = new Echo(makeTrack(), 1, []);
    echo.corruptPauseTicks = 2;

    echo.update({ platforms: [] });
    echo.update({ platforms: [] });
    expect(echo.replayTick).toBe(0);

    echo.update({ platforms: [] });
    expect(echo.replayTick).toBe(1);
  });

  it('keeps ghost pauses and visual timers out of replay movement', () => {
    const echo = new Echo(makeTrack(), 1, []);
    echo.ghostPauseTicks = 2;
    echo.visualGlitch = { type: 'jitter', ticks: 2 };

    echo.update({ platforms: [] });

    expect(echo.replayTick).toBe(1);
    expect(echo.ghostPauseTicks).toBe(1);
    expect(echo.visualGlitch.ticks).toBe(1);
  });
});
