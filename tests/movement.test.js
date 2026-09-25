import { describe, it, expect } from 'vitest';
import { Player } from '../src/player/Player.js';
import { PLAYER, DT } from '../src/core/config.js';
import { makeBox } from '../src/physics/Collision.js';
import { MovingPlatform } from '../src/objects/MovingPlatform.js';
import { flatWorld, input } from './helpers.js';

describe('player movement', () => {
  it('walks at walk speed and sprints at sprint speed (within 2%)', () => {
    for (const [sprint, speed] of [
      [false, PLAYER.walkSpeed],
      [true, PLAYER.sprintSpeed],
    ]) {
      const p = new Player();
      p.teleport(0, 0, 0);
      const world = flatWorld();
      for (let i = 0; i < 60; i++) p.update(input({ forward: true, sprint }), world, DT);
      const z0 = p.pos.z;
      for (let i = 0; i < 60; i++) p.update(input({ forward: true, sprint }), world, DT);
      expect(Math.abs(p.pos.z - z0)).toBeGreaterThan(speed * 0.98);
      expect(Math.abs(p.pos.z - z0)).toBeLessThan(speed * 1.02);
    }
  });

  it('moves relative to yaw (-Z forward at yaw 0, -X at yaw +90deg)', () => {
    const world = flatWorld();
    const a = new Player();
    a.teleport(0, 0, 0);
    for (let i = 0; i < 30; i++) a.update(input({ forward: true }), world, DT);
    expect(a.pos.z).toBeLessThan(-1);
    const b = new Player();
    b.teleport(0, 0, 0);
    for (let i = 0; i < 30; i++) b.update(input({ forward: true, yaw: Math.PI / 2 }), world, DT);
    expect(b.pos.x).toBeLessThan(-1);
    expect(Math.abs(b.pos.z)).toBeLessThan(0.01);
  });

  it('jumps to about 1.14 m and lands', () => {
    const p = new Player();
    p.teleport(0, 0, 0);
    const world = flatWorld();
    p.update(input(), world, DT);
    let apex = 0;
    p.update(input({ jump: true }), world, DT);
    for (let i = 0; i < 90; i++) {
      p.update(input(), world, DT);
      apex = Math.max(apex, p.pos.y);
    }
    expect(apex).toBeGreaterThan(1.05);
    expect(apex).toBeLessThan(1.2);
    expect(p.grounded).toBe(true);
    expect(p.pos.y).toBe(0);
  });

  it('is stopped by walls and can jump onto a 0.9 m crate', () => {
    const wall = makeBox(-5, 0, -3, 5, 3, -2.6);
    const world = flatWorld([wall]);
    const p = new Player();
    p.teleport(0, 0, 0);
    for (let i = 0; i < 120; i++) p.update(input({ forward: true }), world, DT);
    expect(p.pos.z).toBeCloseTo(-2.25, 1);

    const crate = makeBox(-0.5, 0, -2.5, 0.5, 0.9, -1.5);
    const w2 = flatWorld([crate]);
    const q = new Player();
    q.teleport(0, 0, 0);
    for (let i = 0; i < 90; i++) q.update(input({ forward: q.pos.z > -2, jump: q.pos.y < 0.5 }), w2, DT);
    for (let i = 0; i < 60; i++) q.update(input(), w2, DT);
    expect(q.pos.y).toBeCloseTo(0.9, 2);
  });

  it('is carried by a moving platform', () => {
    const room = { toWorld: (x, y, z) => ({ x, y, z }), center: { x: 0, z: 0 } };
    const plat = new MovingPlatform({ id: 'mp', type: 'platform', pos: [0, 0, 0], to: [0, 0, -6], size: [3, 3], period: 7.5, pause: 1 }, room);
    const world = flatWorld();
    world.staticBoxes = world.staticBoxes.filter(() => false);
    world.staticBoxes.push(plat.box);
    const p = new Player();
    p.teleport(0, 0, 0);
    for (let t = 1; t <= 60 * 4; t++) {
      plat.setTick(t);
      p.update(input(), world, DT);
    }
    expect(p.pos.z).toBeCloseTo(plat.pos.z, 2);
    expect(p.pos.z).toBeCloseTo(-6, 2);
    expect(p.grounded).toBe(true);
  });
});
