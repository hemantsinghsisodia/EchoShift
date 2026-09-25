import { CORRUPTION, TICK_RATE } from '../core/config.js';

const VISUAL_TYPES = Object.freeze(['jitter', 'flicker', 'stare', 'ghostPause']);

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export class Corruption {
  constructor(sim, runSeed = 0x4543484f) {
    this.sim = sim;
    this.runSeed = runSeed;
    this.fired = new Set();
  }

  reset() {
    this.fired.clear();
  }

  randomFor(echoSerial) {
    const roomId = this.sim.room.cfg.id;
    const seed = this.runSeed
      ^ (roomId * 73856093)
      ^ (this.sim.cycleIndex * 19349663)
      ^ (echoSerial * 83492791);
    return seededRandom(seed);
  }

  rollRandom(echoSerial) {
    const random = this.randomFor(echoSerial);
    const chance = CORRUPTION.baseChance + this.sim.paradox.value * CORRUPTION.paradoxChance;
    if (random() >= chance) return null;
    return {
      type: VISUAL_TYPES[Math.floor(random() * VISUAL_TYPES.length)],
      atTick: Math.floor(random() * 12 * TICK_RATE) + TICK_RATE,
      duration: CORRUPTION.visualTicks,
    };
  }

  onEchoSpawn(echo) {
    const early = this.sim.room.cfg.corruption?.find(
      (event) => event.type === 'early'
        && event.cycle === this.sim.cycleIndex
        && event.echo === echo.serial,
    );
    if (early) {
      const startTick = Math.min(
        echo.track.lengthTicks,
        echo.timeline.trackTick + CORRUPTION.earlyTicks,
      );
      echo.restartFrom(startTick);
    }
    echo.randomGlitch = this.rollRandom(echo.serial);
  }

  apply(echo, event, authored) {
    if (!authored && !VISUAL_TYPES.includes(event.type)) return;
    if (event.type === 'stare') {
      echo.stareTicks = authored ? CORRUPTION.stareTicks : event.duration;
    }
    if (event.type === 'pause') echo.corruptPauseTicks = CORRUPTION.pauseTicks;
    if (event.type === 'repeat' && echo.lastInteractionEvent) {
      this.sim.replayEvent(echo, echo.lastInteractionEvent);
    }
    if (event.type === 'ghostPause') echo.ghostPauseTicks = event.duration;
    if (event.type === 'jitter' || event.type === 'flicker') {
      echo.visualGlitch = { type: event.type, ticks: event.duration };
    }
    this.sim.bus.emit('echo:corrupt', { echo, type: event.type, authored });
  }

  update() {
    const events = this.sim.room.cfg.corruption ?? [];
    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      if (event.type === 'early') continue;
      const key = `${this.sim.room.cfg.id}:${this.sim.cycleIndex}:${index}`;
      if (this.fired.has(key)) continue;
      const atTick = Math.round(event.at * TICK_RATE);
      if (event.cycle !== this.sim.cycleIndex || this.sim.room.clock < atTick) continue;
      const echo = this.sim.echoes.echoes.find(
        (candidate) => candidate.serial === event.echo && candidate.isActivator,
      );
      if (!echo) continue;
      this.fired.add(key);
      this.apply(echo, event, true);
    }

    for (const echo of this.sim.echoes.echoes) {
      const event = echo.randomGlitch;
      if (!echo.isActivator || !event || event.fired || echo.age < event.atTick) continue;
      event.fired = true;
      this.apply(echo, event, false);
    }
  }
}
