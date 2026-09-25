import { wallX } from './helpers.js';

// Timed gate: the button is too far from the gate to sprint through in time.
export default {
  id: 4,
  name: 'TIMED GATES',
  objective: 'Get through both gates and charge the node.',
  hint: 'The gate button is too far from the gate. Let your Echo press it while you wait at the gate.',
  w: 18,
  d: 22,
  h: 5,
  entranceX: 0,
  exitX: 6,
  maxEchoes: 2,
  accent: 'purple',
  walls: [...wallX(-5, -9, 9, [[6, 2.4]]), ...wallX(-8, -9, 9, [[6, 2.4]])],
  objects: [
    { type: 'button', id: 'tb1', pos: [-8.2, 0, 9.8], duration: 2.2 },
    { type: 'plate', id: 'p1', pos: [-7, 0, 6.5] },
    { type: 'door', id: 'td1', pos: [6, 0, -5], opensWhen: 'tb1', openTime: 0.25, closeTime: 0.3 },
    { type: 'door', id: 'd2', pos: [6, 0, -8], opensWhen: 'p1', openTime: 0.4, closeTime: 0.3 },
    { type: 'node', id: 'core', pos: [2, 0, -10] },
  ],
};
