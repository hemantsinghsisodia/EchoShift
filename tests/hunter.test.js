import { describe, it, expect } from 'vitest';
import { Hunter } from '../src/hunter/Hunter.js';
import { Resonance } from '../src/hunter/Resonance.js';
import { HUNTER, DT } from '../src/core/config.js';
import { FLAG_GROUNDED, FLAG_WALKING, FLAG_SPRINTING } from '../src/player/Player.js';

const room = {
  origin: { x: 0, z: 0 },
  toWorld: (x, y, z) => ({ x, y, z }),
  doors: [],
  lasers: [],
  staticBoxes: [],
};
const world = { query: () => [] };
const echo = (serial, x, z, flags) => ({
  id: `echo${serial}`,
  serial,
  kind: 'echo',
  pos: { x, y: 0, z },
  feet: { x, y: 0, z },
  flags,
  isActivator: true,
  isFrozen: false,
  state: 'replaying',
});
const player = (x, z, sprint = false) => ({
  id: 'player',
  kind: 'player',
  pos: { x, y: 0, z },
  flags: sprint ? FLAG_WALKING | FLAG_SPRINTING | FLAG_GROUNDED : FLAG_GROUNDED,
});
const ctx = (overrides = {}) => ({
  player: player(50, 50),
  echoes: [],
  room,
  world,
  resonance: new Resonance(),
  bus: null,
  killPlayer: () => {},
  huntEcho: () => {},
  ...overrides,
});

describe('Resonance', () => {
  it('registers 1 m cells sampled every 30 ticks, including the track end', () => {
    const sampledTicks = [];
    const recorded = {
      serial: 1,
      track: {
        lengthTicks: 60,
        sample(tick, cursor, platforms, out) {
          sampledTicks.push(tick);
          out.x = tick / 30;
          out.z = 0;
        },
      },
    };
    const resonance = new Resonance();

    resonance.register(recorded);

    expect(sampledTicks).toEqual([0, 30, 60]);
    expect(resonance.at({ serial: 2 }, 0.49, 0)).toBe(true);
    expect(resonance.at({ serial: 2 }, 1.49, 0)).toBe(true);
    expect(resonance.at({ serial: 2 }, 2.49, 0)).toBe(true);
  });

  it('only counts cells left by an older Echo', () => {
    const resonance = new Resonance();
    resonance.markOlderCell(2, 4, 5);

    expect(resonance.at({ serial: 2 }, 4, 5)).toBe(false);
    expect(resonance.at({ serial: 1 }, 4, 5)).toBe(false);
    expect(resonance.at({ serial: 3 }, 4, 5)).toBe(true);
  });

  it('clears registered cells on reset', () => {
    const resonance = new Resonance();
    resonance.markOlderCell(1, 4, 5);

    resonance.reset();

    expect(resonance.at({ serial: 2 }, 4, 5)).toBe(false);
  });
});

describe('Echo Hunter', () => {
  it('ignores holding and frozen echoes', () => {
    const hunter = new Hunter({ pos: [0, 0], patrol: [[0, 0], [4, 0]] }, room);
    const holding = echo(1, 3, 0, FLAG_GROUNDED);
    holding.state = 'holding';
    const frozen = echo(2, 2, 0, FLAG_GROUNDED | FLAG_WALKING);
    frozen.isFrozen = true;
    hunter.update(ctx({ echoes: [holding, frozen] }));
    expect(hunter.target).toBeNull();
  });

  it('chooses the loudest audible Echo; resonance adds 0.8', () => {
    const hunter = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    const walk = echo(1, 7, 0, FLAG_GROUNDED | FLAG_WALKING);
    const sprint = echo(2, 10, 0, FLAG_GROUNDED | FLAG_WALKING | FLAG_SPRINTING);
    const resonance = new Resonance();
    resonance.markOlderCell(1, 7, 0);
    const resonant = echo(3, 7, 0, FLAG_GROUNDED | FLAG_WALKING);
    hunter.update(ctx({ echoes: [walk, sprint, resonant], resonance }));
    expect(hunter.target).toBe(resonant);
  });

  it('hears a walking player only within 3 m and a sprinting player within 8 m', () => {
    const h1 = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    h1.update(ctx({ player: player(4, 0, false) }));
    expect(h1.target).toBeNull();
    const h2 = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    h2.update(ctx({ player: player(7.5, 0, true) }));
    expect(h2.target.kind).toBe('player');
  });

  it('catches an Echo and the player', () => {
    let hunted = 0;
    let killed = 0;
    const hunter = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    hunter.update(
      ctx({
        player: player(20, 0),
        echoes: [echo(1, 0.5, 0, FLAG_GROUNDED | FLAG_WALKING)],
        huntEcho: () => hunted++,
        killPlayer: () => killed++,
      }),
    );
    expect(hunted).toBe(1);
    hunter.reset();
    hunter.update(ctx({ player: player(0.5, 0), killPlayer: () => killed++ }));
    expect(killed).toBe(1);
  });

  it('keeps a target through the loss grace period, then releases it', () => {
    const hunter = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    const audible = echo(1, 11, 0, FLAG_GROUNDED | FLAG_WALKING);
    hunter.update(ctx({ echoes: [audible] }));

    for (let tick = 1; tick < HUNTER.lostTargetTicks; tick++) hunter.update(ctx());

    expect(hunter.target).toBe(audible);
    hunter.update(ctx());
    expect(hunter.target).toBeNull();
    expect(hunter.state).toBe('patrol');
  });

  it('moves deterministically at the configured speed and preserves prevPos', () => {
    const config = { pos: [0, 0], patrol: [[4, 0]] };
    const first = new Hunter(config, room);
    const second = new Hunter(config, room);

    first.update(ctx());
    second.update(ctx());

    expect(first.pos).toEqual(second.pos);
    expect(first.prevPos).toEqual({ x: 0, y: 0, z: 0 });
    expect(first.pos.x).toBeCloseTo(HUNTER.speed * DT);
    expect(first.pos.z).toBe(0);
  });
});
