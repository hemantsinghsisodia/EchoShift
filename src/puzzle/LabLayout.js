import { Room } from './Room.js';
import { makeBox } from '../physics/Collision.js';
import { CORRIDOR_LENGTH, DOOR_WIDTH } from '../core/config.js';

export const CORRIDOR_HEIGHT = 3.6;

/**
 * Chains rooms northward (-Z) so each room's exit lines up with the next room's entrance,
 * joined by a short corridor. Returns the Room instances and corridor descriptors.
 */
export function buildLab(configs) {
  const rooms = [];
  const corridors = [];
  let origin = { x: 0, z: 0 };
  configs.forEach((cfg, i) => {
    if (i > 0) {
      const prev = configs[i - 1];
      const prevRoom = rooms[i - 1];
      origin = {
        x: prevRoom.origin.x + (prev.exitX ?? 0) - (cfg.entranceX ?? 0),
        z: prevRoom.origin.z - prev.d / 2 - CORRIDOR_LENGTH - cfg.d / 2,
      };
    }
    const room = new Room(cfg, i, origin);
    rooms.push(room);
    if (i > 0) corridors.push(makeCorridor(rooms[i - 1], room));
  });
  const corridorBoxes = corridors.flatMap((c) => c.boxes);
  return { rooms, corridors, corridorBoxes };
}

function makeCorridor(a, b) {
  const x = a.origin.x + (a.cfg.exitX ?? 0);
  const z0 = a.bounds.minZ;
  const z1 = b.bounds.maxZ;
  const hw = DOOR_WIDTH / 2;
  const floor = makeBox(x - hw - 0.4, -0.5, z1 - 0.2, x + hw + 0.4, 0, z0 + 0.2);
  const wallL = makeBox(x - hw - 0.4, 0, z1, x - hw, CORRIDOR_HEIGHT, z0);
  const wallR = makeBox(x + hw, 0, z1, x + hw + 0.4, CORRIDOR_HEIGHT, z0);
  const ceiling = makeBox(x - hw - 0.4, CORRIDOR_HEIGHT, z1, x + hw + 0.4, CORRIDOR_HEIGHT + 0.3, z0);
  return { x, z0, z1, floor, walls: [wallL, wallR], ceiling, boxes: [floor, wallL, wallR, ceiling] };
}
