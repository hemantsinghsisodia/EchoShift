import { PLAYER, KILL_Y } from '../core/config.js';
import { resolveHorizontal, groundProbe, ceilingProbe } from '../physics/Collision.js';
import { v3, copy3 } from '../math/vec.js';

export const FLAG_GROUNDED = 1;
export const FLAG_WALKING = 2;
export const FLAG_SPRINTING = 4;
export const FLAG_JUMPING = 8;

/** First-person character controller. Pure simulation; no rendering. */
export class Player {
  constructor(bus = null) {
    this.bus = bus;
    this.id = 'player';
    this.kind = 'player';
    this.radius = PLAYER.radius;
    this.height = PLAYER.height;
    this.pos = v3();
    this.prevPos = v3();
    this.vel = v3();
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = false;
    this.groundBox = null;
    this.flags = 0;
    this.strideAcc = 0;
    this.landImpact = 0;
    this.dead = false;
  }

  get feet() {
    return this.pos;
  }

  get platform() {
    const owner = this.grounded ? this.groundBox?.owner : null;
    return owner && owner.isPlatform ? owner : null;
  }

  teleport(x, y, z, yaw = 0) {
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = z;
    copy3(this.prevPos, this.pos);
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.grounded = true;
    this.groundBox = null;
    this.flags = FLAG_GROUNDED;
    this.strideAcc = 0;
    this.dead = false;
  }

  update(input, world, dt) {
    copy3(this.prevPos, this.pos);
    this.yaw = input.yaw;
    this.pitch = input.pitch;

    const carrier = this.platform;
    if (carrier) {
      this.pos.x += carrier.delta.x;
      this.pos.y += carrier.delta.y;
      this.pos.z += carrier.delta.z;
    }

    const fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let dx = -sin * fwd + cos * strafe;
    let dz = -cos * fwd - sin * strafe;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
    }
    const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const tvx = dx * speed;
    const tvz = dz * speed;
    const accel = (this.grounded ? PLAYER.groundAccel : PLAYER.airAccel) * dt;
    const ex = tvx - this.vel.x;
    const ez = tvz - this.vel.z;
    const el = Math.hypot(ex, ez);
    if (el <= accel) {
      this.vel.x = tvx;
      this.vel.z = tvz;
    } else {
      this.vel.x += (ex / el) * accel;
      this.vel.z += (ez / el) * accel;
    }

    let jumped = false;
    if (input.jump && this.grounded) {
      this.vel.y = PLAYER.jumpVelocity;
      this.grounded = false;
      this.groundBox = null;
      jumped = true;
      this.bus?.emit('player:jump', { pos: this.pos });
    }

    const boxes = world.query(this.pos.x, this.pos.z);
    const beforeX = this.pos.x;
    const beforeZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    resolveHorizontal(this.pos, this.radius, this.height, boxes, PLAYER.stepHeight);

    const wasGrounded = this.grounded;
    this.vel.y -= PLAYER.gravity * dt;
    let newY = this.pos.y + this.vel.y * dt;
    if (this.vel.y <= 0) {
      const g = groundProbe(this.pos, this.radius, boxes, this.pos.y + PLAYER.stepHeight);
      const snapDown = wasGrounded && g.box && this.pos.y - g.top <= PLAYER.stepHeight;
      if (g.box && (newY <= g.top || snapDown)) {
        if (!wasGrounded) {
          this.landImpact = -this.vel.y;
          this.bus?.emit('player:land', { pos: this.pos, impact: this.landImpact });
        }
        this.pos.y = g.top;
        this.vel.y = 0;
        this.grounded = true;
        this.groundBox = g.box;
      } else {
        this.pos.y = newY;
        this.grounded = false;
        this.groundBox = null;
      }
    } else {
      const limit = ceilingProbe(this.pos, this.radius, this.height, newY, boxes);
      if (newY > limit) {
        newY = limit;
        this.vel.y = 0;
      }
      this.pos.y = newY;
      this.grounded = false;
      this.groundBox = null;
    }

    const moved = Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ);
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const walking = hSpeed > 0.5 && len > 0;
    this.flags =
      (this.grounded ? FLAG_GROUNDED : 0) |
      (walking ? FLAG_WALKING : 0) |
      (walking && input.sprint ? FLAG_SPRINTING : 0) |
      (!this.grounded && this.vel.y > 0 ? FLAG_JUMPING : 0);

    if (this.grounded && walking) {
      this.strideAcc += moved;
      if (this.strideAcc >= PLAYER.strideLength) {
        this.strideAcc -= PLAYER.strideLength;
        this.bus?.emit('player:step', { pos: this.pos, sprint: !!input.sprint });
      }
    }

    return { jumped };
  }

  get fellOut() {
    return this.pos.y < KILL_Y;
  }
}
