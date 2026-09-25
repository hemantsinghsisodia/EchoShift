import { ABILITIES, PARADOX_COST, PLAYER, TICK_RATE } from '../core/config.js';
import { capsuleOverlapsBox, groundProbe } from '../physics/Collision.js';
import { dist2D, wrapAngle, yawTo } from '../math/vec.js';

/** The live echo closest to the actor's crosshair within range (horizontal facing cone). */
export function targetEcho(actor, echoes, range, maxAngle = ABILITIES.targetAngle) {
  let best = null;
  let bestAngle = Infinity;
  for (const e of echoes) {
    if (!e.isActivator) continue;
    const d = dist2D(actor.pos.x, actor.pos.z, e.pos.x, e.pos.z);
    if (d > range || d < 0.05) continue;
    const angle = Math.abs(wrapAngle(yawTo(actor.pos.x, actor.pos.z, e.pos.x, e.pos.z) - actor.yaw));
    const allowed = Math.max(maxAngle, Math.atan2(0.5, d));
    if (angle > allowed || angle >= bestAngle) continue;
    best = e;
    bestAngle = angle;
  }
  return best;
}

/**
 * Echo Swap and Echo Freeze. All validation happens here so the simulation stays the single
 * source of truth; results are reported through the bus (echo:swap, echo:freeze, ability:blocked).
 */
export class EchoAbilities {
  constructor(sim) {
    this.sim = sim;
    this.reset();
  }

  reset() {
    this.swapReadyAt = 0;
    this.freezeReadyAt = 0;
    this.lastResult = null;
  }

  allowed(name) {
    return this.sim.room.cfg.abilities?.includes(name) ?? false;
  }

  get anyAllowed() {
    return this.allowed('swap') || this.allowed('freeze');
  }

  /** Remaining cooldown fraction 0..1 (0 = ready). */
  cooldown(name) {
    const readyAt = name === 'swap' ? this.swapReadyAt : this.freezeReadyAt;
    const total = (name === 'swap' ? ABILITIES.swapCooldown : ABILITIES.freezeCooldown) * TICK_RATE;
    return Math.max(0, Math.min(1, (readyAt - this.sim.tick) / total));
  }

  target(range) {
    return targetEcho(this.sim.player, this.sim.echoes.echoes, range);
  }

  hasSight(echo) {
    const p = this.sim.player.pos;
    return this.sim.world.lineOfSight(
      { x: p.x, y: p.y + ABILITIES.eyeHeight, z: p.z },
      { x: echo.pos.x, y: echo.pos.y + ABILITIES.targetHeight, z: echo.pos.z },
    );
  }

  block(ability, reason) {
    this.lastResult = { ability, ok: false, reason, tick: this.sim.tick };
    this.sim.bus.emit('ability:blocked', { ability, reason });
    return false;
  }

  succeed(ability, echo) {
    this.lastResult = { ability, ok: true, reason: null, tick: this.sim.tick, echo };
    return true;
  }

  /** Why the player could not stand where the echo stands, or null if safe. */
  destinationProblem(pos) {
    const sim = this.sim;
    const probe = { pos, radius: PLAYER.radius, height: PLAYER.height };
    for (const laser of sim.room.lasers) if (laser.hits(probe)) return 'HAZARD';
    const boxes = sim.world.query(pos.x, pos.z, 2);
    for (const b of boxes) {
      if (b.max[1] <= pos.y + PLAYER.stepHeight) continue;
      if (capsuleOverlapsBox(pos, PLAYER.radius * 0.7, PLAYER.height, b)) return 'OBSTRUCTED';
    }
    const g = groundProbe(pos, PLAYER.radius, boxes, pos.y + PLAYER.stepHeight);
    if (!g.box || pos.y - g.top > 0.6) return 'NO FLOOR';
    return null;
  }

  trySwap() {
    const sim = this.sim;
    if (!this.allowed('swap')) return false;
    if (sim.tick < this.swapReadyAt) return this.block('swap', 'RECHARGING');
    const echo = this.target(ABILITIES.swapRange);
    if (!echo) return this.block('swap', 'NO ECHO IN SIGHT');
    if (!this.hasSight(echo)) return this.block('swap', 'OBSTRUCTED');
    const to = { x: echo.pos.x, y: echo.pos.y, z: echo.pos.z };
    const problem = this.destinationProblem(to);
    if (problem) return this.block('swap', problem);

    const player = sim.player;
    const from = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
    player.pos.x = to.x;
    player.pos.y = to.y;
    player.pos.z = to.z;
    player.prevPos.x = to.x;
    player.prevPos.y = to.y;
    player.prevPos.z = to.z;
    player.vel.x = player.vel.z = 0;
    player.vel.y = 0;
    player.groundBox = null;
    echo.swapTo(from);
    sim.recorder.markBlink(sim.cycleTick, player);
    this.swapReadyAt = sim.tick + ABILITIES.swapCooldown * TICK_RATE;
    sim.paradox.add(PARADOX_COST.swap, 'swap');
    sim.bus.emit('echo:swap', { echo, from, to });
    return this.succeed('swap', echo);
  }

  tryFreeze() {
    const sim = this.sim;
    if (!this.allowed('freeze')) return false;
    if (sim.tick < this.freezeReadyAt) return this.block('freeze', 'RECHARGING');
    const echo = this.target(ABILITIES.freezeRange);
    if (!echo) return this.block('freeze', 'NO ECHO IN SIGHT');
    if (sim.echoes.echoes.some((e) => e.isFrozen)) return this.block('freeze', 'ONE ECHO AT A TIME');
    if (!this.hasSight(echo)) return this.block('freeze', 'OBSTRUCTED');
    echo.freeze(ABILITIES.freezeDuration * TICK_RATE);
    this.freezeReadyAt = sim.tick + ABILITIES.freezeCooldown * TICK_RATE;
    sim.paradox.add(PARADOX_COST.freeze, 'freeze');
    sim.bus.emit('echo:freeze', { echo, pos: echo.pos });
    return this.succeed('freeze', echo);
  }
}
