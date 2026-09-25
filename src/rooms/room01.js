import { wallX } from './helpers.js';

// Teaches the core loop: record yourself holding a plate, let the Echo hold it while you pass.
export default {
  id: 1,
  name: 'ECHO PRIMER',
  objective: 'Charge the energy node behind the gate.',
  hint: 'Stand on the plate until the cycle ends. Your Echo walks back to it and holds it, so the gate stays open while you pass.',
  steps: [
    'Stand on the glowing plate and wait for the cycle timer to reach zero.',
    'Your Echo appears at the entrance and repeats that walk, then stands on the plate.',
    'While the Echo holds the plate, walk through the open gate.',
    'Look at the white energy node and press E to charge it.',
  ],
  w: 14,
  d: 12,
  h: 5,
  entranceX: 0,
  exitX: 0,
  maxEchoes: 2,
  accent: 'blue',
  walls: [...wallX(-1, -7, 7, [[0, 2.4]])],
  objects: [
    { type: 'plate', id: 'pA', pos: [-4.5, 0, 2.5] },
    { type: 'door', id: 'd1', pos: [0, 0, -1], opensWhen: 'pA', openTime: 0.4, closeTime: 0.3 },
    { type: 'node', id: 'core', pos: [2.5, 0, -3.8] },
  ],
};
