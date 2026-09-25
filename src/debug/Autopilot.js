import { idleInput } from '../core/Input.js';
import { TICK_RATE } from '../core/config.js';
import { dist2D, yawTo } from '../math/vec.js';

const DEFAULT_TIMEOUT = 40;

/**
 * Drives the real Simulation with synthetic input following a scripted list of steps
 * (room-local coordinates). Used by headless tests and by window.__echoDebug.solve(n).
 *
 * Steps:
 *  { goto: [x, z], sprint = true, jump = false, tol = 0.3 }
 *  { jumpOver: [x, z], at }         run toward point, jump after `at` metres
 *  { interact: 'objectId' }          face object and press E (fails if not targeted)
 *  { waitRoom: seconds }             wait until the room clock reaches seconds
 *  { waitDoor: 'doorId' }            wait until the door is passable
 *  { waitPlatform: id, phase, within } wait for a platform phase (optionally within N s of its start)
 *  { until: (sim) => bool }          wait for an arbitrary condition
 *  { exit: true }                    walk through the exit into the next room
 */
export class Autopilot {
  constructor(sim, steps, { label = 'autopilot' } = {}) {
    this.sim = sim;
    this.steps = steps;
    this.label = label;
    this.index = 0;
    this.state = null;
    this.done = steps.length === 0;
    this.error = null;
    this.yaw = sim.player.yaw;
    this.pitch = 0;
  }

  fail(msg) {
    this.error = new Error(`[${this.label}] step ${this.index} ${JSON.stringify(this.steps[this.index], replacer)}: ${msg}`);
    this.done = true;
  }

  next() {
    for (let guard = 0; guard < 32 && !this.done; guard++) {
      const step = this.steps[this.index];
      if (!this.state) this.state = { startTick: this.sim.tick, room: this.sim.room, data: {} };
      const elapsed = (this.sim.tick - this.state.startTick) / TICK_RATE;
      if (elapsed > (step.timeout ?? DEFAULT_TIMEOUT)) {
        this.fail(`timed out after ${elapsed.toFixed(1)}s (room clock ${(this.sim.room.clock / TICK_RATE).toFixed(2)}s)`);
        break;
      }
      const input = this.run(step, this.state);
      if (this.done) break;
      if (input) return input;
      this.index++;
      this.state = null;
      if (this.index >= this.steps.length) this.done = true;
    }
    return idleInput(this.yaw, this.pitch);
  }

  world(room, p) {
    return room.toWorld(p[0], 0, p[1]);
  }

  steer(target, { sprint = true, jump = false, tol = 0.3 } = {}) {
    const p = this.sim.player.pos;
    const d = dist2D(p.x, p.z, target.x, target.z);
    if (d <= tol) return null;
    this.yaw = yawTo(p.x, p.z, target.x, target.z);
    const input = idleInput(this.yaw, this.pitch);
    input.forward = true;
    input.sprint = sprint && d > 1.2;
    input.jump = jump;
    return input;
  }

  run(step, st) {
    const sim = this.sim;
    const room = st.room;

    if (step.goto) return this.steer(this.world(room, step.goto), step);

    if (step.jumpOver) {
      const target = this.world(room, step.jumpOver);
      if (!st.data.start) st.data.start = { x: sim.player.pos.x, z: sim.player.pos.z };
      const run = dist2D(st.data.start.x, st.data.start.z, sim.player.pos.x, sim.player.pos.z);
      const input = this.steer(target, { sprint: true, tol: step.tol ?? 0.4 });
      if (input) {
        input.sprint = true;
        if (run >= (step.at ?? 1) && !st.data.jumped) {
          input.jump = true;
          st.data.jumped = true;
        }
      }
      return input;
    }

    if (step.interact) {
      const obj = room.byId[step.interact];
      if (!obj) return this.fail(`unknown object ${step.interact}`), null;
      this.yaw = yawTo(sim.player.pos.x, sim.player.pos.z, obj.pos.x, obj.pos.z);
      if (!st.data.pressed) {
        st.data.pressed = true;
        const input = idleInput(this.yaw, this.pitch);
        input.interact = true;
        st.data.expect = obj;
        return input;
      }
      if (sim.lastInteracted !== obj) this.fail(`interaction did not reach ${obj.id}`);
      return null;
    }

    if (step.waitRoom !== undefined) return room.clock / TICK_RATE >= step.waitRoom ? null : idleInput(this.yaw, this.pitch);

    if (step.wait !== undefined) return (sim.tick - st.startTick) / TICK_RATE >= step.wait ? null : idleInput(this.yaw, this.pitch);

    if (step.waitDoor) return room.byId[step.waitDoor].isOpen ? null : idleInput(this.yaw, this.pitch);

    if (step.waitPlatform) {
      const p = room.byId[step.waitPlatform];
      const ok = p.phase === step.phase && p.phaseTime <= (step.within ?? Infinity) * TICK_RATE;
      return ok ? null : idleInput(this.yaw, this.pitch);
    }

    if (step.until) return step.until(sim, room) ? null : idleInput(this.yaw, this.pitch);

    if (step.exit) {
      if (!st.data.path) {
        const next = sim.rooms[room.index + 1];
        const ex = room.origin.x + (room.cfg.exitX ?? 0);
        const z = room.bounds.minZ;
        st.data.path = [
          { x: ex, z: z + 1.2 },
          { x: ex, z: z - 2 },
          { x: next.spawn.x, z: next.spawn.z },
        ];
        if (next.kind === 'escape') st.data.path.push({ x: next.origin.x, z: next.origin.z });
        st.data.i = 0;
      }
      if (sim.state === 'escaped') return null;
      const path = st.data.path;
      while (st.data.i < path.length) {
        const input = this.steer(path[st.data.i], { sprint: true, tol: 0.35 });
        if (input) return input;
        st.data.i++;
      }
      return sim.room.index > room.index ? null : idleInput(this.yaw, this.pitch);
    }

    this.fail('unknown step type');
    return null;
  }
}

function replacer(key, value) {
  return typeof value === 'function' ? '[fn]' : value;
}
