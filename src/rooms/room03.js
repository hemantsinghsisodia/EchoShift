import { wallX } from './helpers.js';
import { not } from '../puzzle/Logic.js';

// The plate switches the laser grid off. Record yourself on it; the Echo holds it while you pass.
export default {
  id: 3,
  name: 'THRESHOLD',
  objective: 'Switch off the laser grid and charge the node.',
  hint: 'Lasers kill you but cannot hurt Echoes. The grid stays off only while someone stands on the plate.',
  steps: [
    'Stand on the glowing plate until the cycle ends.',
    'Your Echo walks back to the plate and holds it. The laser grid switches off.',
    'Walk through the gap in the wall.',
    'Charge the node.',
  ],
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
    { type: 'plate', id: 'pA', pos: [5, 0, 1.5] },
    { type: 'laser', id: 'grid', min: [-1.2, 0, -3.05], max: [1.2, 3.2, -2.95], activeWhen: not('pA') },
    { type: 'node', id: 'core', pos: [-3, 0, -5.5] },
  ],
};
