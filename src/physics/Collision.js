import { clamp } from '../math/vec.js';

/**
 * Colliders are axis-aligned boxes: { min: [x, y, z], max: [x, y, z], owner? }.
 * Actors are vertical capsules approximated by a circle in XZ plus a height range.
 */

export function makeBox(x0, y0, z0, x1, y1, z1, owner = null) {
  return {
    min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
    max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
    owner,
  };
}

export function circleOverlapsRect(cx, cz, r, box) {
  const px = clamp(cx, box.min[0], box.max[0]);
  const pz = clamp(cz, box.min[2], box.max[2]);
  const dx = cx - px;
  const dz = cz - pz;
  return dx * dx + dz * dz < r * r;
}

/** True if a capsule (feet at pos) overlaps the box in 3D. */
export function capsuleOverlapsBox(pos, radius, height, box) {
  if (box.min[1] >= pos.y + height || box.max[1] <= pos.y) return false;
  return circleOverlapsRect(pos.x, pos.z, radius, box);
}

/**
 * Push a circle out of every box that stands taller than the step height.
 * Iterating a few times resolves corners; resolving by closest point gives smooth wall sliding.
 */
export function resolveHorizontal(pos, radius, height, boxes, stepHeight) {
  let collided = false;
  for (let iter = 0; iter < 4; iter++) {
    let any = false;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.max[1] <= pos.y + stepHeight) continue;
      if (b.min[1] >= pos.y + height) continue;
      const px = clamp(pos.x, b.min[0], b.max[0]);
      const pz = clamp(pos.z, b.min[2], b.max[2]);
      const dx = pos.x - px;
      const dz = pos.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const push = radius - d + 1e-5;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else {
        const left = pos.x - b.min[0];
        const right = b.max[0] - pos.x;
        const back = pos.z - b.min[2];
        const front = b.max[2] - pos.z;
        const m = Math.min(left, right, back, front);
        if (m === left) pos.x = b.min[0] - radius;
        else if (m === right) pos.x = b.max[0] + radius;
        else if (m === back) pos.z = b.min[2] - radius;
        else pos.z = b.max[2] + radius;
      }
      any = true;
      collided = true;
    }
    if (!any) break;
  }
  return collided;
}

/** Highest box top under the circle that is not above maxTop. */
export function groundProbe(pos, radius, boxes, maxTop) {
  let top = -Infinity;
  let hit = null;
  const r = radius * 0.8;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const t = b.max[1];
    if (t > maxTop || t <= top) continue;
    if (!circleOverlapsRect(pos.x, pos.z, r, b)) continue;
    top = t;
    hit = b;
  }
  return { top, box: hit };
}

/** Lowest box bottom above the head that the capsule would hit when rising to newY. */
export function ceilingProbe(pos, radius, height, newY, boxes) {
  let limit = Infinity;
  const head = pos.y + height;
  const newHead = newY + height;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.min[1] < head - 0.01 || b.min[1] > newHead) continue;
    if (!circleOverlapsRect(pos.x, pos.z, radius * 0.9, b)) continue;
    limit = Math.min(limit, b.min[1] - height);
  }
  return limit;
}
