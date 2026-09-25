import { describe, it, expect } from 'vitest';
import { Paradox } from '../src/core/Paradox.js';
import { Simulation } from '../src/core/Simulation.js';
import { EventBus } from '../src/core/EventBus.js';
import { PARADOX_COST } from '../src/core/config.js';

describe('Paradox meter', () => {
  it('is hidden until it first rises, accumulates, never decreases and caps at 100', () => {
    const bus = new EventBus();
    const changes = [];
    bus.on('paradox:change', (e) => changes.push(e));
    const p = new Paradox(bus);
    expect(p.visible).toBe(false);
    p.add(4, 'swap');
    p.add(0, 'noop');
    p.add(-5, 'negative');
    expect(p.value).toBe(4);
    expect(p.visible).toBe(true);
    for (let i = 0; i < 40; i++) p.add(3, 'freeze');
    expect(p.value).toBe(100);
    expect(p.percent).toBe(100);
    expect(changes.at(-1).value).toBe(100);
  });

  it('door-paradox collapses cost paradox; room restarts keep it; a new game resets it', () => {
    const sim = new Simulation();
    sim.roomManager.begin(0);
    sim.bus.emit('echo:collapse', { echo: {}, reason: 'paradox' });
    sim.bus.emit('echo:collapse', { echo: {}, reason: 'evicted' });
    expect(sim.paradox.value).toBe(PARADOX_COST.collapse);
    sim.restartRoom();
    expect(sim.paradox.value).toBe(PARADOX_COST.collapse);
    sim.newGame();
    expect(sim.paradox.value).toBe(0);
    expect(sim.paradox.visible).toBe(false);
  });
});
