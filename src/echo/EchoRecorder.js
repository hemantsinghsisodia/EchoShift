import { RECORD_EVERY } from '../core/config.js';
import { EchoTrack, STRIDE } from './EchoTrack.js';

/** Records the player's state at 30 Hz plus timestamped interaction events for one cycle. */
export class EchoRecorder {
  constructor() {
    this.active = false;
    this.frames = [];
    this.events = [];
    this.lastTick = -1;
  }

  start(player) {
    this.active = true;
    this.frames = [];
    this.events = [];
    this.lastTick = -1;
    this.pushFrame(0, player);
  }

  stop() {
    this.active = false;
    this.frames = [];
    this.events = [];
    this.lastTick = -1;
  }

  record(tick, player) {
    if (!this.active) return;
    if (tick % RECORD_EVERY === 0) this.pushFrame(tick, player);
  }

  recordEvent(tick, type, targetId = null) {
    if (!this.active) return;
    this.events.push({ tick, type, targetId });
  }

  pushFrame(tick, player) {
    if (tick === this.lastTick) return;
    const platform = player.platform;
    let x = player.pos.x;
    let y = player.pos.y;
    let z = player.pos.z;
    let pIndex = -1;
    if (platform) {
      pIndex = platform.index;
      x -= platform.pos.x;
      y -= platform.pos.y;
      z -= platform.pos.z;
    }
    this.frames.push(tick, x, y, z, player.yaw, player.pitch, player.flags, pIndex);
    this.lastTick = tick;
  }

  /** Close the cycle, returning an immutable track. Guarantees a final frame at `tick`. */
  finish(tick, player) {
    if (player) this.pushFrame(tick, player);
    const frames = new Float32Array(this.frames);
    const events = this.events.slice().sort((a, b) => a.tick - b.tick);
    const track = new EchoTrack(frames, events, tick);
    this.frames = [];
    this.events = [];
    this.lastTick = -1;
    return track;
  }

  get frameCount() {
    return this.frames.length / STRIDE;
  }
}
