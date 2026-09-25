import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/core/Simulation.js';
import { Autopilot } from '../src/debug/Autopilot.js';
import { CYCLE_TICKS, DEATH_DELAY_TICKS } from '../src/core/config.js';

describe('room restart / reset', () => {
  it('manual restart restores objects, clears echoes, respawns and counts', () => {
    const sim = new Simulation();
    sim.roomManager.begin(0);
    const pilot = new Autopilot(sim, [{ goto: [-4.5, 2.5] }, { waitRoom: 15.05 }, { goto: [0, 0.1] }]);
    for (let i = 0; i < CYCLE_TICKS + 200; i++) sim.step(pilot.next());
    expect(sim.echoes.count).toBe(1);
    expect(sim.room.byId.d1.openAmount).toBeGreaterThan(0);

    expect(sim.restartRoom()).toBe(true);
    const room = sim.room;
    expect(room.clock).toBe(0);
    expect(sim.echoes.count).toBe(0);
    expect(sim.cycleTick).toBe(0);
    expect(sim.recorder.active).toBe(true);
    expect(room.byId.d1.openAmount).toBe(0);
    expect(room.byId.pA.signal).toBe(false);
    expect(sim.player.pos).toMatchObject({ x: room.spawn.x, z: room.spawn.z });
    expect(sim.stats.restarts).toBe(1);
  });

  it('touching a laser kills the player and resets the room after a short delay', () => {
    const sim = new Simulation();
    sim.roomManager.begin(5);
    const resets = [];
    sim.bus.on('room:reset', (e) => resets.push(e.reason));
    const pilot = new Autopilot(sim, [{ goto: [0, 1] }]);
    let died = false;
    sim.bus.on('player:death', () => (died = true));
    for (let i = 0; i < 300 && !died; i++) sim.step(pilot.next());
    expect(died).toBe(true);
    expect(sim.state).toBe('dying');
    for (let i = 0; i < DEATH_DELAY_TICKS; i++) sim.step();
    expect(resets).toEqual(['death']);
    expect(sim.state).toBe('playing');
    expect(sim.stats.restarts).toBe(1);
  });

  it('falling into a pit resets the room', () => {
    const sim = new Simulation();
    sim.roomManager.begin(4);
    const pilot = new Autopilot(sim, [{ goto: [-5, -2] }]);
    let reason = null;
    sim.bus.on('player:death', (e) => (reason = e.reason));
    for (let i = 0; i < 400 && !reason; i++) sim.step(pilot.next());
    expect(reason).toBe('fall');
  });
});
