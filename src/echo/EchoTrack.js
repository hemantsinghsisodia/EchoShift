import { lerp, lerpAngle } from '../math/vec.js';
import { FLAG_BLINK } from '../core/config.js';

export const STRIDE = 8;
export const F_TICK = 0;
export const F_X = 1;
export const F_Y = 2;
export const F_Z = 3;
export const F_YAW = 4;
export const F_PITCH = 5;
export const F_FLAGS = 6;
export const F_PLATFORM = 7;

/**
 * Immutable recording of one echo cycle.
 * frames: Float32Array of [tick, x, y, z, yaw, pitch, flags, platformIndex] (platform-relative xyz when platformIndex >= 0)
 * events: sorted [{ tick, type, targetId }]
 */
export class EchoTrack {
  constructor(frames, events, lengthTicks) {
    this.frames = frames;
    this.frameCount = frames.length / STRIDE;
    this.events = events;
    this.lengthTicks = lengthTicks;
    Object.freeze(this.events);
  }

  get lastTick() {
    return this.frames[(this.frameCount - 1) * STRIDE + F_TICK];
  }

  frameTick(i) {
    return this.frames[i * STRIDE + F_TICK];
  }

  /** World position of frame i given the current platform positions. */
  frameWorld(i, platforms, out) {
    const o = i * STRIDE;
    const f = this.frames;
    const p = f[o + F_PLATFORM];
    out.x = f[o + F_X];
    out.y = f[o + F_Y];
    out.z = f[o + F_Z];
    if (p >= 0 && platforms && platforms[p]) {
      const pp = platforms[p].pos;
      out.x += pp.x;
      out.y += pp.y;
      out.z += pp.z;
    }
    return out;
  }

  /**
   * Sample the track at tick t (fractional allowed). `cursor` is an object { i } kept by the
   * caller so sequential playback is O(1). Writes into out { x, y, z, yaw, pitch, flags }.
   */
  sample(t, cursor, platforms, out) {
    const n = this.frameCount;
    const f = this.frames;
    if (cursor.i > 0 && this.frameTick(cursor.i) > t) cursor.i = 0;
    while (cursor.i < n - 2 && this.frameTick(cursor.i + 1) <= t) cursor.i++;
    const i = cursor.i;
    const a = i * STRIDE;
    if (n === 1 || t <= f[a + F_TICK]) return this.copyFrame(i, platforms, out);
    if (t >= this.lastTick) return this.copyFrame(n - 1, platforms, out);
    const b = a + STRIDE;
    if (f[b + F_FLAGS] & FLAG_BLINK) return this.copyFrame(i, platforms, out);
    const ta = f[a + F_TICK];
    const tb = f[b + F_TICK];
    const u = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0;
    const pa = f[a + F_PLATFORM];
    const pb = f[b + F_PLATFORM];
    if (pa === pb) {
      out.x = lerp(f[a + F_X], f[b + F_X], u);
      out.y = lerp(f[a + F_Y], f[b + F_Y], u);
      out.z = lerp(f[a + F_Z], f[b + F_Z], u);
      if (pa >= 0 && platforms && platforms[pa]) {
        const pp = platforms[pa].pos;
        out.x += pp.x;
        out.y += pp.y;
        out.z += pp.z;
      }
    } else {
      const wa = this.frameWorld(i, platforms, scratchA);
      const wb = this.frameWorld(i + 1, platforms, scratchB);
      out.x = lerp(wa.x, wb.x, u);
      out.y = lerp(wa.y, wb.y, u);
      out.z = lerp(wa.z, wb.z, u);
    }
    out.yaw = lerpAngle(f[a + F_YAW], f[b + F_YAW], u);
    out.pitch = lerp(f[a + F_PITCH], f[b + F_PITCH], u);
    out.flags = f[a + F_FLAGS];
    return out;
  }

  copyFrame(i, platforms, out) {
    const o = i * STRIDE;
    this.frameWorld(i, platforms, out);
    out.yaw = this.frames[o + F_YAW];
    out.pitch = this.frames[o + F_PITCH];
    out.flags = this.frames[o + F_FLAGS];
    return out;
  }
}

const scratchA = { x: 0, y: 0, z: 0 };
const scratchB = { x: 0, y: 0, z: 0 };
