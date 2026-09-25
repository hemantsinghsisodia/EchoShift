import { Autopilot } from './Autopilot.js';
import { SOLUTIONS } from './solutions.js';

/**
 * Run the scripted solution for the current room headlessly.
 * Returns { ok, ticks, error, log } where log lists key simulation events.
 */
export function runRoomSolution(sim, roomIndex, { maxTicks = 60 * 180 } = {}) {
  const steps = SOLUTIONS[roomIndex];
  const pilot = new Autopilot(sim, steps, { label: `room${roomIndex + 1}` });
  const log = [];
  const off = sim.bus.on('*', (e) => {
    if (['room:complete', 'room:enter', 'echo:spawn', 'echo:collapse', 'player:death', 'room:reset', 'ending:start', 'ending:escaped'].includes(e.type)) {
      log.push(`${(sim.room.clock / 60).toFixed(2)}s ${e.type}${e.reason ? ' ' + e.reason : ''}`);
    }
  });
  const deaths = [];
  const offDeath = sim.bus.on('player:death', (e) => deaths.push(e.reason));
  let ticks = 0;
  while (!pilot.done && ticks < maxTicks) {
    sim.step(pilot.next());
    ticks++;
    if (deaths.length) break;
  }
  off();
  offDeath();
  const error = pilot.error ?? (deaths.length ? new Error(`room${roomIndex + 1}: player died (${deaths[0]})`) : ticks >= maxTicks ? new Error(`room${roomIndex + 1}: tick limit`) : null);
  return { ok: !error, ticks, error, log };
}
