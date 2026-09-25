import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/core/Simulation.js';
import { Autopilot } from '../src/debug/Autopilot.js';
import { CYCLE_TICKS } from '../src/core/config.js';

function drive(sim, steps, ticks) {
  const pilot = new Autopilot(sim, steps);
  for (let i = 0; i < ticks; i++) sim.step(pilot.next());
  return pilot;
}

describe('echo interaction replay (real simulation)', () => {
  it('an echo repeats a switch press at the same cycle tick', () => {
    const sim = new Simulation();
    sim.roomManager.begin(2);
    const presses = [];
    sim.bus.on('switch:press', ({ obj, by }) => presses.push({ id: obj.id, by, tick: sim.room.clock }));
    drive(sim, [{ goto: [-7.9, 1] }, { waitRoom: 5 }, { interact: 'swA' }], CYCLE_TICKS * 2);
    expect(presses).toEqual([
      { id: 'swA', by: 'player', tick: 301 },
      { id: 'swA', by: 'echo', tick: 301 + CYCLE_TICKS },
    ]);
  });

  it('an echo toggles a toggle switch again (room 6 trap) and restarts timed buttons', () => {
    const sim = new Simulation();
    sim.roomManager.begin(5);
    const s2 = sim.room.byId.s2;
    drive(sim, [{ goto: [-2.2, 6.4], sprint: false }, { interact: 's2' }], CYCLE_TICKS - 5);
    expect(s2.on).toBe(true);
    drive(sim, [], CYCLE_TICKS);
    expect(s2.on).toBe(false);

    const sim2 = new Simulation();
    sim2.roomManager.begin(3);
    const tb1 = sim2.room.byId.tb1;
    drive(sim2, [{ goto: [-7.4, 8.4] }, { waitRoom: 12 }, { interact: 'tb1' }], CYCLE_TICKS + 12 * 60 + 5);
    expect(tb1.signal).toBe(true);
    expect(tb1.lastPressBy).toBe('echo');
  });

  it('an echo out of range of the recorded target does nothing', () => {
    const sim = new Simulation();
    sim.roomManager.begin(2);
    const echoLike = { pos: { ...sim.room.byId.swB.pos }, kind: 'echo' };
    echoLike.pos.x -= 8;
    sim.replayEvent(echoLike, { type: 'interact', targetId: 'swB' });
    expect(sim.room.byId.swB.lastPressTick).toBe(-Infinity);
  });

  it('an echo holds a plate after replaying', () => {
    const sim = new Simulation();
    sim.roomManager.begin(0);
    drive(sim, [{ goto: [-4.5, 2.5] }, { waitRoom: 15.05 }, { goto: [0, 0.1] }], CYCLE_TICKS + 180);
    expect(sim.echoes.count).toBe(1);
    expect(sim.room.byId.pA.signal).toBe(true);
    expect(sim.room.byId.d1.isOpen).toBe(true);
  });

  it('paradox: an echo walking into a closed door collapses', () => {
    const sim = new Simulation();
    sim.roomManager.begin(0);
    const collapses = [];
    sim.bus.on('echo:collapse', (e) => collapses.push(e.reason));
    drive(sim, [{ goto: [-4.5, 2.5] }, { waitRoom: 15.05 }, { goto: [0, 0.1] }, { waitDoor: 'd1' }, { goto: [0, -2.4] }, { waitRoom: 29.9 }], CYCLE_TICKS * 2);
    // Echo 2 (from cycle 2) walks through d1; the plate is held by echo 1 so the door is open: no paradox.
    expect(collapses).not.toContain('paradox');
    // Now release the plate by clearing echo 1 and let echo 2 walk into the closed door.
    const sim2 = new Simulation();
    sim2.roomManager.begin(0);
    const c2 = [];
    sim2.bus.on('echo:collapse', (e) => c2.push(e.reason));
    drive(sim2, [{ goto: [-4.5, 2.5] }, { waitRoom: 15.05 }, { goto: [0, 0.1] }, { waitDoor: 'd1' }, { goto: [0, -2.4] }], CYCLE_TICKS + 400);
    sim2.echoes.echoes[0].collapse('evicted');
    drive(sim2, [], CYCLE_TICKS + 200);
    expect(c2).toContain('paradox');
  });
});
