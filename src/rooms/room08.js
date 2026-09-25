import { wallX, wallZ } from './helpers.js';
import { all, any, not, sync } from '../puzzle/Logic.js';

// Final room: plates, lasers, a moving platform, timed doors, relays and synced switches.
export default {
  id: 8,
  name: 'REACTOR CORE',
  objective: 'Charge both relays, sync the twin switches, then start the reactor.',
  hint: 'Everything you have learned. Plan your cycles: each one becomes a teammate.',
  w: 34,
  d: 28,
  h: 6,
  entranceX: 0,
  exitX: -11,
  maxEchoes: 4,
  abilities: ['swap', 'freeze'],
  exitDelay: 3.5,
  final: true,
  accent: 'purple',
  floors: [
    [-17, -14, 17, -3],
    [-17, 3, 17, 14],
    [-17, -3, 8, 3],
    [14, -3, 17, 3],
  ],
  pits: [[8, -3, 14, 3]],
  walls: [
    ...wallX(3, -17, -10),
    ...wallX(7, -17, -10),
    ...wallX(3, 8, 17),
    ...wallX(-3, 8, 17),
    ...wallX(-6, -17, 17, [
      [-11, 2.4],
      [0, 2.4],
    ]),
    ...wallZ(-5, -14, -6),
  ],
  objects: [
    { type: 'plate', id: 'pA', pos: [6, 0, 10] },
    { type: 'laser', id: 'l1', min: [-10.05, 0, 3], max: [-9.95, 3.2, 7], activeWhen: not('pA') },
    { type: 'node', id: 'n1', pos: [-15.5, 0, 5], objective: false, label: 'RELAY A' },
    { type: 'platform', id: 'mp1', pos: [9.5, 0, 0], to: [12.5, 0, 0], size: [3, 3], period: 7.5, pause: 1 },
    { type: 'button', id: 'tb1', pos: [16.2, 0, 0], duration: 4 },
    { type: 'door', id: 'td1', pos: [0, 0, -6], opensWhen: any(['tb1', 'tb2']), openTime: 0.3, closeTime: 0.4 },
    { type: 'button', id: 'tb2', pos: [2, 0, -7.2], duration: 4 },
    { type: 'node', id: 'n2', pos: [4, 0, -11], objective: false, label: 'RELAY B' },
    { type: 'switch', id: 'sw1', mode: 'pulse', pos: [-16.2, 0, -4.5] },
    { type: 'switch', id: 'sw2', mode: 'pulse', pos: [16.2, 0, -4.5] },
    { type: 'door', id: 'dCore', pos: [-11, 0, -6], opensWhen: all(['n1', 'n2', sync(['sw1', 'sw2'], 1.0)]) },
    { type: 'node', id: 'reactor', pos: [-13.5, 0, -10.5], label: 'REACTOR CORE' },
  ],
};
