import { describe, it, expect } from 'vitest';
import { makeBox, resolveHorizontal, groundProbe, capsuleOverlapsBox, circleOverlapsRect } from '../src/physics/Collision.js';

describe('collision primitives', () => {
  const wall = makeBox(1, 0, -5, 2, 3, 5);

  it('pushes a circle out of a wall along the shortest axis', () => {
    const p = { x: 0.9, y: 0, z: 0 };
    resolveHorizontal(p, 0.35, 1.8, [wall], 0.35);
    expect(p.x).toBeCloseTo(1 - 0.35, 3);
    expect(p.z).toBe(0);
  });

  it('slides along a wall: tangential motion is preserved', () => {
    const p = { x: 0.8, y: 0, z: 2 };
    resolveHorizontal(p, 0.35, 1.8, [wall], 0.35);
    expect(p.z).toBe(2);
    expect(p.x).toBeLessThanOrEqual(0.65 + 1e-4);
  });

  it('pushes diagonally out of a corner', () => {
    const p = { x: 0.8, y: 0, z: 5.2 };
    resolveHorizontal(p, 0.35, 1.8, [wall], 0.35);
    const dx = p.x - 1;
    const dz = p.z - 5;
    expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(0.35 - 1e-4);
  });

  it('ignores boxes low enough to step onto', () => {
    const step = makeBox(0, 0, -1, 1, 0.3, 1);
    const p = { x: 0.1, y: 0, z: 0 };
    resolveHorizontal(p, 0.35, 1.8, [step], 0.35);
    expect(p.x).toBe(0.1);
    expect(groundProbe(p, 0.35, [step], 0.35).top).toBeCloseTo(0.3);
  });

  it('ignores boxes above the head', () => {
    const beam = makeBox(-1, 2.5, -1, 1, 3, 1);
    const p = { x: 0, y: 0, z: 0 };
    expect(resolveHorizontal(p, 0.35, 1.8, [beam], 0.35)).toBe(false);
  });

  it('ground probe returns the highest top not above the limit', () => {
    const floor = makeBox(-5, -0.5, -5, 5, 0, 5);
    const crate = makeBox(-0.5, 0, -0.5, 0.5, 0.9, 0.5);
    const p = { x: 0, y: 0.9, z: 0 };
    expect(groundProbe(p, 0.35, [floor, crate], 1.2).top).toBeCloseTo(0.9);
    expect(groundProbe(p, 0.35, [floor, crate], 0.5).top).toBeCloseTo(0);
  });

  it('capsule overlap respects height ranges', () => {
    const beam = makeBox(-1, 0.22, -0.05, 1, 0.38, 0.05);
    expect(capsuleOverlapsBox({ x: 0, y: 0, z: 0 }, 0.35, 1.8, beam)).toBe(true);
    expect(capsuleOverlapsBox({ x: 0, y: 0.5, z: 0 }, 0.35, 1.8, beam)).toBe(false);
    expect(circleOverlapsRect(0, 0.5, 0.35, beam)).toBe(false);
  });
});
