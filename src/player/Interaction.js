import { INTERACT_RANGE, INTERACT_ANGLE, ECHO_INTERACT_SLACK } from '../core/config.js';
import { wrapAngle, yawTo, dist2D } from '../math/vec.js';

/** Pick the interactable object the actor is looking at (horizontal range + facing cone). */
export function findTarget(actor, objects, range = INTERACT_RANGE) {
  let best = null;
  let bestScore = Infinity;
  for (const obj of objects) {
    if (!obj.interactable || !obj.canInteract()) continue;
    const d = dist2D(actor.pos.x, actor.pos.z, obj.pos.x, obj.pos.z);
    if (d > range) continue;
    const angle = Math.abs(wrapAngle(yawTo(actor.pos.x, actor.pos.z, obj.pos.x, obj.pos.z) - actor.yaw));
    if (angle > INTERACT_ANGLE && d > 0.6) continue;
    const score = angle + d * 0.15;
    if (score < bestScore) {
      bestScore = score;
      best = obj;
    }
  }
  return best;
}

/**
 * Replay a recorded interaction. Uses the recorded target id rather than re-aiming,
 * so tiny interpolation differences never cause a miss; still requires plausible range.
 */
export function tryInteract(actor, obj, ctx, range = INTERACT_RANGE + ECHO_INTERACT_SLACK) {
  if (!obj || !obj.interactable || !obj.canInteract()) return false;
  const d = dist2D(actor.pos.x, actor.pos.z, obj.pos.x, obj.pos.z);
  if (d > range) return false;
  obj.interact(actor, ctx);
  return true;
}
