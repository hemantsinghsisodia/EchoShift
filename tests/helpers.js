import { idleInput } from '../src/core/Input.js';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { makeBox } from '../src/physics/Collision.js';

/** Minimal world: a big floor plus optional extra boxes. */
export function flatWorld(extra = []) {
  const floor = makeBox(-50, -0.5, -50, 50, 0, 50);
  const world = new PhysicsWorld([], [floor, ...extra]);
  return world;
}

export function input(overrides = {}) {
  return { ...idleInput(0, 0), ...overrides };
}

export function stepN(n, fn) {
  for (let i = 0; i < n; i++) fn(i);
}
