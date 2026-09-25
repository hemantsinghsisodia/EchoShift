import { wallX, wallZ } from './helpers.js';
import { all, any } from '../puzzle/Logic.js';

// Three plates at once: build a team of Echoes one cycle at a time.
export default {
  id: 7,
  name: 'TRIAD',
  objective: 'Hold all three plates at the same time.',
  hint: 'Three plates need three bodies. Build your team one cycle at a time, and remember the way out of the alcove.',
  w: 24,
  d: 20,
  h: 5,
  entranceX: 0,
  exitX: 0,
  maxEchoes: 4,
  abilities: ['swap', 'freeze'],
  accent: 'blue',
  walls: [
    ...wallZ(9, -7, -4),
    ...wallX(-4, 9, 12, [[10.5, 2.2]]),
    ...wallX(-7, -12, 12, [[0, 2.4]]),
  ],
  objects: [
    { type: 'plate', id: 'pA', pos: [-9, 0, 4] },
    { type: 'plate', id: 'pB', pos: [9, 0, 4] },
    { type: 'plate', id: 'pC', pos: [10.2, 0, -5.6] },
    { type: 'button', id: 'tb1', pos: [7.5, 0, -3], duration: 4 },
    { type: 'button', id: 'tb2', pos: [11.5, 0, -6.4], duration: 4 },
    { type: 'door', id: 'td2', pos: [10.5, 0, -4], width: 2.2, opensWhen: any(['tb1', 'tb2']), openTime: 0.3, closeTime: 0.4 },
    { type: 'door', id: 'd1', pos: [0, 0, -7], opensWhen: all(['pA', 'pB', 'pC']) },
    { type: 'node', id: 'core', pos: [-4, 0, -8.6] },
  ],
};
