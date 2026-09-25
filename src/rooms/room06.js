import { wallX } from './helpers.js';
import { not } from '../puzzle/Logic.js';

// Laser hazards. The trap: your Echo repeats the switch press and turns the alcove laser back on.
export default {
  id: 6,
  name: 'CROSSFIRE',
  objective: 'Get past the laser grid and charge the node.',
  hint: 'Red means danger. Jump over low beams. Echoes pass through lasers, and they repeat every switch you pressed.',
  w: 20,
  d: 16,
  h: 5,
  entranceX: 0,
  exitX: 0,
  maxEchoes: 2,
  abilities: ['swap', 'freeze'],
  accent: 'purple',
  walls: [...wallX(0, -10, -6), ...wallX(-5, -10, 10, [[0, 2.4]])],
  objects: [
    { type: 'switch', id: 's2', mode: 'toggle', pos: [-3, 0, 5.5] },
    { type: 'plate', id: 'pA', pos: [-8, 0, -2.5] },
    { type: 'laser', id: 'l3', min: [-10, 0.22, 2.95], max: [10, 0.38, 3.05] },
    { type: 'laser', id: 'l2', min: [-6.05, 0, -5], max: [-5.95, 3.2, 0], activeWhen: not('s2') },
    { type: 'laser', id: 'l1', min: [-1.2, 0, -5.05], max: [1.2, 3.2, -4.95], activeWhen: not('pA') },
    { type: 'node', id: 'core', pos: [3, 0, -6.6] },
  ],
};
