import { wallX, wallZ } from './helpers.js';

// Teaches Echo Freeze: the plate sits in a pulsing laser field, so the Echo only crosses it briefly.
export default {
  id: 4,
  name: 'TIMED GATES',
  objective: 'Hold the plate long enough to clear all three gates.',
  hint: 'Press F while aiming at an Echo to freeze it for 5 seconds. A frozen Echo keeps holding the plate it stands on.',
  steps: [
    'The laser field pulses. Step onto the plate only while it is off, then step off before it comes back.',
    'Next cycle, wait by the three gates and watch the plate through the glass.',
    'Press F the moment the Echo is standing on the plate.',
    'Run through all three gates within those 5 seconds, then charge the node.',
  ],
  w: 18,
  d: 22,
  h: 5,
  entranceX: 0,
  exitX: 6,
  maxEchoes: 1,
  abilities: ['swap', 'freeze'],
  accent: 'purple',
  walls: [
    ...wallX(-2, -9, 9, [[6, 2.4]]),
    ...wallX(-5, -9, 9, [[6, 2.4]]),
    ...wallX(-8, -9, 9, [[6, 2.4]]),
  ],
  glass: [...wallZ(0, 0.5, 6, [], 0, 3.2, 0.12)],
  objects: [
    { type: 'plate', id: 'p1', pos: [-3, 0, 3] },
    { type: 'laser', id: 'field', min: [-4.4, 0, 1.6], max: [-1.6, 2.2, 4.4], pulse: { period: 3, on: 1.5 } },
    { type: 'door', id: 'g1', pos: [6, 0, -2], opensWhen: 'p1', openTime: 0.4, closeTime: 0.25 },
    { type: 'door', id: 'g2', pos: [6, 0, -5], opensWhen: 'p1', openTime: 0.4, closeTime: 0.25 },
    { type: 'door', id: 'g3', pos: [6, 0, -8], opensWhen: 'p1', openTime: 0.4, closeTime: 0.25 },
    { type: 'node', id: 'core', pos: [2, 0, -10] },
  ],
};
