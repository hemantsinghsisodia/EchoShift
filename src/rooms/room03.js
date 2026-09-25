import { wallX } from './helpers.js';
import { sync } from '../puzzle/Logic.js';

// Two switches too far apart for one person, which must be pressed within 1 second of each other.
export default {
  id: 3,
  name: 'TWIN SWITCHES',
  objective: 'Press both switches within 1 second of each other.',
  hint: 'The switches are too far apart for one person. Watch the cycle timer: your Echo presses at the same reading you did.',
  w: 20,
  d: 14,
  h: 5,
  entranceX: 0,
  exitX: 0,
  maxEchoes: 2,
  accent: 'blue',
  walls: [...wallX(-3, -10, 10, [[0, 2.4]])],
  objects: [
    { type: 'switch', id: 'swA', mode: 'pulse', pos: [-9.3, 0, 1] },
    { type: 'switch', id: 'swB', mode: 'pulse', pos: [9.3, 0, 1] },
    { type: 'door', id: 'd1', pos: [0, 0, -3], opensWhen: sync(['swA', 'swB'], 1.0) },
    { type: 'node', id: 'core', pos: [-3, 0, -5.5] },
  ],
};
