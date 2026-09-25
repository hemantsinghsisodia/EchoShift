import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/core/Simulation.js';
import { runRoomSolution } from '../src/debug/runSolution.js';

describe('ending sequence', () => {
  it('reactor starts the ending, the main exit opens after the delay, the escape chamber ends the game', () => {
    const sim = new Simulation();
    sim.roomManager.begin(7);
    const events = [];
    sim.bus.on('*', (e) => {
      if (e.type === 'ending:start' || e.type === 'ending:escaped') events.push({ type: e.type, tick: sim.tick });
      if (e.type === 'door:move' && e.door.role === 'exit' && e.opening) events.push({ type: 'exit-open', tick: sim.tick });
    });
    let summary = null;
    sim.bus.on('ending:escaped', (e) => (summary = e.stats));
    const res = runRoomSolution(sim, 7);
    expect(res.error?.message ?? null).toBeNull();
    expect(events.map((e) => e.type)).toEqual(['ending:start', 'exit-open', 'ending:escaped']);
    expect(events[1].tick - events[0].tick).toBe(Math.round(3.5 * 60));
    expect(sim.state).toBe('escaped');
    expect(summary.roomsCompleted).toBe(1);
    expect(summary.roomCount).toBe(8);

    const ticks = sim.tick;
    sim.step();
    expect(sim.tick).toBe(ticks);
  });

  it('restart is disabled during the ending and new game resets everything', () => {
    const sim = new Simulation();
    sim.roomManager.begin(7);
    runRoomSolution(sim, 7);
    expect(sim.restartRoom()).toBe(false);
    sim.newGame();
    expect(sim.state).toBe('playing');
    expect(sim.room.index).toBe(0);
    expect(sim.stats.ticks).toBe(0);
    expect(sim.stats.roomsCompleted).toBe(0);
    expect(sim.rooms[7].complete).toBe(false);
    expect(sim.rooms[0].exitDoor.locked).toBe(false);
  });
});
