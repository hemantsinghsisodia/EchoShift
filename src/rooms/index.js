import room01 from './room01.js';
import room02 from './room02.js';
import room03 from './room03.js';
import room04 from './room04.js';
import room05 from './room05.js';
import room06 from './room06.js';
import room07 from './room07.js';
import room08 from './room08.js';
import escape from './escape.js';

/** Ordered lab layout. Add a room by creating a config and inserting it here. */
export const ROOM_CONFIGS = [room01, room02, room03, room04, room05, room06, room07, room08, escape];
export const PUZZLE_ROOM_COUNT = ROOM_CONFIGS.filter((c) => (c.kind ?? 'puzzle') === 'puzzle').length;
