import { describe, it, expect } from 'vitest';
import { Room } from '../src/puzzle/Room.js';
import { Simulation } from '../src/core/Simulation.js';
import { Autopilot } from '../src/debug/Autopilot.js';

const cfg = {
  id: 98,
  name: 'FURNACE TEST',
  w: 12,
  d: 12,
  entranceX: 0,
  exitX: 0,
  objects: [
    { type: 'furnace', id: 'f', pos: [0, 0, 0], size: [2, 2] },
    { type: 'door', id: 'd', pos: [0, 0, -4], opensWhen: 'f' },
  ],
};

const echoAt = (x, z) => ({ kind: 'echo', isActivator: true, feet: { x, y: 0, z }, pos: { x, y: 0, z } });

describe('Echo Furnace', () => {
  it('consumes echoes, ignores the player and latches on permanently', () => {
    const room = new Room(cfg, 1, { x: 0, z: 0 });
    const f = room.byId.f;
    const burned = [];
    const ctx = { bus: null, onSacrifice: (e) => burned.push(e), activators: [{ kind: 'player', feet: { x: 0, y: 0, z: 0 } }] };
    f.sense(ctx);
    expect(f.signal).toBe(false);
    const e = echoAt(0.5, -0.5);
    ctx.activators = [e];
    f.sense(ctx);
    expect(burned).toEqual([e]);
    expect(f.signal).toBe(true);
    ctx.activators = [];
    f.sense(ctx);
    expect(f.signal).toBe(true);
    room.reset();
    expect(f.signal).toBe(false);
  });

  it('in the simulation the echo collapses, paradox rises and the player walks through unharmed', () => {
    const sim = new Simulation();
    sim.roomManager.begin(4);
    const events = [];
    sim.bus.on('echo:sacrifice', () => events.push('sacrifice'));
    sim.bus.on('player:death', () => events.push('death'));
    const pilot = new Autopilot(sim, [{ goto: [-2.5, 6.5] }, { goto: [0, 3.6] }, { waitRoom: 15.05 }, { wait: 5 }]);
    for (let i = 0; i < 60 * 22 && !pilot.done; i++) sim.step(pilot.next());
    expect(events).toEqual(['sacrifice']);
    expect(sim.room.byId.furnace.lit).toBe(true);
    expect(sim.echoes.count).toBe(0);
    expect(sim.paradox.value).toBe(5);
  });
});
