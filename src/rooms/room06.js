import { wallX, block } from './helpers.js';
import { not } from '../puzzle/Logic.js';

// Laser hazards. The trap: your Echo repeats the switch press and turns the alcove laser back on.
export default {
  id: 6,
  name: 'CROSSFIRE',
  objective: 'Draw the Hunter aside, hold the alcove plate, then charge the node.',
  hint: 'Red beams kill you. Jump the low ones. Echoes pass through lasers, and they repeat every switch you press.',
  steps: [
    'Cycle 1: jump the low beam on the east side and stand there, so Echo 1 draws the Hunter away.',
    'Cycle 2: press the switch, jump the low beam into the alcove, and stand on the plate.',
    'Leave the alcove the moment cycle 3 starts, before Echo 2 presses the switch and turns the alcove laser back on.',
    'Walk through the centre laser grid while the plate is held, and charge the node.',
  ],
  w: 20,
  d: 16,
  h: 5,
  entranceX: 0,
  exitX: 0,
  maxEchoes: 2,
  abilities: ['swap', 'freeze'],
  hunter: {
    pos: [5.5, 5],
    patrol: [
      [5.5, 5],
      [5.5, -2.5],
      [1.5, -3.2],
      [-2.5, 2],
    ],
  },
  accent: 'purple',
  blocks: [block(2, 0, 1, 6, 1.1, 2), block(2, 0, -2, 6, 1.1, -1)],
  walls: [...wallX(0, -10, -6), ...wallX(-5, -10, 10, [[0, 2.4]])],
  objects: [
    { type: 'switch', id: 's2', mode: 'toggle', pos: [-3, 0, 6] },
    { type: 'plate', id: 'pA', pos: [-8, 0, -2.5] },
    { type: 'laser', id: 'l3', min: [-10, 0.22, 2.95], max: [10, 0.38, 3.05] },
    { type: 'laser', id: 'l2', min: [-6.05, 0, -5], max: [-5.95, 3.2, 0], activeWhen: not('s2') },
    { type: 'laser', id: 'l1', min: [-1.2, 0, -5.05], max: [1.2, 3.2, -4.95], activeWhen: not('pA') },
    { type: 'node', id: 'core', pos: [3, 0, -6.6] },
  ],
};
