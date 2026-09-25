import { wallX, block } from './helpers.js';

// One Echo + a raised plate. Echoes replay jumps; a limit of 1 means each new Echo replaces the last.
export default {
  id: 2,
  name: 'HIGH GROUND',
  objective: 'Get the plate on the ledge held, then charge the node.',
  hint: 'Echoes copy your jumps. Only one Echo is allowed here, and each new one replaces the last. Let it hold the ledge plate while you go through the gate.',
  steps: [
    'Climb onto the crate, then jump up to the ledge.',
    'Stand on the plate there and wait for the cycle to end.',
    'Drop back down. Your Echo climbs the same way and holds the plate.',
    'Walk through the gate and charge the node.',
    'Do not record a second path. A new Echo replaces the one holding the plate.',
  ],
  w: 16,
  d: 16,
  h: 5,
  entranceX: 0,
  exitX: 0,
  maxEchoes: 1,
  accent: 'purple',
  blocks: [block(-8, 0, 2, -5, 1.8, 7), block(-4.9, 0, 4, -3.9, 0.9, 5)],
  walls: [...wallX(-3, -8, 8, [[0, 2.4]])],
  objects: [
    { type: 'plate', id: 'pA', pos: [-6.5, 1.8, 4.5] },
    { type: 'door', id: 'd1', pos: [0, 0, -3], opensWhen: 'pA', openTime: 0.4, closeTime: 0.3 },
    { type: 'node', id: 'core', pos: [3, 0, -5.8] },
  ],
};
