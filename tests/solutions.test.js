import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/core/Simulation.js';
import { runRoomSolution } from '../src/debug/runSolution.js';
import { Autopilot } from '../src/debug/Autopilot.js';
import { CYCLE_TICKS } from '../src/core/config.js';

describe('scripted room solutions (headless, real simulation)', () => {
  for (let i = 0; i < 8; i++) {
    it(`room ${i + 1} is solvable and leads into the next room`, () => {
      const sim = new Simulation();
      sim.roomManager.begin(i);
      const res = runRoomSolution(sim, i);
      if (!res.ok) console.log(res.log.join('\n'));
      expect(res.error?.message ?? null).toBeNull();
      expect(sim.rooms[i].complete).toBe(true);
      if (i < 7) expect(sim.room.index).toBe(i + 1);
      else expect(sim.state).toBe('escaped');
    });
  }

  it('the whole game can be completed in one run', () => {
    const sim = new Simulation();
    for (let i = 0; i < 8; i++) {
      const res = runRoomSolution(sim, i);
      expect(res.error?.message ?? null).toBeNull();
    }
    expect(sim.state).toBe('escaped');
    const s = sim.summary();
    expect(s.roomsCompleted).toBe(8);
    expect(s.roomCount).toBe(8);
    expect(s.restarts).toBe(0);
    expect(s.echoesCreated).toBeGreaterThanOrEqual(12);
    expect(s.totalSeconds).toBeGreaterThan(60 * 4);
  });
});

describe('rooms cannot be solved alone before the first echo', () => {
  const soloAttempt = (roomIndex, steps) => {
    const sim = new Simulation();
    sim.roomManager.begin(roomIndex);
    const pilot = new Autopilot(sim, steps, { label: 'solo' });
    for (let t = 0; t < CYCLE_TICKS - 5 && !pilot.done; t++) sim.step(pilot.next());
    while (sim.cycleTick < CYCLE_TICKS - 2) sim.step();
    return sim;
  };

  it('room 1: sprinting from the plate cannot beat the closing gate', () => {
    const sim = soloAttempt(0, [
      { goto: [-4.5, 2.5] },
      { wait: 0.5 },
      { goto: [0, -2.4], timeout: 3 },
      { goto: [1.6, -3], timeout: 3 },
      { interact: 'core' },
    ]);
    expect(sim.rooms[0].complete).toBe(false);
    expect(sim.player.pos.z).toBeGreaterThan(sim.rooms[0].origin.z - 1);
  });

  it('room 3: one person cannot press both switches within the window', () => {
    const sim = soloAttempt(2, [
      { goto: [-7.9, 1] },
      { interact: 'swA' },
      { goto: [7.9, 1] },
      { interact: 'swB' },
      { wait: 1 },
    ]);
    expect(sim.rooms[2].byId.d1.isOpen).toBe(false);
  });

  it('room 4: the timed gate closes before a sprinting player arrives', () => {
    const sim = soloAttempt(3, [
      { goto: [-7.4, 8.4] },
      { interact: 'tb1' },
      { goto: [6, -6.5], timeout: 4 },
    ]);
    expect(sim.player.pos.z).toBeGreaterThan(sim.rooms[3].origin.z - 5);
  });
});
