import { describe, it, expect } from 'vitest';
import { ROOM_CONFIGS } from '../src/rooms/index.js';
import { DOOR_WIDTH } from '../src/core/config.js';
import { planDecor, KIT_CATALOG, mulberry32, decorFootprint, puzzleAabbs } from '../src/render/LabDecor.js';

function aabb(x0, z0, x1, z1) {
  return {
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minZ: Math.min(z0, z1),
    maxZ: Math.max(z0, z1),
  };
}

function overlaps(a, b, pad) {
  return a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
}

function doorGaps(cfg) {
  const hd = cfg.d / 2;
  const half = DOOR_WIDTH / 2;
  const doors = [aabb((cfg.entranceX ?? 0) - half, hd - 0.4, (cfg.entranceX ?? 0) + half, hd + 0.4)];
  if ((cfg.kind ?? 'puzzle') !== 'escape') {
    doors.push(aabb((cfg.exitX ?? 0) - half, -hd - 0.4, (cfg.exitX ?? 0) + half, -hd + 0.4));
  }
  return doors;
}

describe('lab decoration placement', () => {
  it('keeps every room dressing inside the room, clear of puzzles, doors and pits', () => {
    expect(ROOM_CONFIGS).toHaveLength(9);
    let total = 0;
    for (const cfg of ROOM_CONFIGS) {
      const placed = planDecor(cfg, KIT_CATALOG, mulberry32(cfg.id));
      expect(placed.length, cfg.name).toBeGreaterThan(0);
      total += placed.length;
      const hw = cfg.w / 2;
      const hd = cfg.d / 2;
      const h = cfg.h ?? 5;
      const pits = (cfg.pits ?? []).map((p) => aabb(p[0], p[1], p[2], p[3]));
      const objects = puzzleAabbs(cfg);
      const lasers = (cfg.objects ?? []).filter((o) => o.min && o.max).map((o) => aabb(o.min[0], o.min[2], o.max[0], o.max[2]));
      for (const p of placed) {
        const spec = KIT_CATALOG[p.name];
        const box = decorFootprint(p, spec);
        expect(box.minX, cfg.name).toBeGreaterThanOrEqual(-hw - 0.05);
        expect(box.maxX, cfg.name).toBeLessThanOrEqual(hw + 0.05);
        expect(box.minZ, cfg.name).toBeGreaterThanOrEqual(-hd - 0.05);
        expect(box.maxZ, cfg.name).toBeLessThanOrEqual(hd + 0.05);
        if (spec.slot === 'ceiling') {
          expect(p.y, cfg.name).toBe(h);
        } else {
          expect(p.y, cfg.name).toBeGreaterThanOrEqual(0);
          expect(p.y + spec.top, cfg.name).toBeLessThanOrEqual(h + 0.05);
        }
        for (const pit of pits) expect(overlaps(box, pit, 0), `${cfg.name} pit`).toBe(false);
        for (const door of doorGaps(cfg)) expect(overlaps(box, door, 1.2), `${cfg.name} door`).toBe(false);
        for (const o of objects) expect(overlaps(box, o, 1.8), `${cfg.name} object`).toBe(false);
        for (const laser of lasers) expect(overlaps(box, laser, 1.8), `${cfg.name} laser`).toBe(false);
      }
    }
    expect(total).toBeGreaterThan(20);
  });

  it('repeats the same layout for the same seed and thins it at touch density', () => {
    let full = 0;
    let thin = 0;
    for (const cfg of ROOM_CONFIGS) {
      const a = planDecor(cfg, KIT_CATALOG, mulberry32(cfg.id));
      const b = planDecor(cfg, KIT_CATALOG, mulberry32(cfg.id));
      expect(b).toEqual(a);
      const low = planDecor(cfg, KIT_CATALOG, mulberry32(cfg.id), { density: 0.6 });
      const lowAgain = planDecor(cfg, KIT_CATALOG, mulberry32(cfg.id), { density: 0.6 });
      expect(lowAgain).toEqual(low);
      expect(low.length).toBeLessThanOrEqual(a.length);
      full += a.length;
      thin += low.length;
    }
    expect(thin).toBeLessThan(full);
  });
});
