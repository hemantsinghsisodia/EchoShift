import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/core/Simulation.js';
import { runRoomSolution } from '../src/debug/runSolution.js';
import { Autopilot } from '../src/debug/Autopilot.js';
import { CYCLE_TICKS } from '../src/core/config.js';
import { SOLUTIONS } from '../src/debug/solutions.js';

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

});

describe('new abilities are required', () => {
  const withoutStep = (roomIndex, drop) => SOLUTIONS[roomIndex].filter((s, i) => !drop(s, i));

  it('room 3: walking into the laser grid kills; without Swap the chamber is unreachable', () => {
    const sim = new Simulation();
    sim.roomManager.begin(2);
    let death = null;
    sim.bus.on('player:death', (e) => (death = e.reason));
    const pilot = new Autopilot(sim, [{ goto: [0, -4.6] }]);
    for (let i = 0; i < 300 && !death; i++) sim.step(pilot.next());
    expect(death).toBe('laser');

    const sim2 = new Simulation();
    sim2.roomManager.begin(2);
    const res = runSteps(sim2, withoutStep(2, (s) => s.swap !== undefined), 60 * 80);
    expect(sim2.rooms[2].complete).toBe(false);
    expect(res.pilot.error).not.toBeNull();
  });

  it('room 4: without Freeze the gate chain cannot be cleared', () => {
    const sim = new Simulation();
    sim.roomManager.begin(3);
    runSteps(sim, withoutStep(3, (s) => s.freeze !== undefined), 60 * 45);
    expect(sim.rooms[3].complete).toBe(false);
    expect(sim.player.pos.z).toBeGreaterThan(sim.rooms[3].origin.z - 8);
  });

  it('room 5: an Echo routed through the furnace burns before reaching the plate', () => {
    const sim = new Simulation();
    sim.roomManager.begin(4);
    const reasons = [];
    sim.bus.on('echo:collapse', (e) => reasons.push(e.reason));
    runSteps(sim, [{ goto: [0, 3.6] }, { waitRoom: 15.05 }, { wait: 6 }], 60 * 22);
    expect(reasons).toContain('sacrifice');
    expect(sim.room.byId.furnace.signal).toBe(true);
    expect(sim.room.byId.pA.signal).toBe(false);
  });
});

function runSteps(sim, steps, maxTicks) {
  const pilot = new Autopilot(sim, steps, { label: 'variant' });
  let deaths = 0;
  sim.bus.on('player:death', () => deaths++);
  for (let i = 0; i < maxTicks && !pilot.done; i++) sim.step(pilot.next());
  return { pilot, deaths };
}
