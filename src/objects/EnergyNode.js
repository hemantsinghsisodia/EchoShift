import { InteractiveObject } from './InteractiveObject.js';
import { makeBox } from '../physics/Collision.js';

/**
 * Energy node: white when it can be charged, green once charged, blue while disabled.
 * Objective nodes complete the room when charged; relay nodes just latch their signal.
 */
export class EnergyNode extends InteractiveObject {
  constructor(cfg, room) {
    super(cfg, room);
    this.interactable = true;
    this.objective = cfg.objective !== false;
    this.label = cfg.label ?? (this.objective ? 'ENERGY NODE' : 'RELAY');
    this.hasCondition = cfg.enabledWhen !== undefined;
    this.enabled = !this.hasCondition;
    this.activated = false;
    this.activatedTick = -Infinity;
    const s = 0.45;
    this.box = makeBox(this.pos.x - s, this.pos.y, this.pos.z - s, this.pos.x + s, this.pos.y + 0.9, this.pos.z + s, this);
    this.boxes = [this.box];
  }

  canInteract() {
    return this.enabled && !this.activated;
  }

  interact(actor, ctx) {
    if (!this.canInteract()) return;
    this.activated = true;
    this.signal = true;
    this.activatedTick = this.room.clock;
    ctx.bus?.emit('node:activate', { node: this, by: actor.kind, pos: this.pos });
    if (this.objective) ctx.onObjective?.(this);
  }

  actuate() {
    this.enabled = this.hasCondition ? !!this.condValue : true;
  }

  colliders() {
    return this.boxes;
  }

  reset() {
    super.reset();
    this.activated = false;
    this.activatedTick = -Infinity;
    this.enabled = !this.hasCondition;
  }
}
