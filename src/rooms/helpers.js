import { WALL_THICKNESS } from '../core/config.js';

/**
 * Authoring helpers for room configs. Boxes are [x0, y0, z0, x1, y1, z1] in room-local metres;
 * y1 = null means "up to the ceiling". Door gaps get a lintel above door height automatically.
 */
export const DOOR_CLEARANCE = 3.2;

function span(a0, a1, gaps) {
  const segs = [];
  let cur = a0;
  const sorted = [...gaps].sort((g, h) => g[0] - h[0]);
  for (const [c, w] of sorted) {
    const g0 = c - w / 2;
    const g1 = c + w / 2;
    if (g0 > cur) segs.push([cur, g0]);
    cur = Math.max(cur, g1);
  }
  if (cur < a1) segs.push([cur, a1]);
  return { segs, sorted };
}

/** Wall running along X at constant z, from x0 to x1, with door gaps [[centerX, width], ...]. */
export function wallX(z, x0, x1, gaps = [], y0 = 0, y1 = null, t = WALL_THICKNESS) {
  const { segs, sorted } = span(x0, x1, gaps);
  const out = segs.map(([a, b]) => [a, y0, z - t / 2, b, y1, z + t / 2]);
  for (const [c, w] of sorted) out.push([c - w / 2, y0 + DOOR_CLEARANCE, z - t / 2, c + w / 2, y1, z + t / 2, 'lintel']);
  return out;
}

/** Wall running along Z at constant x, from z0 to z1, with door gaps [[centerZ, width], ...]. */
export function wallZ(x, z0, z1, gaps = [], y0 = 0, y1 = null, t = WALL_THICKNESS) {
  const { segs, sorted } = span(z0, z1, gaps);
  const out = segs.map(([a, b]) => [x - t / 2, y0, a, x + t / 2, y1, b]);
  for (const [c, w] of sorted) out.push([x - t / 2, y0 + DOOR_CLEARANCE, c - w / 2, x + t / 2, y1, c + w / 2, 'lintel']);
  return out;
}

/** Solid block (ledge, crate, mezzanine). */
export function block(x0, y0, z0, x1, y1, z1) {
  return [x0, y0, z0, x1, y1, z1];
}
