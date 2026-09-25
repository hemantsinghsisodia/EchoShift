import { describe, it, expect } from 'vitest';
import { Hunter } from '../src/hunter/Hunter.js';
import { Resonance } from '../src/hunter/Resonance.js';
import { HUNTER, DT } from '../src/core/config.js';
import { FLAG_GROUNDED, FLAG_WALKING, FLAG_SPRINTING, FLAG_JUMPING } from '../src/player/Player.js';

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
        lengthTicks: 45,
        sample(tick, cursor, platforms, out) {
          sampledTicks.push(tick);
          out.x = tick / 30;
          out.z = 0;
        },
      },
    };
    const resonance = new Resonance();

    resonance.register(recorded);

    expect(sampledTicks).toEqual([0, 30, 45]);
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

  it('hears jump and resonance noise without walking movement', () => {
    const jumpingHunter = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    const jumping = echo(1, 9, 0, FLAG_GROUNDED | FLAG_JUMPING);
    jumpingHunter.update(ctx({ echoes: [jumping] }));
    expect(jumpingHunter.target).toBe(jumping);

    const resonance = new Resonance();
    resonance.markOlderCell(1, 9, 0);
    const resonant = echo(2, 9, 0, FLAG_GROUNDED);
    const resonantHunter = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    resonantHunter.update(ctx({ echoes: [resonant], resonance }));
    expect(resonantHunter.target).toBe(resonant);
  });

  it('hears a walking player only within 3 m and a sprinting player within 8 m', () => {
    const h1 = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    h1.update(ctx({ player: player(3, 0, false) }));
    expect(h1.target.kind).toBe('player');
    const h2 = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    h2.update(ctx({ player: player(8, 0, true) }));
    expect(h2.target.kind).toBe('player');
    const outside = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    outside.update(ctx({ player: player(4, 0, false) }));
    expect(outside.target).toBeNull();
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

  it('catches at the inclusive 0.8 m post-move boundary', () => {
    let hunted = 0;
    const hunter = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    const boundary = echo(
      1,
      HUNTER.catchDistance + HUNTER.speed * DT,
      0,
      FLAG_GROUNDED | FLAG_WALKING,
    );

    hunter.update(ctx({ echoes: [boundary], huntEcho: () => hunted++ }));

    expect(Math.abs(boundary.pos.x - hunter.pos.x)).toBeCloseTo(HUNTER.catchDistance, 10);
    expect(hunted).toBe(1);
  });

  it('invokes a catch once until the actor becomes valid again', () => {
    let hunted = 0;
    const hunter = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    const caught = echo(1, 0.5, 0, FLAG_GROUNDED | FLAG_WALKING);

    hunter.update(ctx({ echoes: [caught], huntEcho: () => hunted++ }));
    for (let tick = 0; tick <= HUNTER.targetLockTicks; tick++) {
      hunter.update(ctx({ echoes: [caught], huntEcho: () => hunted++ }));
    }
    expect(hunted).toBe(1);

    caught.isActivator = false;
    hunter.update(ctx({ echoes: [caught], huntEcho: () => hunted++ }));
    caught.isActivator = true;
    caught.pos.x = 4;
    hunter.update(ctx({ echoes: [caught], huntEcho: () => hunted++ }));
    expect(hunter.target).toBe(caught);
  });

  it('resets catch state and acquires another valid target on the next tick', () => {
    let hunted = 0;
    const hunter = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    const first = echo(1, 0.5, 0, FLAG_GROUNDED | FLAG_WALKING);
    const second = echo(2, 4, 0, FLAG_GROUNDED | FLAG_WALKING);

    hunter.update(ctx({ echoes: [first, second], huntEcho: () => hunted++ }));

    expect(hunted).toBe(1);
    expect(hunter.target).toBeNull();
    expect(hunter.lockTicks).toBe(0);
    expect(hunter.lostTicks).toBe(0);

    hunter.update(ctx({ echoes: [first, second], huntEcho: () => hunted++ }));
    expect(hunter.target).toBe(second);
    expect(hunted).toBe(1);
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

  it('switches targets when the exact 1-second lock expires', () => {
    const hunter = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    const first = echo(1, 11, 0, FLAG_GROUNDED | FLAG_WALKING);
    const louder = echo(2, 10, 0, FLAG_GROUNDED | FLAG_WALKING | FLAG_SPRINTING);
    hunter.update(ctx({ echoes: [first] }));

    for (let tick = 1; tick < HUNTER.targetLockTicks; tick++) {
      hunter.update(ctx({ echoes: [first, louder] }));
    }
    expect(hunter.target).toBe(first);

    hunter.update(ctx({ echoes: [first, louder] }));
    expect(hunter.target).toBe(louder);
  });

  it('finishes patrol recovery before reacquiring a blocked audible target', () => {
    const wall = { min: [0.1, -1, -1], max: [0.2, 2, 1] };
    const blockedWorld = { query: () => [wall] };
    const hunter = new Hunter({ pos: [0, 0], patrol: [[-2, 0], [8, 0]] }, room);
    hunter.patrolIndex = 1;
    const audible = echo(1, 2, 0, FLAG_GROUNDED | FLAG_WALKING);

    for (let tick = 1; tick < HUNTER.stuckTicks; tick++) {
      hunter.update(ctx({ echoes: [audible], world: blockedWorld }));
    }
    expect(hunter.target).toBe(audible);

    hunter.update(ctx({ echoes: [audible], world: blockedWorld }));
    expect(hunter.target).toBeNull();
    expect(hunter.state).toBe('patrol');
    expect(hunter.patrolIndex).toBe(0);
    expect(hunter.stuckTicks).toBe(0);
    expect(hunter.recovering).toBe(true);

    const recoveryStart = hunter.pos.x;
    for (let tick = 0; tick < 5; tick++) {
      hunter.update(ctx({ echoes: [audible], world: blockedWorld }));
      expect(hunter.target).toBeNull();
      expect(hunter.recovering).toBe(true);
    }
    expect(hunter.pos.x).toBeLessThan(recoveryStart);

    let recoveryTicks = 5;
    while (hunter.recovering && recoveryTicks < 200) {
      hunter.update(ctx({ echoes: [audible], world: blockedWorld }));
      recoveryTicks++;
    }
    expect(recoveryTicks).toBeLessThan(200);
    expect(hunter.recovering).toBe(false);
    expect(hunter.target).toBeNull();

    hunter.update(ctx({ echoes: [audible], world: blockedWorld }));
    expect(hunter.target).toBe(audible);

    hunter.reset();
    expect(hunter.recovering).toBe(false);
  });

  it('resets stuck tracking when forward progress resumes', () => {
    const wall = { min: [0.1, -1, -1], max: [0.2, 2, 1] };
    let blocked = true;
    const variableWorld = { query: () => (blocked ? [wall] : []) };
    const hunter = new Hunter({ pos: [0, 0], patrol: [[-2, 0]] }, room);
    const audible = echo(1, 2, 0, FLAG_GROUNDED | FLAG_WALKING);

    for (let tick = 0; tick < 10; tick++) {
      hunter.update(ctx({ echoes: [audible], world: variableWorld }));
    }
    expect(hunter.stuckTicks).toBe(10);

    blocked = false;
    hunter.update(ctx({ echoes: [audible], world: variableWorld }));
    expect(hunter.stuckTicks).toBe(0);
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
