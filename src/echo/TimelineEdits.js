import { TIMELINE, TIMELINE_COST } from '../core/config.js';

export const EDIT_TYPES = Object.freeze(['delete', 'freeze', 'reverse', 'restart']);
export const editCost = (type) => TIMELINE_COST[type] ?? 0;

export class TimelineMap {
  constructor(lengthTicks, startTick = 0) {
    this.lengthTicks = lengthTicks;
    this.trackTick = Math.max(0, Math.min(lengthTicks, startTick));
    this.ops = [];
    this.runtime = null;
    this.pendingRestart = null;
  }

  add(type, cursorTick, currentReplayTick = this.trackTick) {
    if (!EDIT_TYPES.includes(type)) throw new Error(`Unknown timeline edit '${type}'`);
    let start = Math.round(cursorTick);
    if (type !== 'restart') start = Math.max(start, currentReplayTick);
    start = Math.max(0, Math.min(this.lengthTicks, start));
    if (type === 'restart') {
      this.pendingRestart = start;
      return { type, start, end: start };
    }
    const end = Math.min(this.lengthTicks, start + TIMELINE.sectionTicks);
    const op = { type, start, end, used: false };
    this.ops.push(op);
    this.ops.sort((a, b) => a.start - b.start);
    return op;
  }

  advance() {
    const previousTick = this.trackTick;
    if (this.pendingRestart !== null) {
      this.trackTick = this.pendingRestart;
      this.pendingRestart = null;
      return { previousTick, trackTick: this.trackTick, direction: 1, discontinuity: true };
    }

    if (this.runtime) return this.advanceRuntime(previousTick);
    const op = this.ops.find((candidate) => !candidate.used && candidate.start <= this.trackTick);
    if (op) {
      op.used = true;
      if (op.type === 'delete') {
        this.trackTick = op.end + 1;
        return { previousTick, trackTick: this.trackTick, direction: 1, discontinuity: true };
      }
      if (op.type === 'freeze') {
        this.runtime = { op, remaining: op.end - op.start };
        this.trackTick = op.start;
        return this.advanceRuntime(previousTick);
      }
      if (op.type === 'reverse') {
        this.runtime = { op, remaining: op.end - op.start };
        this.trackTick = Math.max(op.start, op.end - 1);
        return { previousTick, trackTick: this.trackTick, direction: -1, discontinuity: true };
      }
    }

    this.trackTick = Math.min(this.lengthTicks, this.trackTick + 1);
    return { previousTick, trackTick: this.trackTick, direction: 1, discontinuity: false };
  }

  advanceRuntime(previousTick) {
    const { op } = this.runtime;
    this.runtime.remaining--;
    if (op.type === 'freeze') {
      this.trackTick = op.start;
      if (this.runtime.remaining <= 0) {
        this.runtime = null;
        this.trackTick = Math.min(this.lengthTicks, op.start + 1);
        return { previousTick, trackTick: this.trackTick, direction: 1, discontinuity: false };
      }
      return { previousTick, trackTick: this.trackTick, direction: 0, discontinuity: false };
    }
    this.trackTick = Math.max(op.start, this.trackTick - 1);
    if (this.runtime.remaining <= 0) {
      this.runtime = null;
      this.trackTick = Math.min(this.lengthTicks, op.end + 1);
      return { previousTick, trackTick: this.trackTick, direction: 1, discontinuity: true };
    }
    return { previousTick, trackTick: this.trackTick, direction: -1, discontinuity: false };
  }
}

export class TimelineEdits {
  constructor(sim) {
    this.sim = sim;
    this.reset();
  }

  reset() {
    this.remaining = { ...(this.sim.room?.cfg.edits ?? {}) };
  }

  newestEcho() {
    return [...this.sim.echoes.echoes].reverse().find((echo) => echo.isActivator) ?? null;
  }

  apply(echo, type, cursorTick) {
    if (!echo || !EDIT_TYPES.includes(type)) return { ok: false, reason: 'INVALID EDIT' };
    if ((this.remaining[type] ?? 0) <= 0) return { ok: false, reason: 'NO EDITS LEFT' };
    const op = echo.timeline.add(type, cursorTick, echo.timeline.trackTick);
    this.remaining[type]--;
    this.sim.paradox.add(editCost(type), `timeline:${type}`);
    this.sim.bus.emit('timeline:edit', { echo, type, cursorTick: op.start, op });
    return { ok: true, op };
  }
}
