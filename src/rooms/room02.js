import { wallX, block } from './helpers.js';

// One Echo + a raised plate. Echoes replay jumps; a limit of 1 means each new Echo replaces the last.
export default {
  id: 2,
  name: 'HIGH GROUND',
  objective: 'Get the plate on the ledge held, then charge the node.',
  hint: 'Echoes copy your jumps too. Only 1 Echo is allowed here, and each new one replaces the last.',
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
