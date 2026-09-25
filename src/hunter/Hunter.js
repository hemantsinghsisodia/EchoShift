import { HUNTER, DT } from '../core/config.js';
import { FLAG_WALKING, FLAG_SPRINTING, FLAG_JUMPING } from '../player/Player.js';
import { dist2D, v3, copy3 } from '../math/vec.js';
import { resolveHorizontal } from '../physics/Collision.js';

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
  }

  echoNoise(echo, resonance) {
    if (!echo.isActivator || echo.isFrozen || echo.state === 'holding') return 0;
    if (!(echo.flags & FLAG_WALKING)) return 0;
    let noise = echo.flags & FLAG_SPRINTING ? 1.6 : 1;
    if (echo.flags & FLAG_JUMPING) noise += 0.8;
    if (resonance.at(echo, echo.pos.x, echo.pos.z)) noise += 0.8;
    return noise;
  }

  chooseTarget(ctx) {
    const candidates = [];
    for (const echo of ctx.echoes) {
      const noise = this.echoNoise(echo, ctx.resonance);
      const distance = dist2D(this.pos.x, this.pos.z, echo.pos.x, echo.pos.z);
      if (noise > 0 && distance <= HUNTER.echoHearingScale * noise) {
        candidates.push({ actor: echo, noise, distance });
      }
    }
    const sprint = ctx.player.flags & FLAG_SPRINTING;
    const playerRange = sprint ? HUNTER.playerSprintRange : HUNTER.playerWalkRange;
    const playerDistance = dist2D(this.pos.x, this.pos.z, ctx.player.pos.x, ctx.player.pos.z);
    if (playerDistance <= playerRange) {
      candidates.push({
        actor: ctx.player,
        noise: sprint ? 0.9 : 0.35,
        distance: playerDistance,
      });
    }
    candidates.sort((a, b) => b.noise - a.noise || a.distance - b.distance);
    return candidates[0]?.actor ?? null;
  }

  update(ctx) {
    copy3(this.prevPos, this.pos);
    const candidate = this.chooseTarget(ctx);
    if (candidate && this.lockTicks <= 0) {
      if (candidate !== this.target) {
        this.target = candidate;
        this.lockTicks = HUNTER.targetLockTicks;
        ctx.bus?.emit('hunter:alert', { hunter: this, target: candidate });
      }
    } else if (this.lockTicks > 0) {
      this.lockTicks--;
    }

    if (this.target && !candidate) {
      if (++this.lostTicks >= HUNTER.lostTargetTicks) this.target = null;
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

    if (
      this.target &&
      dist2D(this.pos.x, this.pos.z, this.target.pos.x, this.target.pos.z) <= HUNTER.catchDistance
    ) {
      if (this.target.kind === 'echo') ctx.huntEcho(this.target, this);
      else ctx.killPlayer('hunter');
      this.target = null;
    }
  }
}
