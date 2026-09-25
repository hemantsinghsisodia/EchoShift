import { HUNTER, DT } from '../core/config.js';
import { FLAG_WALKING, FLAG_SPRINTING, FLAG_JUMPING } from '../player/Player.js';
import { dist2D, v3, copy3 } from '../math/vec.js';
import { resolveHorizontal } from '../physics/Collision.js';

const MEANINGFUL_PROGRESS = 1e-4;

export class Hunter {
  constructor(cfg, room) {
    this.cfg = cfg;
    this.room = room;
    this.patrol = cfg.patrol.map(([x, z]) => room.toWorld(x, 0, z));
    const start = cfg.pos ? room.toWorld(cfg.pos[0], 0, cfg.pos[1]) : this.patrol[0];
    this.spawn = { ...start };
    this.pos = v3(start.x, 0, start.z);
    this.prevPos = v3(start.x, 0, start.z);
    this.radius = HUNTER.radius;
    this.height = HUNTER.height;
    this.kind = 'hunter';
    this.consumedTargets = new Set();
    this.reset();
  }

  reset() {
    this.pos.x = this.spawn.x;
    this.pos.y = 0;
    this.pos.z = this.spawn.z;
    copy3(this.prevPos, this.pos);
    this.target = null;
    this.state = 'patrol';
    this.patrolIndex = 0;
    this.lockTicks = 0;
    this.lostTicks = 0;
    this.stuckTicks = 0;
    this.alert = 0;
    this.consumedTargets.clear();
  }

  echoNoise(echo, resonance) {
    if (!echo.isActivator || echo.isFrozen || echo.state === 'holding') return 0;
    let noise = 0;
    if (echo.flags & FLAG_SPRINTING) noise = 1.6;
    else if (echo.flags & FLAG_WALKING) noise = 1;
    if (echo.flags & FLAG_JUMPING) noise += 0.8;
    if (resonance.at(echo, echo.pos.x, echo.pos.z)) noise += 0.8;
    return noise;
  }

  candidateFor(actor, ctx) {
    if (actor.kind === 'echo') {
      if (!ctx.echoes.includes(actor)) return null;
      const echo = actor;
      const noise = this.echoNoise(echo, ctx.resonance);
      const distance = dist2D(this.pos.x, this.pos.z, echo.pos.x, echo.pos.z);
      if (noise > 0 && distance <= HUNTER.echoHearingScale * noise) {
        return { actor: echo, noise, distance };
      }
      return null;
    }

    if (actor !== ctx.player) return null;
    const sprint = ctx.player.flags & FLAG_SPRINTING;
    const playerRange = sprint ? HUNTER.playerSprintRange : HUNTER.playerWalkRange;
    const playerDistance = dist2D(this.pos.x, this.pos.z, ctx.player.pos.x, ctx.player.pos.z);
    if (playerDistance <= playerRange) {
      return {
        actor: ctx.player,
        noise: sprint ? 0.9 : 0.35,
        distance: playerDistance,
      };
    }
    return null;
  }

  chooseTarget(ctx) {
    for (const actor of this.consumedTargets) {
      if (!this.candidateFor(actor, ctx)) this.consumedTargets.delete(actor);
    }

    const candidates = [];
    for (const echo of ctx.echoes) {
      const candidate = this.candidateFor(echo, ctx);
      if (candidate && !this.consumedTargets.has(echo)) candidates.push(candidate);
    }
    const playerCandidate = this.candidateFor(ctx.player, ctx);
    if (playerCandidate && !this.consumedTargets.has(ctx.player)) candidates.push(playerCandidate);
    candidates.sort((a, b) => b.noise - a.noise || a.distance - b.distance);
    return candidates[0]?.actor ?? null;
  }

  clearTarget() {
    this.target = null;
    this.lockTicks = 0;
    this.lostTicks = 0;
    this.stuckTicks = 0;
  }

  nearestPatrolIndex() {
    let nearest = 0;
    let nearestDistance = Infinity;
    for (let index = 0; index < this.patrol.length; index++) {
      const waypoint = this.patrol[index];
      const dx = waypoint.x - this.pos.x;
      const dz = waypoint.z - this.pos.z;
      const distance = dx * dx + dz * dz;
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  update(ctx) {
    copy3(this.prevPos, this.pos);
    const candidate = this.chooseTarget(ctx);
    if (candidate && this.lockTicks <= 0) {
      if (candidate !== this.target) {
        this.target = candidate;
        this.lockTicks = HUNTER.targetLockTicks;
        this.lostTicks = 0;
        this.stuckTicks = 0;
        ctx.bus?.emit('hunter:alert', { hunter: this, target: candidate });
      }
    } else if (this.lockTicks > 0) {
      this.lockTicks--;
    }

    if (this.target && !candidate) {
      if (++this.lostTicks >= HUNTER.lostTargetTicks) this.clearTarget();
    } else {
      this.lostTicks = 0;
    }

    this.state = this.target ? 'hunt' : 'patrol';
    const goal = this.target?.pos ?? this.patrol[this.patrolIndex];
    const distance = dist2D(this.pos.x, this.pos.z, goal.x, goal.z);
    if (!this.target && distance < 0.35) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
      return;
    }
    if (distance > 0.001) {
      this.pos.x += ((goal.x - this.pos.x) / distance) * HUNTER.speed * DT;
      this.pos.z += ((goal.z - this.pos.z) / distance) * HUNTER.speed * DT;
      const boxes = ctx.world.query(this.pos.x, this.pos.z, 2);
      resolveHorizontal(this.pos, this.radius, this.height, boxes, 0);
    }

    if (!this.target) {
      this.stuckTicks = 0;
      return;
    }

    const remaining = dist2D(this.pos.x, this.pos.z, this.target.pos.x, this.target.pos.z);
    if (remaining <= HUNTER.catchDistance) {
      const caught = this.target;
      this.consumedTargets.add(caught);
      this.clearTarget();
      this.state = 'patrol';
      if (caught.kind === 'echo') ctx.huntEcho(caught, this);
      else ctx.killPlayer('hunter');
      return;
    }

    if (distance - remaining > MEANINGFUL_PROGRESS) {
      this.stuckTicks = 0;
    } else if (++this.stuckTicks >= HUNTER.stuckTicks) {
      this.clearTarget();
      this.patrolIndex = this.nearestPatrolIndex();
      this.state = 'patrol';
    }
  }
}
