import { ECHO_RADIUS, PLAYER, ECHO_SPAWN_TICKS, ECHO_COLLAPSE_TICKS } from '../core/config.js';
import { FLAG_GROUNDED, FLAG_WALKING } from '../player/Player.js';
import { v3, copy3 } from '../math/vec.js';

/**
 * A replaying past self. States: spawning -> replaying -> holding; collapsing on eviction/paradox.
 * Echoes are kinematic: they follow the recorded path exactly and count as activators.
 */
export class Echo {
  constructor(track, id, platforms) {
    this.track = track;
    this.id = `echo${id}`;
    this.serial = id;
    this.kind = 'echo';
    this.radius = ECHO_RADIUS;
    this.height = PLAYER.height;
    this.replayTick = 0;
    this.age = 0;
    this.state = 'spawning';
    this.cursor = { i: 0 };
    this.eventCursor = 0;
    this.pos = v3();
    this.prevPos = v3();
    this.yaw = 0;
    this.pitch = 0;
    this.flags = 0;
    this.collapseAge = 0;
    this.collapseReason = null;
    this.dead = false;
    this.overlapTicks = 0;
    this.strideAcc = 0;
    this.offset = v3();
    this.frozenTicks = 0;
    this.lastSwapTick = -Infinity;
    this.sampleOut = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0 };
    this.applySample(0, platforms);
    copy3(this.prevPos, this.pos);
  }

  get feet() {
    return this.pos;
  }

  get grounded() {
    return (this.flags & FLAG_GROUNDED) !== 0;
  }

  get walking() {
    return (this.flags & FLAG_WALKING) !== 0 && this.state !== 'holding';
  }

  get isActivator() {
    return this.state !== 'collapsing' && !this.dead;
  }

  get spawnProgress() {
    return Math.min(1, this.age / ECHO_SPAWN_TICKS);
  }

  get collapseProgress() {
    return Math.min(1, this.collapseAge / ECHO_COLLAPSE_TICKS);
  }

  get isFrozen() {
    return this.frozenTicks > 0 && this.isActivator;
  }

  /** Echo Swap: the echo jumps to pos and its entire remaining path shifts by the same vector. */
  swapTo(pos) {
    this.offset.x += pos.x - this.pos.x;
    this.offset.y += pos.y - this.pos.y;
    this.offset.z += pos.z - this.pos.z;
    this.pos.x = pos.x;
    this.pos.y = pos.y;
    this.pos.z = pos.z;
    copy3(this.prevPos, this.pos);
    this.lastSwapTick = this.age;
  }

  /** Echo Freeze: stop replaying (and firing events) for `ticks`; everything after is delayed. */
  freeze(ticks) {
    this.frozenTicks = ticks;
  }

  applySample(t, platforms) {
    const s = this.track.sample(t, this.cursor, platforms, this.sampleOut);
    this.pos.x = s.x + this.offset.x;
    this.pos.y = s.y + this.offset.y;
    this.pos.z = s.z + this.offset.z;
    this.yaw = s.yaw;
    this.pitch = s.pitch;
    this.flags = s.flags;
  }

  collapse(reason) {
    if (this.state === 'collapsing') return;
    this.state = 'collapsing';
    this.collapseReason = reason;
    this.collapseAge = 0;
  }

  /**
   * Advance one tick. ctx.platforms for platform-relative frames,
   * ctx.onEvent(echo, event) fires recorded events at their exact tick.
   */
  update(ctx) {
    copy3(this.prevPos, this.pos);
    this.age++;
    if (this.state === 'collapsing') {
      this.collapseAge++;
      if (this.collapseAge >= ECHO_COLLAPSE_TICKS) this.dead = true;
      return;
    }
    const last = this.track.lastTick;
    if (this.frozenTicks > 0) {
      this.frozenTicks--;
      this.applySample(Math.min(this.replayTick, last), ctx.platforms);
      if (this.frozenTicks === 0) ctx.onUnfreeze?.(this);
      return;
    }
    if (this.state !== 'holding') {
      this.replayTick++;
      if (this.state === 'spawning' && this.age >= ECHO_SPAWN_TICKS) this.state = 'replaying';
    }
    this.applySample(Math.min(this.replayTick, last), ctx.platforms);

    const events = this.track.events;
    while (this.eventCursor < events.length && events[this.eventCursor].tick <= this.replayTick) {
      ctx.onEvent?.(this, events[this.eventCursor]);
      this.eventCursor++;
    }

    if (this.state !== 'holding' && this.replayTick >= last) this.state = 'holding';

    if (this.grounded && this.walking) {
      this.strideAcc += Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z);
      if (this.strideAcc >= PLAYER.strideLength) {
        this.strideAcc -= PLAYER.strideLength;
        ctx.onStep?.(this);
      }
    }
  }
}
