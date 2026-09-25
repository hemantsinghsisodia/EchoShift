/**
 * Base class for puzzle objects. Holds simulation state only; a render view may be
 * attached later by the renderer via `obj.view`.
 *
 * Lifecycle per tick (called by Room): sense(ctx) -> [puzzle evaluate] -> actuate(ctx).
 */
export class InteractiveObject {
  constructor(cfg, room) {
    this.cfg = cfg;
    this.room = room;
    this.id = cfg.id;
    this.type = cfg.type;
    const p = cfg.pos || [0, 0, 0];
    this.pos = room.toWorld(p[0], p[1] || 0, p[2]);
    this.interactable = false;
    this.signal = false;
    this.condValue = false;
    this.condRefs = [];
    this.view = null;
  }

  canInteract() {
    return false;
  }

  interact() {}

  sense() {}

  actuate() {}

  reset() {
    this.signal = false;
  }

  /** Static-per-tick colliders contributed by this object. */
  colliders() {
    return EMPTY;
  }
}

const EMPTY = [];
