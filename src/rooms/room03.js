import { wallX } from './helpers.js';

// Teaches Echo Swap: push an Echo's future through a laser it cannot be hurt by, then swap into it.
export default {
  id: 3,
  name: 'THRESHOLD',
  objective: 'Send your Echo through the laser grid, then swap into it.',
  hint: 'Lasers cannot hurt Echoes. When you swap (Q), you trade places, and the rest of the Echo\'s path shifts by the same distance.',
  steps: [
    'Cycle 1: walk straight toward the laser grid and stop just in front of it. Wait for the cycle to end.',
    'Cycle 2: Echo 1 repeats that walk from the entrance. Stand a few steps ahead of it, between it and the grid.',
    'Aim at the Echo and press Q. Its walk now ends past the grid, so it walks through the laser.',
    'When it is fully past the beam and Q has recharged, press Q again. A swap is blocked while the Echo stands in the beam.',
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
    { type: 'laser', id: 'grid', min: [-1.2, 0, -3.05], max: [1.2, 3.2, -2.95] },
    { type: 'node', id: 'core', pos: [-3, 0, -5.5] },
  ],
};
