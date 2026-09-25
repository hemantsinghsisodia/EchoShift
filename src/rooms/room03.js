import { wallX } from './helpers.js';

// Teaches Echo Swap: push an Echo's future through a laser it cannot be hurt by, then swap into it.
export default {
  id: 3,
  name: 'THRESHOLD',
  objective: 'Get past the laser grid and charge the node.',
  hint: 'Press Q while aiming at an Echo to swap places. Swap trades places, and your Echo\'s whole future moves with it.',
  w: 20,
  d: 14,
  h: 5,
  entranceX: 0,
  exitX: 0,
  maxEchoes: 2,
  abilities: ['swap'],
  accent: 'blue',
  walls: [...wallX(-3, -10, 10, [[0, 2.4]])],
  objects: [
    { type: 'laser', id: 'grid', min: [-1.2, 0, -3.05], max: [1.2, 3.2, -2.95] },
    { type: 'node', id: 'core', pos: [-3, 0, -5.5] },
  ],
};
