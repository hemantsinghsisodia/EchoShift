import { describe, it, expect } from 'vitest';
import { Room } from '../src/puzzle/Room.js';
import { not } from '../src/puzzle/Logic.js';
import { TICK_RATE } from '../src/core/config.js';

const cfg = {
  id: 99,
  name: 'TEST',
  w: 20,
  d: 20,
  entranceX: 0,
  exitX: 0,
  objects: [
    { type: 'plate', id: 'p', pos: [0, 0, 0] },
    { type: 'switch', id: 'sw', mode: 'pulse', pos: [5, 0, 5] },
    { type: 'switch', id: 'tg', mode: 'toggle', pos: [-5, 0, 5] },
    { type: 'button', id: 'tb', pos: [5, 0, -5], duration: 2 },
    { type: 'door', id: 'd', pos: [0, 0, -8], opensWhen: 'p', openTime: 0.5, closeTime: 0.25 },
    { type: 'laser', id: 'l', min: [-2, 0, 3], max: [2, 3, 3.1], activeWhen: not('tg') },
    { type: 'platform', id: 'mp', pos: [8, 0, 0], to: [8, 0, -6], period: 7.5, pause: 1 },
    { type: 'node', id: 'n', pos: [-8, 0, -8], enabledWhen: 'tb', objective: false },
  ],
};

function tick(room, activators = []) {
  room.clock++;
  room.updatePlatforms();
  const ctx = { activators, bus: null };
  room.sense(ctx);
  room.evaluate();
  room.actuate(ctx);
}

const actor = (x, z, grounded = true) => ({ kind: 'player', pos: { x, y: 0, z }, feet: { x, y: 0, z }, grounded });

describe('puzzle objects', () => {
  it('door opens while its plate is held and blocks only when mostly closed', () => {
    const room = new Room(cfg, 1, { x: 0, z: 0 });
    const d = room.byId.d;
    const on = [actor(0, 0)];
    let ticks = 0;
    while (d.blocking) {
      tick(room, on);
      ticks++;
    }
    expect(ticks).toBeCloseTo(0.85 * 0.5 * TICK_RATE, -1);
    expect(d.colliders().length).toBe(0);
    for (let i = 0; i < 60; i++) tick(room, on);
    expect(d.openAmount).toBe(1);
    tick(room, []);
    tick(room, []);
    tick(room, [], 0);
    for (let i = 0; i < 2; i++) tick(room, []);
    expect(d.blocking).toBe(true);
  });

  it('plates require a grounded activator', () => {
    const room = new Room(cfg, 1, { x: 0, z: 0 });
    tick(room, [actor(0, 0, false)]);
    expect(room.byId.p.signal).toBe(false);
    tick(room, [actor(0.8, -0.8)]);
    expect(room.byId.p.signal).toBe(true);
  });

  it('pulse switch pulses, toggle switch toggles, timed button expires', () => {
    const room = new Room(cfg, 1, { x: 0, z: 0 });
    const ctx = { bus: null };
    room.byId.sw.interact(actor(0, 0), ctx);
    tick(room);
    expect(room.byId.sw.signal).toBe(true);
    for (let i = 0; i < 40; i++) tick(room);
    expect(room.byId.sw.signal).toBe(false);

    room.byId.tg.interact(actor(0, 0), ctx);
    tick(room);
    expect(room.byId.tg.signal).toBe(true);
    expect(room.byId.l.active).toBe(false);
    room.byId.tg.interact(actor(0, 0), ctx);
    tick(room);
    expect(room.byId.l.active).toBe(true);

    room.byId.tb.interact(actor(0, 0), ctx);
    for (let i = 0; i < 2 * TICK_RATE - 2; i++) tick(room);
    expect(room.byId.tb.signal).toBe(true);
    for (let i = 0; i < 3; i++) tick(room);
    expect(room.byId.tb.signal).toBe(false);
  });

  it('laser kills only when active and overlapping', () => {
    const room = new Room(cfg, 1, { x: 0, z: 0 });
    tick(room);
    const l = room.byId.l;
    const inBeam = { pos: { x: 0, y: 0, z: 3.05 }, radius: 0.35, height: 1.8 };
    expect(l.hits(inBeam)).toBe(true);
    expect(l.hits({ ...inBeam, pos: { x: 0, y: 0, z: 5 } })).toBe(false);
  });

  it('platform phase repeats exactly every 15 s', () => {
    const room = new Room(cfg, 1, { x: 0, z: 0 });
    const mp = room.byId.mp;
    const a = mp.positionAt(123, {});
    const b = mp.positionAt(123 + 15 * TICK_RATE, {});
    expect(b).toEqual(a);
    expect(mp.positionAt(0, {}).z).toBe(0);
    expect(mp.positionAt(4 * TICK_RATE, {}).z).toBeCloseTo(-6);
  });

  it('energy node enables by condition and latches when charged', () => {
    const room = new Room(cfg, 1, { x: 0, z: 0 });
    const n = room.byId.n;
    tick(room);
    expect(n.canInteract()).toBe(false);
    room.byId.tb.interact(actor(0, 0), { bus: null });
    tick(room);
    tick(room);
    expect(n.canInteract()).toBe(true);
    n.interact(actor(0, 0), { bus: null });
    expect(n.signal).toBe(true);
    expect(n.canInteract()).toBe(false);
  });
});
