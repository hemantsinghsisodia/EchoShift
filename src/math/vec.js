export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);

const TAU = Math.PI * 2;

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Interpolate angles along the shortest arc. */
export function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export function dist2D(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Yaw that makes a first-person camera look from (ax, az) toward (bx, bz). -Z is yaw 0. */
export function yawTo(ax, az, bx, bz) {
  return Math.atan2(-(bx - ax), -(bz - az));
}

export function forwardFromYaw(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const copy3 = (out, a) => {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
};
