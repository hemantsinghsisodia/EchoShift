import { wallZ, block } from './helpers.js';
import { all } from '../puzzle/Logic.js';

// Moving platforms. Platform periods divide the 15 s cycle, so Echoes ride exactly as recorded.
export default {
  id: 5,
  name: 'SHUTTLE',
  objective: 'Hold the island plate, feed the furnace, then charge the node on the upper deck.',
  hint: 'The furnace burns Echoes, never you. Choose carefully which of your Echoes walks through it.',
  w: 20,
  d: 24,
  h: 7,
  entranceX: -5,
  exitX: -6,
  maxEchoes: 2,
  abilities: ['swap', 'freeze'],
  accent: 'blue',
  floors: [
    [-10, 3, 10, 12],
    [-10, -12, 10, -6],
  ],
  pits: [[-10, -6, 10, 3]],
  blocks: [block(4, 0, 6, 10, 3, 12)],
  walls: [...wallZ(6.5, 6, 12, [[9, 2.4]], 3, 7)],
  objects: [
    { type: 'platform', id: 'mp1', pos: [0, 0, 1.5], to: [0, 0, -4.5], size: [3, 3], period: 7.5, pause: 1 },
    { type: 'platform', id: 'mp2', pos: [3, 0, 9], to: [3, 3, 9], size: [2, 2], period: 5, pause: 1 },
    { type: 'plate', id: 'pA', pos: [0, 0, -9] },
    { type: 'furnace', id: 'furnace', pos: [-2.5, 0, 6.5], size: [2.4, 2.4] },
    { type: 'door', id: 'd1', pos: [6.5, 3, 9], axis: 'z', opensWhen: all(['pA', 'furnace']), openTime: 0.4, closeTime: 0.3 },
    { type: 'node', id: 'core', pos: [8.8, 3, 9] },
  ],
};
