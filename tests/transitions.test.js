import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/core/Simulation.js';
import { runRoomSolution } from '../src/debug/runSolution.js';
import { Autopilot } from '../src/debug/Autopilot.js';

describe('room transitions', () => {
  it('rooms are chained so every exit lines up with the next entrance', () => {
    const sim = new Simulation();
    for (let i = 1; i < sim.rooms.length; i++) {
      const a = sim.rooms[i - 1];
      const b = sim.rooms[i];
      expect(a.origin.x + a.cfg.exitX).toBeCloseTo(b.spawn.x);
      expect(a.bounds.minZ - b.bounds.maxZ).toBeCloseTo(4);
    }
  });

  it('the exit stays closed until the room is complete', () => {
    const sim = new Simulation();
    const pilot = new Autopilot(sim, [{ exit: true, timeout: 5 }]);
    for (let i = 0; i < 400; i++) sim.step(pilot.next());
    expect(sim.room.index).toBe(0);
    expect(sim.rooms[0].exitDoor.blocking).toBe(true);
  });

  it('entering the next room locks the old exit, clears echoes and restarts the cycle', () => {
    const sim = new Simulation();
    const entered = [];
    sim.bus.on('room:enter', (e) => entered.push(e.index));
    const res = runRoomSolution(sim, 0);
    expect(res.ok).toBe(true);
    expect(entered).toEqual([1]);
    expect(sim.room.index).toBe(1);
    expect(sim.rooms[0].exitDoor.locked).toBe(true);
    expect(sim.echoes.count).toBe(0);
    expect(sim.recorder.active).toBe(true);
    expect(sim.cycleTick).toBe(sim.room.clock);
    expect(sim.room.clock).toBeLessThan(60);
    for (let i = 0; i < 120; i++) sim.step();
    expect(sim.rooms[0].exitDoor.blocking).toBe(true);
  });

  it('completing a room pauses recording until the next room', () => {
    const sim = new Simulation();
    let completedAt = null;
    sim.bus.on('room:complete', () => (completedAt = sim.tick));
    const pilot = new Autopilot(sim, [{ goto: [-4.5, 2.5] }, { waitRoom: 15.05 }, { goto: [0, 0.1] }, { waitDoor: 'd1' }, { goto: [0, -2.4] }, { goto: [1.6, -3] }, { interact: 'core' }, { wait: 20 }]);
    for (let i = 0; i < 60 * 40; i++) sim.step(pilot.next());
    expect(completedAt).not.toBeNull();
    expect(sim.recorder.active).toBe(false);
    expect(sim.stats.echoesCreated).toBe(1);
  });
});
