# Phase 2: Echo Hunter, Timeline Editing, Corruption - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Echo Hunter enemy, on-demand timeline editing of the newest Echo, and deterministic Echo corruption to ECHO SHIFT. Retrofit rooms 6, 7 and 8 to use them.

**Architecture:** Everything that affects gameplay lives in the headless 60 Hz simulation (no Three.js imports):

- Timeline edits extend the phase 1 Echo modifier layer with pending time operations.
- The Hunter is a per-room simulation entity with noise-based targeting.
- Corruption is a seeded scheduler.

Views, audio and UI only subscribe to bus events.

**Tech Stack:** JavaScript ES modules, Three.js, Vite, Vitest (node environment).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-25-echo-hunter-timeline-corruption-phase2-design.md`.
- **Hunter:**
  - Speed 2.2 m/s, radius 0.45.
  - Noise: walking 1.0, sprinting 1.6, jumping +0.8, resonance +0.8; holding or frozen Echoes 0.
  - Hears an Echo within `12 m × noise`. Hears the player within 3 m, or 8 m while sprinting.
  - Keeps a target for at least 1 s. Gives up after 3 s of losing it, or after 1.5 s without progress.
  - Catching an Echo gives reason `hunted` and +5 Paradox. Catching the player gives death reason `hunter`.
- **Timeline:**
  - Key T. Section length 2 s (120 ticks). Cursor step 0.5 s.
  - Paradox per edit: delete +5, freeze +3, reverse +6, restart +6.
  - Uses come from the room config `edits`.
- **Corruption:**
  - Random chance per cycle, per Echo: `0.02 + paradox × 0.003`.
  - Random types (`jitter`, `flicker`, `stare`, `ghostPause`) never change puzzle signals.
  - Authored types: `stare`, `pause`, `repeat`, `early`.
  - Authored `at` values are absolute room-clock seconds; `cycle` guards the intended generation.
- Must stay deterministic: no `Math.random()` in simulation code.
- Run tests with `npx vitest run`. Build with `npx vite build`. The shell is PowerShell, so chain commands with `;`.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/core/config.js` | Modify | `TIMELINE`, `HUNTER` and `CORRUPTION` constants. |
| `src/echo/Echo.js` | Modify | Pending time operations (`delete`, `freeze`, `reverse`), `restartFrom`, `stareTicks`, `visualGlitch`, `startAt`. |
| `src/echo/TimelineEdits.js` | Create | `applyEdit()` validation, plus the per-room `TimelineEdits` use counter. |
| `src/hunter/Hunter.js` | Create | Hunter entity: patrol, noise targeting, steering, catching. |
| `src/hunter/Resonance.js` | Create | 1 m grid of visited cells per Echo. |
| `src/echo/Corruption.js` | Create | Seeded PRNG, authored and random glitch scheduling and application. |
| `src/objects/Switch.js` | Modify | `mode: 'breaker'` (first press turns it on, second trips it for good). |
| `src/puzzle/Room.js` | Modify | Build `room.hunter` from `cfg.hunter`; reset it. |
| `src/core/Simulation.js` | Modify | Wire edits, the Hunter, corruption, `cycleIndex`, blink events. |
| `src/puzzle/RoomManager.js` | Modify | Reset edits, corruption and the Hunter on room start. |
| `src/core/Input.js` | Modify | `KeyT` handler hook. |
| `src/ui/TimelineEditor.js` | Create | Pause-time DOM timeline editor. |
| `src/render/HunterView.js` | Create | Hunter mesh, scan cone, lock-on eye. |
| `src/render/SceneView.js` | Modify | Hunter views, the editor's ghost preview, corruption effects. |
| `src/echo/EchoMaterial.js`, `src/echo/EchoView.js` | Modify | `uCorrupt` uniform; visual glitches. |
| `src/render/LightRig.js` | Modify | `flicker(seconds)`. |
| `src/audio/AudioManager.js` | Modify | `hunterPing`, `hunterAlert`, `hunterStrike`, `edit`, `crackle`, `editorOpen`. |
| `index.html`, `src/styles/main.css`, `src/ui/UI.js` | Modify | Timeline editor markup, the T ability chip, the glitch class. |
| `src/core/Game.js` | Modify | `editing` state, event-to-audio/UI mapping. |
| `src/debug/Autopilot.js` | Modify | `{ edit: op, at }` step. |
| `src/rooms/room06.js`, `room07.js`, `room08.js` | Modify | Retrofits. |
| `src/debug/solutions.js` | Modify | New solutions for rooms 6 and 7. |
| `tests/timeline.test.js`, `tests/hunter.test.js`, `tests/corruption.test.js` | Create | Unit tests. |
| `tests/solutions.test.js` | Modify | Checks that each new mechanic is required. |
| `README.md` | Modify | Document the features. |

### Task 1: Pure Timeline Time Map

**Files:**
- Create: `src/echo/TimelineEdits.js`
- Modify: `src/core/config.js`
- Create: `tests/timeline.test.js`

**Interfaces:**
- Produces: `TimelineMap`, `TimelineEdits`, `EDIT_TYPES`, `editCost(type)`.
- `TimelineMap.advance()` returns `{ previousTick, trackTick, direction, discontinuity }`.
- `TimelineEdits.apply(echo, type, cursorTick)` validates room uses and delegates to `echo.timeline.add(...)`.

- [ ] **Step 1: Write failing pure time-map tests**

```js
// tests/timeline.test.js
import { describe, it, expect } from 'vitest';
import { TimelineMap, TimelineEdits } from '../src/echo/TimelineEdits.js';

const advance = (map, ticks) => Array.from({ length: ticks }, () => map.advance());

describe('TimelineMap', () => {
  it('delete skips 120 track ticks and marks a discontinuity', () => {
    const map = new TimelineMap(900);
    map.add('delete', 120, 0);
    const states = advance(map, 121);
    expect(states[119].trackTick).toBe(120);
    expect(states[120]).toMatchObject({ previousTick: 120, trackTick: 241, direction: 1, discontinuity: true });
  });

  it('freeze holds for 120 ticks and delays the rest', () => {
    const map = new TimelineMap(900);
    map.add('freeze', 120, 0);
    const states = advance(map, 240);
    expect(states[119].trackTick).toBe(120);
    expect(states[120].trackTick).toBe(120);
    expect(states[238].trackTick).toBe(120);
    expect(states[239].trackTick).toBe(121);
  });

  it('reverse walks the selected 120 ticks backward and suppresses events', () => {
    const map = new TimelineMap(900);
    map.add('reverse', 120, 0);
    const states = advance(map, 360);
    expect(states[119].trackTick).toBe(120);
    expect(states[120]).toMatchObject({ trackTick: 239, direction: -1, discontinuity: true });
    expect(states[239].trackTick).toBe(120);
    expect(states[240]).toMatchObject({ trackTick: 241, direction: 1, discontinuity: true });
  });

  it('restart jumps into the past and continues forward', () => {
    const map = new TimelineMap(900);
    advance(map, 500);
    map.add('restart', 180, 500);
    expect(map.advance()).toMatchObject({ previousTick: 500, trackTick: 180, direction: 1, discontinuity: true });
    expect(map.advance().trackTick).toBe(181);
  });

  it('clamps forward-only edits to the current replay time', () => {
    const map = new TimelineMap(900);
    advance(map, 300);
    const op = map.add('delete', 100, 300);
    expect(op.start).toBe(300);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run tests/timeline.test.js
```

Expected: FAIL because `src/echo/TimelineEdits.js` does not exist.

- [ ] **Step 3: Add constants**

```js
// append to src/core/config.js
export const TIMELINE = {
  sectionTicks: 2 * TICK_RATE,
  cursorStepTicks: 0.5 * TICK_RATE,
};

export const TIMELINE_COST = {
  delete: 5,
  freeze: 3,
  reverse: 6,
  restart: 6,
};
```

- [ ] **Step 4: Implement `TimelineMap` and room-use accounting**

```js
// src/echo/TimelineEdits.js
import { TIMELINE, TIMELINE_COST } from '../core/config.js';

export const EDIT_TYPES = Object.freeze(['delete', 'freeze', 'reverse', 'restart']);
export const editCost = (type) => TIMELINE_COST[type] ?? 0;

export class TimelineMap {
  constructor(lengthTicks, startTick = 0) {
    this.lengthTicks = lengthTicks;
    this.trackTick = Math.max(0, Math.min(lengthTicks, startTick));
    this.ops = [];
    this.runtime = null;
    this.pendingRestart = null;
  }

  add(type, cursorTick, currentReplayTick = this.trackTick) {
    if (!EDIT_TYPES.includes(type)) throw new Error(`Unknown timeline edit '${type}'`);
    let start = Math.round(cursorTick);
    if (type !== 'restart') start = Math.max(start, currentReplayTick);
    start = Math.max(0, Math.min(this.lengthTicks, start));
    if (type === 'restart') {
      this.pendingRestart = start;
      return { type, start, end: start };
    }
    const end = Math.min(this.lengthTicks, start + TIMELINE.sectionTicks);
    const op = { type, start, end, used: false };
    this.ops.push(op);
    this.ops.sort((a, b) => a.start - b.start);
    return op;
  }

  advance() {
    const previousTick = this.trackTick;
    if (this.pendingRestart !== null) {
      this.trackTick = this.pendingRestart;
      this.pendingRestart = null;
      return { previousTick, trackTick: this.trackTick, direction: 1, discontinuity: true };
    }

    if (this.runtime) return this.advanceRuntime(previousTick);
    const op = this.ops.find((candidate) => !candidate.used && candidate.start <= this.trackTick + 1);
    if (op) {
      op.used = true;
      if (op.type === 'delete') {
        this.trackTick = op.end + 1;
        return { previousTick, trackTick: this.trackTick, direction: 1, discontinuity: true };
      }
      if (op.type === 'freeze') {
        this.runtime = { op, remaining: op.end - op.start };
        this.trackTick = op.start;
        return { previousTick, trackTick: this.trackTick, direction: 0, discontinuity: false };
      }
      if (op.type === 'reverse') {
        this.runtime = { op, remaining: op.end - op.start };
        this.trackTick = Math.max(op.start, op.end - 1);
        return { previousTick, trackTick: this.trackTick, direction: -1, discontinuity: true };
      }
    }

    this.trackTick = Math.min(this.lengthTicks, this.trackTick + 1);
    return { previousTick, trackTick: this.trackTick, direction: 1, discontinuity: false };
  }

  advanceRuntime(previousTick) {
    const { op } = this.runtime;
    this.runtime.remaining--;
    if (op.type === 'freeze') {
      this.trackTick = op.start;
      if (this.runtime.remaining <= 0) this.runtime = null;
      return { previousTick, trackTick: this.trackTick, direction: 0, discontinuity: false };
    }
    this.trackTick = Math.max(op.start, this.trackTick - 1);
    if (this.runtime.remaining <= 0) {
      this.runtime = null;
      this.trackTick = Math.min(this.lengthTicks, op.end + 1);
      return { previousTick, trackTick: this.trackTick, direction: 1, discontinuity: true };
    }
    return { previousTick, trackTick: this.trackTick, direction: -1, discontinuity: false };
  }
}

export class TimelineEdits {
  constructor(sim) {
    this.sim = sim;
    this.reset();
  }

  reset() {
    this.remaining = { ...(this.sim.room?.cfg.edits ?? {}) };
  }

  newestEcho() {
    return [...this.sim.echoes.echoes].reverse().find((echo) => echo.isActivator) ?? null;
  }

  apply(echo, type, cursorTick) {
    if (!echo || !EDIT_TYPES.includes(type)) return { ok: false, reason: 'INVALID EDIT' };
    if ((this.remaining[type] ?? 0) <= 0) return { ok: false, reason: 'NO EDITS LEFT' };
    const op = echo.timeline.add(type, cursorTick, echo.timeline.trackTick);
    this.remaining[type]--;
    this.sim.paradox.add(editCost(type), `timeline:${type}`);
    this.sim.bus.emit('timeline:edit', { echo, type, cursorTick: op.start, op });
    return { ok: true, op };
  }
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npx vitest run tests/timeline.test.js
```

Expected: all timeline-map tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/core/config.js src/echo/TimelineEdits.js tests/timeline.test.js
git commit -m "feat: add deterministic Echo timeline map"
```

### Task 2: Integrate Timeline Operations into Echo Replay

**Files:**
- Modify: `src/echo/Echo.js`
- Modify: `src/echo/EchoManager.js`
- Extend: `tests/timeline.test.js`

**Interfaces:**
- Consumes: `new TimelineMap(track.lengthTicks, startTick)`.
- Produces: every `Echo` has `timeline`, `restartFrom(trackTick)`, `lastInteractionEvent`.
- Echo event dispatch receives track-time intervals rather than assuming replay time always moves forward.

- [ ] **Step 1: Add failing event-semantics tests**

```js
// append to tests/timeline.test.js
import { EchoRecorder } from '../src/echo/EchoRecorder.js';
import { Echo } from '../src/echo/Echo.js';

function eventTrack() {
  const rec = new EchoRecorder();
  const player = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, flags: 1, platform: null };
  rec.start(player);
  for (let tick = 1; tick <= 300; tick++) {
    player.pos.x = tick / 60;
    rec.record(tick, player);
    if (tick === 100 || tick === 180 || tick === 260) rec.recordEvent(tick, 'interact', `switch${tick}`);
  }
  return rec.finish(300, player);
}

function runEcho(echo, ticks) {
  const fired = [];
  const ctx = { platforms: [], onEvent: (_echo, event) => fired.push(event.targetId) };
  for (let i = 0; i < ticks; i++) echo.update(ctx);
  return fired;
}

it('delete drops events inside the skipped section', () => {
  const echo = new Echo(eventTrack(), 1, []);
  echo.timeline.add('delete', 90, 0);
  expect(runEcho(echo, 200)).toEqual(['switch260']);
});

it('reverse does not fire interactions while track time moves backward', () => {
  const echo = new Echo(eventTrack(), 1, []);
  echo.timeline.add('reverse', 90, 0);
  expect(runEcho(echo, 300)).toEqual(['switch260']);
});

it('restart rewinds the event cursor so later events fire again', () => {
  const echo = new Echo(eventTrack(), 1, []);
  expect(runEcho(echo, 220)).toEqual(['switch100', 'switch180']);
  echo.restartFrom(80);
  expect(runEcho(echo, 140)).toEqual(['switch100', 'switch180']);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npx vitest run tests/timeline.test.js
```

Expected: FAIL because `Echo.timeline` and `restartFrom` are missing.

- [ ] **Step 3: Move Echo replay onto `TimelineMap`**

Implement these exact changes in `src/echo/Echo.js`:

```js
import { TimelineMap } from './TimelineEdits.js';

// constructor, after this.track:
this.timeline = new TimelineMap(track.lengthTicks, 0);
this.lastInteractionEvent = null;
this.startAt = 0;

restartFrom(trackTick) {
  this.timeline.add('restart', trackTick, this.timeline.trackTick);
  this.eventCursor = this.track.events.findIndex((event) => event.tick >= trackTick);
  if (this.eventCursor < 0) this.eventCursor = this.track.events.length;
  this.state = 'replaying';
}

fireForwardEvents(ctx, previousTick, trackTick) {
  const events = this.track.events;
  while (this.eventCursor < events.length && events[this.eventCursor].tick <= previousTick) {
    this.eventCursor++;
  }
  while (this.eventCursor < events.length && events[this.eventCursor].tick <= trackTick) {
    const event = events[this.eventCursor++];
    ctx.onEvent?.(this, event);
    if (event.type === 'interact') this.lastInteractionEvent = event;
  }
}
```

Replace direct `replayTick++` and the existing event loop with:

```js
const step = this.timeline.advance();
this.replayTick = step.trackTick; // compatibility for UI/debug code
this.applySample(step.trackTick, ctx.platforms);
if (step.direction > 0 && !step.discontinuity) {
  this.fireForwardEvents(ctx, step.previousTick, step.trackTick);
} else if (step.direction > 0 && step.discontinuity) {
  this.eventCursor = this.track.events.findIndex((event) => event.tick > step.trackTick);
  if (this.eventCursor < 0) this.eventCursor = this.track.events.length;
}
```

Keep phase 1 Freeze (`frozenTicks`) outside `TimelineMap`: it is an ability cooldown effect, while the timeline `freeze` edit belongs inside the map.

- [ ] **Step 4: Support a corruption start offset in `EchoManager.spawn`**

Change the method signature:

```js
spawn(track, maxEchoes, platforms, { startAt = 0 } = {}) {
  // existing eviction code
  const echo = new Echo(track, this.nextSerial++, platforms);
  if (startAt > 0) {
    echo.timeline.trackTick = Math.min(track.lengthTicks, startAt);
    echo.replayTick = echo.timeline.trackTick;
    echo.applySample(echo.replayTick, platforms);
    echo.eventCursor = track.events.findIndex((event) => event.tick > startAt);
    if (echo.eventCursor < 0) echo.eventCursor = track.events.length;
  }
  this.echoes.push(echo);
  this.bus?.emit('echo:spawn', { echo });
  return echo;
}
```

- [ ] **Step 5: Run timeline and existing replay tests**

```powershell
npx vitest run tests/timeline.test.js tests/echoReplay.test.js tests/interactionReplay.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/echo/Echo.js src/echo/EchoManager.js tests/timeline.test.js
git commit -m "feat: apply timeline edits during Echo replay"
```

### Task 3: Resonance Grid and Echo Hunter Simulation

**Files:**
- Create: `src/hunter/Resonance.js`
- Create: `src/hunter/Hunter.js`
- Modify: `src/core/config.js`
- Create: `tests/hunter.test.js`

**Interfaces:**
- `Resonance.register(echo)` stores the Echo's sampled 1 m cells.
- `Resonance.at(echo, x, z)` is true only when an older Echo visited that cell.
- `Hunter.update(ctx)` consumes `{ player, echoes, room, world, resonance, bus, killPlayer, huntEcho }`.
- Hunter exposes `{ pos, prevPos, target, state, alert, radius }`.

- [ ] **Step 1: Write failing Hunter tests**

```js
// tests/hunter.test.js
import { describe, it, expect } from 'vitest';
import { Hunter } from '../src/hunter/Hunter.js';
import { Resonance } from '../src/hunter/Resonance.js';
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
  id: `echo${serial}`, serial, kind: 'echo', pos: { x, y: 0, z },
  feet: { x, y: 0, z }, flags, isActivator: true, isFrozen: false, state: 'replaying',
});
const player = (x, z, sprint = false) => ({
  id: 'player', kind: 'player', pos: { x, y: 0, z },
  flags: sprint ? FLAG_WALKING | FLAG_SPRINTING | FLAG_GROUNDED : FLAG_GROUNDED,
});
const ctx = (hunter, overrides = {}) => ({
  player: player(50, 50), echoes: [], room, world,
  resonance: new Resonance(), bus: null, killPlayer: () => {}, huntEcho: () => {},
  ...overrides,
});

describe('Echo Hunter', () => {
  it('ignores holding and frozen echoes', () => {
    const hunter = new Hunter({ pos: [0, 0], patrol: [[0, 0], [4, 0]] }, room);
    const holding = echo(1, 3, 0, FLAG_GROUNDED);
    holding.state = 'holding';
    const frozen = echo(2, 2, 0, FLAG_GROUNDED | FLAG_WALKING);
    frozen.isFrozen = true;
    hunter.update(ctx(hunter, { echoes: [holding, frozen] }));
    expect(hunter.target).toBeNull();
  });

  it('chooses the loudest audible Echo; resonance adds 0.8', () => {
    const hunter = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    const walk = echo(1, 7, 0, FLAG_GROUNDED | FLAG_WALKING);
    const sprint = echo(2, 10, 0, FLAG_GROUNDED | FLAG_WALKING | FLAG_SPRINTING);
    const resonance = new Resonance();
    resonance.markOlderCell(3, 7, 0);
    const resonant = echo(3, 7, 0, FLAG_GROUNDED | FLAG_WALKING);
    hunter.update(ctx(hunter, { echoes: [walk, sprint, resonant], resonance }));
    expect(hunter.target).toBe(resonant);
  });

  it('hears a walking player only within 3 m and a sprinting player within 8 m', () => {
    const h1 = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    h1.update(ctx(h1, { player: player(4, 0, false) }));
    expect(h1.target).toBeNull();
    const h2 = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    h2.update(ctx(h2, { player: player(7.5, 0, true) }));
    expect(h2.target.kind).toBe('player');
  });

  it('catches an Echo and the player', () => {
    let hunted = 0;
    let killed = 0;
    const hunter = new Hunter({ pos: [0, 0], patrol: [[0, 0]] }, room);
    hunter.update(ctx(hunter, {
      player: player(20, 0),
      echoes: [echo(1, 0.5, 0, FLAG_GROUNDED | FLAG_WALKING)],
      huntEcho: () => hunted++,
      killPlayer: () => killed++,
    }));
    expect(hunted).toBe(1);
    hunter.reset();
    hunter.update(ctx(hunter, { player: player(0.5, 0), killPlayer: () => killed++ }));
    expect(killed).toBe(1);
  });
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npx vitest run tests/hunter.test.js
```

Expected: FAIL because the Hunter modules do not exist.

- [ ] **Step 3: Add Hunter constants**

```js
// append to src/core/config.js
export const HUNTER = {
  speed: 2.2,
  radius: 0.45,
  height: 1.4,
  echoHearingScale: 12,
  playerWalkRange: 3,
  playerSprintRange: 8,
  targetLockTicks: TICK_RATE,
  lostTargetTicks: 3 * TICK_RATE,
  stuckTicks: 1.5 * TICK_RATE,
  catchDistance: 0.8,
};
```

- [ ] **Step 4: Implement the resonance grid**

```js
// src/hunter/Resonance.js
export class Resonance {
  constructor() {
    this.cellsBySerial = new Map();
  }

  reset() {
    this.cellsBySerial.clear();
  }

  key(x, z) {
    return `${Math.round(x)},${Math.round(z)}`;
  }

  markOlderCell(serial, x, z) {
    if (!this.cellsBySerial.has(serial)) this.cellsBySerial.set(serial, new Set());
    this.cellsBySerial.get(serial).add(this.key(x, z));
  }

  register(echo) {
    const cells = new Set();
    const out = {};
    const cursor = { i: 0 };
    for (let tick = 0; tick <= echo.track.lengthTicks; tick += 30) {
      echo.track.sample(tick, cursor, [], out);
      cells.add(this.key(out.x, out.z));
    }
    this.cellsBySerial.set(echo.serial, cells);
  }

  at(echo, x, z) {
    const key = this.key(x, z);
    for (const [serial, cells] of this.cellsBySerial) {
      if (serial < echo.serial && cells.has(key)) return true;
    }
    return false;
  }
}
```

- [ ] **Step 5: Implement Hunter targeting, patrol, steering and catches**

```js
// src/hunter/Hunter.js
import { HUNTER, DT } from '../core/config.js';
import { FLAG_WALKING, FLAG_SPRINTING, FLAG_JUMPING } from '../player/Player.js';
import { dist2D, v3, copy3 } from '../math/vec.js';
import { resolveHorizontal } from '../physics/Collision.js';

export class Hunter {
  constructor(cfg, room) {
    this.cfg = cfg;
    this.room = room;
    this.patrol = cfg.patrol.map(([x, z]) => room.toWorld(x, 0, z));
    const start = cfg.pos ? room.toWorld(cfg.pos[0], 0, cfg.pos[1]) : this.patrol[0];
    this.spawn = { ...start };
    this.pos = v3(start.x, 0, start.z);
    this.prevPos = v3(start.x, 0, start.z);
    this.radius = HUNTER.radius;
    this.height = HUNTER.height;
    this.kind = 'hunter';
    this.reset();
  }

  reset() {
    this.pos.x = this.spawn.x; this.pos.y = 0; this.pos.z = this.spawn.z;
    copy3(this.prevPos, this.pos);
    this.target = null;
    this.state = 'patrol';
    this.patrolIndex = 0;
    this.lockTicks = 0;
    this.lostTicks = 0;
    this.stuckTicks = 0;
    this.alert = 0;
  }

  echoNoise(echo, resonance) {
    if (!echo.isActivator || echo.isFrozen || echo.state === 'holding') return 0;
    if (!(echo.flags & FLAG_WALKING)) return 0;
    let noise = echo.flags & FLAG_SPRINTING ? 1.6 : 1;
    if (echo.flags & FLAG_JUMPING) noise += 0.8;
    if (resonance.at(echo, echo.pos.x, echo.pos.z)) noise += 0.8;
    return noise;
  }

  chooseTarget(ctx) {
    const candidates = [];
    for (const echo of ctx.echoes) {
      const noise = this.echoNoise(echo, ctx.resonance);
      const distance = dist2D(this.pos.x, this.pos.z, echo.pos.x, echo.pos.z);
      if (noise > 0 && distance <= HUNTER.echoHearingScale * noise) {
        candidates.push({ actor: echo, noise, distance });
      }
    }
    const sprint = ctx.player.flags & FLAG_SPRINTING;
    const playerRange = sprint ? HUNTER.playerSprintRange : HUNTER.playerWalkRange;
    const playerDistance = dist2D(this.pos.x, this.pos.z, ctx.player.pos.x, ctx.player.pos.z);
    if (playerDistance <= playerRange) candidates.push({ actor: ctx.player, noise: sprint ? 0.9 : 0.35, distance: playerDistance });
    candidates.sort((a, b) => b.noise - a.noise || a.distance - b.distance);
    return candidates[0]?.actor ?? null;
  }

  update(ctx) {
    copy3(this.prevPos, this.pos);
    const candidate = this.chooseTarget(ctx);
    if (this.lockTicks <= 0) {
      if (candidate !== this.target) {
        this.target = candidate;
        this.lockTicks = HUNTER.targetLockTicks;
        if (candidate) ctx.bus?.emit('hunter:alert', { hunter: this, target: candidate });
      }
    } else this.lockTicks--;

    if (this.target && !candidate) {
      if (++this.lostTicks >= HUNTER.lostTargetTicks) this.target = null;
    } else this.lostTicks = 0;

    this.state = this.target ? 'hunt' : 'patrol';
    const goal = this.target?.pos ?? this.patrol[this.patrolIndex];
    const distance = dist2D(this.pos.x, this.pos.z, goal.x, goal.z);
    if (!this.target && distance < 0.35) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
      return;
    }
    if (distance > 0.001) {
      this.pos.x += ((goal.x - this.pos.x) / distance) * HUNTER.speed * DT;
      this.pos.z += ((goal.z - this.pos.z) / distance) * HUNTER.speed * DT;
      const boxes = ctx.world.query(this.pos.x, this.pos.z, 2);
      resolveHorizontal(this.pos, this.radius, this.height, boxes, 0);
    }

    if (this.target && dist2D(this.pos.x, this.pos.z, this.target.pos.x, this.target.pos.z) <= HUNTER.catchDistance) {
      if (this.target.kind === 'echo') ctx.huntEcho(this.target, this);
      else ctx.killPlayer('hunter');
      this.target = null;
    }
  }
}
```

When integrating in Task 4, add active-laser boxes to the Hunter's local collider list before `resolveHorizontal`; player collision still ignores laser boxes.

- [ ] **Step 6: Run focused tests**

```powershell
npx vitest run tests/hunter.test.js
```

Expected: all Hunter tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/core/config.js src/hunter/Resonance.js src/hunter/Hunter.js tests/hunter.test.js
git commit -m "feat: add noise-driven Echo Hunter"
```

### Task 4: Wire Hunter and Timeline into Rooms and Simulation

**Files:**
- Modify: `src/puzzle/Room.js`
- Modify: `src/core/Simulation.js`
- Modify: `src/puzzle/RoomManager.js`
- Modify: `src/core/Paradox.js`
- Modify: `src/objects/Switch.js`
- Extend: `tests/hunter.test.js`
- Extend: `tests/timeline.test.js`

**Interfaces:**
- `room.hunter` is `Hunter | null`.
- `sim.timelineEdits` is a `TimelineEdits`.
- `sim.openTimeline()` returns `{ ok, echo, remaining }` without mutating pause state; `Game` owns pausing.
- `sim.huntEcho(echo, hunter)` collapses the Echo with reason `hunted`.

- [ ] **Step 1: Add failing integration tests**

```js
// append to tests/hunter.test.js
import { Simulation } from '../src/core/Simulation.js';

it('resets the room Hunter to its spawn point', () => {
  const sim = new Simulation();
  sim.roomManager.begin(5);
  expect(sim.room.hunter).not.toBeNull();
  const spawn = { ...sim.room.hunter.spawn };
  sim.room.hunter.pos.x += 4;
  sim.restartRoom();
  expect(sim.room.hunter.pos).toMatchObject(spawn);
});

it('hunted Echo collapse adds five Paradox', () => {
  const sim = new Simulation();
  sim.roomManager.begin(5);
  const echo = { isActivator: true, collapse: (reason) => (echo.reason = reason) };
  sim.huntEcho(echo, sim.room.hunter);
  expect(echo.reason).toBe('hunted');
  expect(sim.paradox.value).toBe(5);
});
```

```js
// append to tests/timeline.test.js
import { Simulation } from '../src/core/Simulation.js';

it('room edit uses reset on room restart but Paradox persists', () => {
  const sim = new Simulation();
  sim.roomManager.begin(6);
  const echo = sim.timelineEdits.newestEcho();
  expect(echo).toBeNull();
  sim.timelineEdits.remaining.delete = 0;
  sim.paradox.add(5, 'timeline:delete');
  sim.restartRoom();
  expect(sim.timelineEdits.remaining.delete).toBe(sim.room.cfg.edits.delete);
  expect(sim.paradox.value).toBe(5);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npx vitest run tests/hunter.test.js tests/timeline.test.js
```

- [ ] **Step 3: Construct and reset the Hunter in `Room`**

```js
// src/puzzle/Room.js
import { Hunter } from '../hunter/Hunter.js';

// after object construction:
this.hunter = cfg.hunter ? new Hunter(cfg.hunter, this) : null;

// inside reset():
this.hunter?.reset();
```

- [ ] **Step 4: Wire timeline edits, resonance and Hunter lifecycle**

Add to the `Simulation` constructor:

```js
import { TimelineEdits } from '../echo/TimelineEdits.js';
import { Resonance } from '../hunter/Resonance.js';
import { PARADOX_COST } from './config.js';

this.timelineEdits = new TimelineEdits(this);
this.resonance = new Resonance();
this.cycleIndex = 0;

this.bus.on('echo:spawn', ({ echo }) => this.resonance.register(echo));
```

Add these methods:

```js
openTimeline() {
  if (!this.room.cfg.edits) return { ok: false, reason: 'TIMELINE LOCKED' };
  const echo = this.timelineEdits.newestEcho();
  if (!echo) return { ok: false, reason: 'NO ECHO' };
  return { ok: true, echo, remaining: { ...this.timelineEdits.remaining } };
}

huntEcho(echo, hunter) {
  if (!echo?.isActivator) return;
  echo.collapse('hunted');
  this.paradox.add(5, 'hunted');
  this.bus.emit('echo:collapse', { echo, reason: 'hunted' });
  this.bus.emit('hunter:strike', { hunter, target: echo, pos: { ...echo.pos } });
}
```

Before sensors update in `Simulation.step`, add:

```js
const hunter = room.hunter;
if (hunter) {
  hunter.update({
    player,
    echoes: this.echoes.echoes,
    room,
    world: this.world,
    resonance: this.resonance,
    bus: this.bus,
    killPlayer: (reason) => this.kill(reason),
    huntEcho: (echo, source) => this.huntEcho(echo, source),
  });
}
```

For Hunter laser barriers, either:

1. Add active laser boxes to the boxes inside `Hunter.update`, or
2. Add `PhysicsWorld.queryForHunter(x,z)` returning ordinary colliders plus each active laser's `box`.

Use option 2:

```js
queryForHunter(x, z, range = 4) {
  const out = [...this.query(x, z, range)];
  for (const room of this.rooms) {
    if (!room.nearXZ(x, z, range + 2)) continue;
    for (const laser of room.lasers) if (laser.active) out.push(laser.box);
  }
  return out;
}
```

Then call `ctx.world.queryForHunter` from `Hunter.update`.

- [ ] **Step 5: Reset per-room systems in `RoomManager.startRoom`**

```js
sim.timelineEdits?.reset();
sim.resonance?.reset();
sim.cycleIndex = 0;
room.hunter?.reset();
```

Increment `cycleIndex` whenever the recorder completes a cycle, immediately before spawning the Echo.

- [ ] **Step 6: Add breaker switch mode**

```js
// src/objects/Switch.js constructor
this.broken = false;

// interact()
if (this.mode === 'breaker') {
  if (this.broken) return;
  if (this.on) {
    this.on = false;
    this.broken = true;
  } else {
    this.on = true;
  }
} else if (this.mode === 'toggle') {
  this.on = !this.on;
} else {
  this.pulseUntil = t + this.pulseTicks;
}

// reset()
this.broken = false;
```

This mode is used by room 8's authored repeated press: it visibly trips the breaker without making the room unsolvable.

- [ ] **Step 7: Run focused and full tests**

```powershell
npx vitest run tests/hunter.test.js tests/timeline.test.js tests/roomState.test.js tests/transitions.test.js
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```powershell
git add src/puzzle/Room.js src/core/Simulation.js src/puzzle/RoomManager.js src/physics/PhysicsWorld.js src/objects/Switch.js tests/hunter.test.js tests/timeline.test.js
git commit -m "feat: integrate Hunter and timeline systems"
```

### Task 5: Deterministic Echo Corruption

**Files:**
- Create: `src/echo/Corruption.js`
- Modify: `src/core/config.js`
- Modify: `src/core/Simulation.js`
- Modify: `src/echo/Echo.js`
- Modify: `src/puzzle/RoomManager.js`
- Create: `tests/corruption.test.js`

**Interfaces:**
- `seededRandom(seed)` returns a deterministic `[0,1)` closure.
- `Corruption.onEchoSpawn(echo)` applies `early` and schedules random visual glitches.
- `Corruption.update()` fires authored and queued glitches.
- Echo adds `stareTicks`, `stareYaw`, `visualGlitch`, `ghostPauseTicks`, `corruptPauseTicks`.

- [ ] **Step 1: Write failing deterministic corruption tests**

```js
// tests/corruption.test.js
import { describe, it, expect } from 'vitest';
import { seededRandom, Corruption } from '../src/echo/Corruption.js';

it('seededRandom returns the same sequence for the same seed', () => {
  const a = seededRandom(12345);
  const b = seededRandom(12345);
  expect([a(), a(), a(), a()]).toEqual([b(), b(), b(), b()]);
});

it('random schedules are deterministic and never choose gameplay edits', () => {
  const sim = fakeSim({ paradox: 100, roomId: 8, cycleIndex: 4 });
  const a = new Corruption(sim, 77);
  const b = new Corruption(sim, 77);
  expect(a.rollRandom(3)).toEqual(b.rollRandom(3));
  for (let i = 0; i < 100; i++) {
    const glitch = a.rollRandom(i);
    if (glitch) expect(['jitter', 'flicker', 'stare', 'ghostPause']).toContain(glitch.type);
  }
});

it('fires authored pause and repeat at exact room ticks', () => {
  const events = [];
  const echo = fakeEcho();
  const sim = fakeSim({
    roomId: 8,
    cycleIndex: 5,
    clock: 300,
    corruption: [
      { cycle: 5, at: 5, echo: 1, type: 'pause' },
      { cycle: 5, at: 5, echo: 1, type: 'repeat' },
    ],
    echoes: [echo],
    onEvent: (_echo, event) => events.push(event.targetId),
  });
  echo.lastInteractionEvent = { tick: 120, type: 'interact', targetId: 'breaker' };
  new Corruption(sim, 1).update();
  expect(echo.corruptPauseTicks).toBe(30);
  expect(events).toEqual(['breaker']);
});

function fakeEcho() {
  return { serial: 1, isActivator: true, corruptPauseTicks: 0, visualGlitch: null };
}

function fakeSim(options) {
  const room = {
    cfg: { id: options.roomId, corruption: options.corruption ?? [] },
    clock: options.clock ?? 0,
  };
  return {
    room,
    cycleIndex: options.cycleIndex ?? 0,
    paradox: { value: options.paradox ?? 0 },
    echoes: { echoes: options.echoes ?? [] },
    replayEvent: options.onEvent ?? (() => {}),
    bus: { emit: () => {} },
  };
}
```

- [ ] **Step 2: Run and verify RED**

```powershell
npx vitest run tests/corruption.test.js
```

- [ ] **Step 3: Add constants and the corruption scheduler**

```js
// src/core/config.js
export const CORRUPTION = {
  baseChance: 0.02,
  paradoxChance: 0.003,
  stareTicks: 1.5 * TICK_RATE,
  pauseTicks: 0.5 * TICK_RATE,
  earlyTicks: TICK_RATE,
  visualTicks: 0.75 * TICK_RATE,
};
```

```js
// src/echo/Corruption.js
import { CORRUPTION, TICK_RATE } from '../core/config.js';

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VISUAL_TYPES = ['jitter', 'flicker', 'stare', 'ghostPause'];

export class Corruption {
  constructor(sim, runSeed = 0x4543484f) {
    this.sim = sim;
    this.runSeed = runSeed;
    this.fired = new Set();
  }

  reset() {
    this.fired.clear();
  }

  randomFor(echoSerial) {
    const id = this.sim.room.cfg.id;
    return seededRandom(this.runSeed ^ (id * 73856093) ^ (this.sim.cycleIndex * 19349663) ^ (echoSerial * 83492791));
  }

  rollRandom(echoSerial) {
    const random = this.randomFor(echoSerial);
    const chance = CORRUPTION.baseChance + this.sim.paradox.value * CORRUPTION.paradoxChance;
    if (random() >= chance) return null;
    return {
      type: VISUAL_TYPES[Math.floor(random() * VISUAL_TYPES.length)],
      atTick: Math.floor(random() * 12 * TICK_RATE) + TICK_RATE,
      duration: CORRUPTION.visualTicks,
    };
  }

  onEchoSpawn(echo) {
    const early = this.sim.room.cfg.corruption?.find(
      (event) => event.type === 'early' && event.cycle === this.sim.cycleIndex && event.echo === echo.serial,
    );
    if (early) echo.restartFrom(CORRUPTION.earlyTicks);
    const random = this.rollRandom(echo.serial);
    if (random) echo.randomGlitch = random;
  }

  apply(echo, event, authored) {
    if (event.type === 'stare') echo.stareTicks = authored ? CORRUPTION.stareTicks : event.duration;
    if (event.type === 'pause') echo.corruptPauseTicks = CORRUPTION.pauseTicks;
    if (event.type === 'repeat' && echo.lastInteractionEvent) this.sim.replayEvent(echo, echo.lastInteractionEvent);
    if (event.type === 'ghostPause') echo.ghostPauseTicks = event.duration;
    if (event.type === 'jitter' || event.type === 'flicker') echo.visualGlitch = { type: event.type, ticks: event.duration };
    this.sim.bus.emit('echo:corrupt', { echo, type: event.type, authored });
  }

  update() {
    for (const event of this.sim.room.cfg.corruption ?? []) {
      if (event.type === 'early') continue;
      const key = `${this.sim.cycleIndex}:${event.echo}:${event.at}:${event.type}`;
      if (this.fired.has(key)) continue;
      if (event.cycle !== this.sim.cycleIndex || this.sim.room.clock < Math.round(event.at * TICK_RATE)) continue;
      const echo = this.sim.echoes.echoes.find((candidate) => candidate.serial === event.echo && candidate.isActivator);
      if (!echo) continue;
      this.fired.add(key);
      this.apply(echo, event, true);
    }
    for (const echo of this.sim.echoes.echoes) {
      const event = echo.randomGlitch;
      if (!event || event.fired || echo.age < event.atTick) continue;
      event.fired = true;
      this.apply(echo, event, false);
    }
  }
}
```

- [ ] **Step 4: Add Echo corruption state**

In `Echo` constructor:

```js
this.stareTicks = 0;
this.stareYaw = 0;
this.corruptPauseTicks = 0;
this.ghostPauseTicks = 0;
this.visualGlitch = null;
this.randomGlitch = null;
```

At the top of normal replay update:

```js
if (this.corruptPauseTicks > 0) {
  this.corruptPauseTicks--;
  return;
}
if (this.stareTicks > 0) this.stareTicks--;
if (this.ghostPauseTicks > 0) this.ghostPauseTicks--;
if (this.visualGlitch && --this.visualGlitch.ticks <= 0) this.visualGlitch = null;
```

Do not let `ghostPauseTicks` affect simulation position; it is used by `EchoView` only.

- [ ] **Step 5: Wire corruption to simulation**

```js
// Simulation constructor
import { Corruption } from '../echo/Corruption.js';
this.corruption = new Corruption(this);
this.bus.on('echo:spawn', ({ echo }) => this.corruption.onEchoSpawn(echo));

// once per normal simulation tick, after EchoManager.update:
this.corruption.update();
```

Reset it in `RoomManager.startRoom`:

```js
sim.corruption?.reset();
```

- [ ] **Step 6: Run tests**

```powershell
npx vitest run tests/corruption.test.js tests/echoReplay.test.js
npx vitest run
```

Expected: all tests pass and all existing scripted room solutions remain deterministic.

- [ ] **Step 7: Commit**

```powershell
git add src/core/config.js src/echo/Corruption.js src/echo/Echo.js src/core/Simulation.js src/puzzle/RoomManager.js tests/corruption.test.js
git commit -m "feat: add deterministic Echo corruption"
```

### Task 6: Pause-Time Timeline Editor UI

**Files:**
- Modify: `index.html`
- Modify: `src/styles/main.css`
- Create: `src/ui/TimelineEditor.js`
- Modify: `src/core/Input.js`
- Modify: `src/core/Game.js`
- Modify: `src/ui/UI.js`
- Extend: `tests/timeline.test.js`

**Interfaces:**
- `TimelineEditor.open(echo, remaining)`, `close()`, `isOpen`, `handleKey(code)`, `render()`.
- `TimelineEditor.onApply(type, cursorTick)` calls `sim.timelineEdits.apply`.
- `Game.state === 'editing'` means the fixed loop is paused but rendering continues.

- [ ] **Step 1: Add a failing edit-use test**

```js
// append to tests/timeline.test.js
it('consumes only the selected room edit and adds the exact Paradox cost', () => {
  const sim = new Simulation();
  sim.roomManager.begin(6);
  const fake = {
    isActivator: true,
    timeline: new TimelineMap(900),
  };
  sim.echoes.echoes.push(fake);
  expect(sim.timelineEdits.apply(fake, 'delete', 180)).toMatchObject({ ok: true });
  expect(sim.timelineEdits.remaining.delete).toBe(sim.room.cfg.edits.delete - 1);
  expect(sim.paradox.value).toBe(5);
  expect(sim.timelineEdits.apply(fake, 'delete', 240)).toMatchObject({ ok: false, reason: 'NO EDITS LEFT' });
});
```

- [ ] **Step 2: Run and verify RED until room 7 gets its `edits` config**

```powershell
npx vitest run tests/timeline.test.js
```

- [ ] **Step 3: Add editor markup**

Inside `index.html`, after `#hud`:

```html
<div id="timeline-editor" class="timeline-editor hidden">
  <div class="panel timeline-panel">
    <div class="timeline-head">
      <span>TEMPORAL RECONSTRUCTION</span>
      <b id="timeline-echo">ECHO 1</b>
    </div>
    <div id="timeline-track" class="timeline-track">
      <div id="timeline-played" class="timeline-played"></div>
      <div id="timeline-selection" class="timeline-selection"></div>
      <div id="timeline-cursor" class="timeline-cursor"></div>
      <div id="timeline-markers" class="timeline-markers"></div>
    </div>
    <div class="timeline-time"><span id="timeline-time">00.0s</span><span>SECTION 02.0s</span></div>
    <div id="timeline-ops" class="timeline-ops"></div>
    <div id="timeline-message" class="timeline-message">A/D SELECT TIME · 1-4 SELECT EDIT · ENTER APPLY · T CLOSE</div>
  </div>
</div>
```

- [ ] **Step 4: Add CSS**

Add these selectors to `src/styles/main.css`:

```css
.timeline-editor {
  position: fixed;
  inset: 0;
  z-index: 25;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 7vh;
  background: linear-gradient(transparent 35%, rgba(1, 3, 12, 0.88));
}
.timeline-panel { width: min(860px, calc(100% - 48px)); padding: 24px 30px; }
.timeline-head, .timeline-time { display: flex; justify-content: space-between; letter-spacing: 0.3em; }
.timeline-head b { color: var(--purple); }
.timeline-track { position: relative; height: 52px; margin: 24px 0 8px; border: 1px solid var(--glass-edge); background: rgba(3, 7, 18, 0.9); }
.timeline-played { position: absolute; inset: 0 auto 0 0; background: rgba(95, 227, 255, 0.11); }
.timeline-selection { position: absolute; inset: 4px auto 4px 0; width: 13.333%; background: rgba(176, 107, 255, 0.24); border: 1px solid var(--purple); }
.timeline-cursor { position: absolute; top: -7px; bottom: -7px; width: 2px; background: white; box-shadow: 0 0 12px white; }
.timeline-markers i { position: absolute; bottom: 6px; width: 6px; height: 12px; transform: translateX(-50%) skewX(-12deg); background: var(--blue); }
.timeline-markers i.interact { background: var(--green); }
.timeline-markers i.swap { background: var(--purple); }
.timeline-ops { display: flex; gap: 10px; margin-top: 18px; }
.timeline-op { padding: 8px 14px; opacity: 0.35; border: 1px solid var(--glass-edge); letter-spacing: 0.18em; }
.timeline-op.allowed { opacity: 1; }
.timeline-op.selected { border-color: white; box-shadow: 0 0 14px var(--blue); }
.timeline-message { margin-top: 18px; text-align: center; color: rgba(200, 220, 255, 0.65); font-size: 11px; letter-spacing: 0.18em; }
.timeline-message.error { color: var(--red); }
```

- [ ] **Step 5: Implement `TimelineEditor`**

```js
// src/ui/TimelineEditor.js
import { CYCLE_TICKS, TIMELINE, TICK_RATE } from '../core/config.js';
import { EDIT_TYPES } from '../echo/TimelineEdits.js';

const $ = (id) => document.getElementById(id);

export class TimelineEditor {
  constructor(sim, { onClose } = {}) {
    this.sim = sim;
    this.onClose = onClose;
    this.root = $('timeline-editor');
    this.isOpen = false;
    this.cursorTick = 0;
    this.selected = 'delete';
    this.echo = null;
  }

  open(echo, remaining) {
    this.echo = echo;
    this.remaining = { ...remaining };
    this.cursorTick = Math.ceil(echo.timeline.trackTick / TIMELINE.cursorStepTicks) * TIMELINE.cursorStepTicks;
    this.selected = EDIT_TYPES.find((type) => (this.remaining[type] ?? 0) > 0) ?? 'delete';
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.render();
  }

  close() {
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.onClose?.();
  }

  handleKey(code) {
    if (code === 'KeyT' || code === 'Escape') return this.close();
    if (code === 'KeyA') this.cursorTick -= TIMELINE.cursorStepTicks;
    if (code === 'KeyD') this.cursorTick += TIMELINE.cursorStepTicks;
    if (code.startsWith('Digit')) {
      const i = Number(code.slice(-1)) - 1;
      if (EDIT_TYPES[i]) this.selected = EDIT_TYPES[i];
    }
    this.cursorTick = Math.max(0, Math.min(CYCLE_TICKS - TIMELINE.sectionTicks, this.cursorTick));
    if (code === 'Enter') {
      const result = this.sim.timelineEdits.apply(this.echo, this.selected, this.cursorTick);
      $('timeline-message').textContent = result.ok ? `${this.selected.toUpperCase()} APPLIED` : result.reason;
      $('timeline-message').classList.toggle('error', !result.ok);
      if (result.ok) this.remaining = { ...this.sim.timelineEdits.remaining };
    }
    this.render();
  }

  render() {
    $('timeline-echo').textContent = `ECHO ${this.echo.serial}`;
    $('timeline-time').textContent = `${(this.cursorTick / TICK_RATE).toFixed(1)}s`;
    $('timeline-cursor').style.left = `${(this.cursorTick / CYCLE_TICKS) * 100}%`;
    $('timeline-selection').style.left = `${(this.cursorTick / CYCLE_TICKS) * 100}%`;
    $('timeline-played').style.width = `${(this.echo.timeline.trackTick / CYCLE_TICKS) * 100}%`;
    $('timeline-markers').innerHTML = this.echo.track.events
      .map((event) => `<i class="${event.type}" style="left:${(event.tick / CYCLE_TICKS) * 100}%"></i>`)
      .join('');
    $('timeline-ops').innerHTML = EDIT_TYPES.map((type, index) => {
      const count = this.remaining[type] ?? 0;
      return `<div class="timeline-op ${count ? 'allowed' : ''} ${type === this.selected ? 'selected' : ''}">${index + 1} ${type.toUpperCase()} ×${count}</div>`;
    }).join('');
  }
}
```

- [ ] **Step 6: Route T and editor keys through `Game`**

In `Input`, add an optional key hook before normal gameplay handling:

```js
this.handlers.keyDown = null;

// first lines of onKeyDown:
if (this.handlers.keyDown?.(e.code)) {
  e.preventDefault();
  return;
}
```

In `Game`:

```js
import { TimelineEditor } from '../ui/TimelineEditor.js';

this.timelineEditor = new TimelineEditor(this.sim, { onClose: () => this.closeTimeline() });
this.input.handlers.keyDown = (code) => {
  if (this.state === 'editing') {
    this.timelineEditor.handleKey(code);
    return true;
  }
  if (code === 'KeyT' && this.state === 'playing') {
    this.openTimeline();
    return true;
  }
  return false;
};

openTimeline() {
  const result = this.sim.openTimeline();
  if (!result.ok) {
    this.bus.emit('ability:blocked', { ability: 'timeline', reason: result.reason });
    return;
  }
  this.state = 'editing';
  this.loop.simulating = false;
  this.input.enabled = false;
  this.input.exitLock();
  this.timelineEditor.open(result.echo, result.remaining);
  this.bus.emit('timeline:open', { echo: result.echo });
}

closeTimeline() {
  if (this.state !== 'editing') return;
  this.enterPlaying();
}
```

In `onLockChange`, do not open the pause menu when `state === 'editing'`.

- [ ] **Step 7: Add the T chip**

Add `<div class="ability" id="ab-timeline"><b>T</b><span>EDIT</span></div>` to `#abilities`. In `UI.updateAbilities`, show it when `sim.room.cfg.edits` is present. It has no cooldown bar.

- [ ] **Step 8: Run tests and production build**

```powershell
npx vitest run tests/timeline.test.js
npx vite build
```

Expected: timeline tests pass and production build succeeds.

- [ ] **Step 9: Commit**

```powershell
git add index.html src/styles/main.css src/ui/TimelineEditor.js src/core/Input.js src/core/Game.js src/ui/UI.js tests/timeline.test.js
git commit -m "feat: add pause-time Echo timeline editor"
```

### Task 7: Hunter, Corruption and Timeline Preview Presentation

**Files:**
- Create: `src/render/HunterView.js`
- Modify: `src/render/SceneView.js`
- Modify: `src/echo/EchoMaterial.js`
- Modify: `src/echo/EchoView.js`
- Modify: `src/render/LightRig.js`
- Modify: `src/audio/AudioManager.js`
- Modify: `src/core/Game.js`
- Modify: `src/styles/main.css`

**Interfaces:**
- `HunterView.update(time, alpha, camera)`.
- `SceneView.setTimelinePreview(echo, trackTick)` and `clearTimelinePreview()`.
- Echo shader receives `uCorrupt` in `[0,1]`.
- `LightRig.flicker(seconds)` starts a deterministic light flicker envelope.

- [ ] **Step 1: Create the Hunter view**

```js
// src/render/HunterView.js
import * as THREE from 'three';
import { COLORS } from '../core/config.js';
import { createConeMaterial, createLightCone } from './LightCones.js';

export class HunterView {
  constructor(hunter, { mats, geos }) {
    this.hunter = hunter;
    this.group = new THREE.Group();
    this.body = new THREE.Mesh(geos.octa, mats.metalDark);
    this.body.scale.set(0.85, 1.2, 0.85);
    this.body.position.y = 1.05;
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.red).multiplyScalar(3) });
    this.eye = new THREE.Mesh(geos.sphere, this.eyeMat);
    this.eye.scale.setScalar(0.12);
    this.eye.position.set(0, 1.2, -0.42);
    this.shards = [];
    for (let i = 0; i < 4; i++) {
      const shard = new THREE.Mesh(geos.octa, mats.red);
      shard.scale.set(0.16, 0.35, 0.16);
      this.shards.push(shard);
      this.group.add(shard);
    }
    this.scan = createLightCone(geos, createConeMaterial(COLORS.red, 0.09), { x: 0, y: 1.3, z: -0.3 }, 4, 2.4);
    this.scan.rotation.x = Math.PI / 2;
    this.group.add(this.body, this.eye, this.scan);
  }

  update(time, alpha) {
    const h = this.hunter;
    this.group.position.set(
      h.prevPos.x + (h.pos.x - h.prevPos.x) * alpha,
      0,
      h.prevPos.z + (h.pos.z - h.prevPos.z) * alpha,
    );
    const target = h.target?.pos;
    this.group.rotation.y = target
      ? Math.atan2(-(target.x - h.pos.x), -(target.z - h.pos.z))
      : Math.sin(time * 0.5) * 0.4;
    this.body.position.y = 1.05 + Math.sin(time * 2.2) * 0.08;
    this.shards.forEach((shard, i) => {
      const a = time * 1.4 + (i / this.shards.length) * Math.PI * 2;
      shard.position.set(Math.cos(a) * 0.65, 1.05 + Math.sin(a * 2) * 0.2, Math.sin(a) * 0.65);
      shard.rotation.set(time + i, time * 1.3, 0);
    });
    this.eyeMat.color.set(h.target ? 0xffffff : COLORS.red).multiplyScalar(3);
    this.scan.visible = !h.target;
    this.scan.rotation.z = Math.sin(time * 1.3) * 0.7;
  }
}
```

- [ ] **Step 2: Add Hunter and timeline-preview views to `SceneView`**

Create one `HunterView` per room that has a Hunter and add it to that room's group. Update only the active and adjacent rooms.

For timeline preview:

```js
setTimelinePreview(echo, trackTick) {
  if (!this.timelineGhost) {
    this.timelineGhost = new EchoView(echo, this.geos);
    this.timelineGhost.group.traverse((node) => {
      if (node.material?.uniforms?.uIntensity) node.material.uniforms.uIntensity.value = 0.35;
    });
    this.scene.add(this.timelineGhost.group);
  }
  const sample = echo.track.sample(trackTick, { i: 0 }, this.sim.room.platforms, {});
  this.timelineGhost.group.position.set(
    sample.x + echo.offset.x,
    sample.y + echo.offset.y,
    sample.z + echo.offset.z,
  );
}

clearTimelinePreview() {
  if (!this.timelineGhost) return;
  this.scene.remove(this.timelineGhost.group);
  this.timelineGhost.dispose();
  this.timelineGhost = null;
}
```

Have `TimelineEditor.render()` call `game.view.setTimelinePreview(echo, cursorTick)` through an `onPreview` callback, and `close()` call `clearTimelinePreview`.

- [ ] **Step 3: Add corrupted Echo shader treatment**

Add `uCorrupt` to `EchoMaterial` uniforms. In the vertex shader, multiply slice displacement by `1.0 + uCorrupt * 5.0`. In the fragment shader, split colour channels:

```glsl
float corruptBand = step(0.78, fract(vW.y * 3.0 + uTime * 2.0));
col += vec3(uCorrupt * corruptBand * 1.5, 0.0, uCorrupt * (1.0 - corruptBand));
col *= 1.0 + uCorrupt * (0.4 + 0.6 * sin(uTime * 80.0 + vW.y * 20.0));
```

In `EchoView.update`:

```js
const corrupt = e.visualGlitch ? 1 : e.stareTicks > 0 || e.ghostPauseTicks > 0 ? 0.55 : 0;
u.uCorrupt.value += (corrupt - u.uCorrupt.value) * Math.min(1, dt * 16);
if (e.ghostPauseTicks === 0) {
  this.group.position.set(x, y, z);
}
if (e.stareTicks > 0) {
  this.body.rotation.y = Math.atan2(-(camera.position.x - x), -(camera.position.z - z));
}
```

- [ ] **Step 4: Add screen distortion and light flicker**

In CSS:

```css
body.corrupt #app canvas {
  filter: contrast(1.25) saturate(1.5) hue-rotate(8deg);
  transform: translateX(2px) skewX(0.15deg);
}
body.corrupt::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 50;
  pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(176,107,255,.08) 3px 4px);
  mix-blend-mode: screen;
}
```

In `LightRig`:

```js
flicker(seconds = 0.3) {
  this.flickerUntil = performance.now() / 1000 + seconds;
}

// inside update(time):
const glitch = time < (this.flickerUntil ?? 0) ? (Math.sin(time * 110) > 0.15 ? 1 : 0.1) : 1;
intensity *= glitch;
```

Use `time` consistently: call `flickerUntil = this.lastTime + seconds`, and set `this.lastTime = time` at the top of `update`.

- [ ] **Step 5: Add procedural sounds**

Add these `SOUNDS` entries in `AudioManager.js` using the existing `tone`, `noise` and `fm` helpers:

```js
hunterAlert(a, ctx, t, { pos }) {
  const o = a.out(pos, 1);
  tone(ctx, o, t, { type: 'sawtooth', freq: 110, freqEnd: 330, attack: 0.01, hold: 0.2, release: 0.45, peak: 0.1 });
  fm(ctx, o, t + 0.08, { carrier: 440, carrierEnd: 880, ratio: 1.5, index: 500, attack: 0.01, release: 0.35, peak: 0.07 });
},
hunterStrike(a, ctx, t, { pos }) {
  const o = a.out(pos, 1.2);
  noise(ctx, o, a.noiseBuf, t, { filter: 'lowpass', freq: 1800, freqEnd: 120, release: 0.5, peak: 0.35 });
  tone(ctx, o, t, { type: 'square', freq: 95, freqEnd: 35, release: 0.45, peak: 0.25 });
},
editorOpen(a, ctx, t) {
  const o = a.out(null, 0.8);
  [220, 330, 440, 660].forEach((freq, i) => tone(ctx, o, t + i * 0.03, { type: 'sine', freq, release: 0.35, peak: 0.04 }));
},
edit(a, ctx, t) {
  const o = a.out(null, 0.8);
  fm(ctx, o, t, { carrier: 660, carrierEnd: 220, ratio: 2, index: 350, attack: 0.005, release: 0.35, peak: 0.08 });
},
crackle(a, ctx, t) {
  const o = a.out(null, 0.9);
  for (let i = 0; i < 8; i++) noise(ctx, o, a.noiseBuf, t + i * 0.025, { filter: 'bandpass', freq: 800 + i * 500, q: 8, release: 0.025, peak: 0.06 });
},
```

- [ ] **Step 6: Map events in `Game.bindSimEvents`**

```js
bus.on('hunter:alert', ({ hunter }) => a.play('hunterAlert', { pos: hunter.pos }));
bus.on('hunter:strike', ({ pos }) => a.play('hunterStrike', { pos }));
bus.on('timeline:open', () => a.play('editorOpen'));
bus.on('timeline:edit', () => a.play('edit'));
bus.on('echo:corrupt', () => {
  a.play('crackle');
  document.body.classList.add('corrupt');
  this.view.lightRig.flicker(0.3);
  setTimeout(() => document.body.classList.remove('corrupt'), 300);
});
```

- [ ] **Step 7: Build and browser-smoke the presentation**

```powershell
npx vite build
npm run dev
```

Verify:

1. Hunter body, shards and scan cone render.
2. Alert changes its eye and plays the sting.
3. T opens and closes the timeline editor.
4. Cursor movement changes the ghost preview.
5. A forced authored glitch produces distortion, crackle, light flicker and the shader effect.

- [ ] **Step 8: Commit**

```powershell
git add src/render/HunterView.js src/render/SceneView.js src/echo/EchoMaterial.js src/echo/EchoView.js src/render/LightRig.js src/audio/AudioManager.js src/core/Game.js src/styles/main.css
git commit -m "feat: present Hunter timeline and corruption effects"
```

### Task 8: Retrofit Rooms 6-8 and Update Scripted Solutions

**Files:**
- Modify: `src/rooms/room06.js`
- Modify: `src/rooms/room07.js`
- Modify: `src/rooms/room08.js`
- Modify: `src/debug/Autopilot.js`
- Modify: `src/debug/solutions.js`
- Modify: `tests/solutions.test.js`

**Interfaces:**
- Room 6: `hunter: { pos, patrol }`.
- Room 7: `edits: { delete: 1, restart: 1 }`.
- Room 8: authored `corruption` events.
- Autopilot step `{ edit: 'delete', at: seconds }` calls `sim.timelineEdits.apply` directly in headless mode.

- [ ] **Step 1: Add the Hunter to room 6**

Add to `room06.js`:

```js
hunter: {
  pos: [5.5, 5],
  patrol: [
    [5.5, 5],
    [5.5, -2.5],
    [1.5, -3.2],
    [-2.5, 2],
  ],
},
```

Move `s2` to `[-3, 0, 6]` and add two low metal blocks at `[2,0,1,6,1.1,2]` and `[2,0,-2,6,1.1,-1]`. These create a visible east-side decoy lane without introducing pathfinding.

The intended sequence is:

1. Cycle 1: sprint a noisy route down the east lane and finish at `(6,-2)`.
2. Cycle 2: while Echo 1 repeats that route and pulls the Hunter east, press `s2`, enter the west alcove, and record holding `pA`.
3. Cycle 3: Echo 2 repeats the alcove route. Its own `s2` press re-enables the alcove laser, shielding it from the Hunter. It holds `pA`, so `l1` opens; the player reaches the node.

- [ ] **Step 2: Give room 7 one Delete and one Restart edit**

Add:

```js
edits: { delete: 1, restart: 1 },
```

Add a breaker switch `routeBreaker` at `[0, 0, 7]`, and change the outside timed button to a 2.4 s duration:

```js
{ type: 'switch', id: 'routeBreaker', mode: 'breaker', pos: [0, 0, 7] },
{ type: 'button', id: 'tb1', pos: [7.5, 0, -3], duration: 2.4 },
```

Change `td2.opensWhen` to:

```js
opensWhen: all([any(['tb1', 'tb2']), 'routeBreaker'])
```

Update imports to include `all`.

The intended sequence:

1. Echo 1 holds `pA`.
2. Echo 2 holds `pB`.
3. In cycle 3, the player starts by toggling `routeBreaker`, then takes a 2 s detour around the east wall, presses `tb1`, and enters the alcove onto `pC`.
4. When Echo 3 spawns, open the editor before it reaches the detour and Delete the 2 s section starting at `1.0 s`. Echo 3 reaches `tb1` early enough for the 2.4 s door.
5. Exit with `tb2`; all three plates are held.

The section must align with the recorded waypoints. Use a 2 s wait/detour in `solutions.js` beginning exactly 1.0 s into cycle 3, so deleting `[1 s, 3 s]` removes it.

- [ ] **Step 3: Add authored corruption to room 8**

Add:

```js
corruption: [
  { cycle: 2, at: 18.5, echo: 1, type: 'stare' },
  { cycle: 5, at: 72.0, echo: 4, type: 'repeat' },
],
```

Change `sw1` to `mode: 'breaker'`. The cycle-5 repeat trips it after its useful press; the solution uses Echo 5's later press and remains solvable.

- [ ] **Step 4: Add a headless timeline edit step**

In `Autopilot.run`:

```js
if (step.edit) {
  const echo = sim.timelineEdits.newestEcho();
  if (!echo) return this.fail('no Echo to edit'), null;
  const result = sim.timelineEdits.apply(echo, step.edit, Math.round(step.at * TICK_RATE));
  if (!result.ok) this.fail(`edit failed: ${result.reason}`);
  return null;
}
```

- [ ] **Step 5: Rewrite room 6 and 7 scripted solutions**

Replace only solution indexes 5 and 6 in `src/debug/solutions.js`.

Room 6:

```js
[
  { goto: [5.5, 5] },
  { goto: [5.5, -2], sprint: true },
  { waitRoom: 15.05 },
  { goto: [-2.2, 6.4] },
  { interact: 's2' },
  { goto: [-4.5, 5.8] },
  { jumpOver: [-4.5, 0.5], at: 1.5 },
  { goto: [-5, -2.5] },
  { goto: [-8, -2.5], sprint: false },
  { waitRoom: 30.05 },
  { goto: [0, -3.5] },
  { until: (sim, room) => !room.byId.l1.active },
  { goto: [0, -6] },
  { goto: [1.9, -6.4] },
  { interact: 'core' },
  { exit: true },
]
```

Room 7:

```js
[
  { goto: [-9, 4] },
  { waitRoom: 15.05 },
  { goto: [9, 4] },
  { waitRoom: 30.05 },
  { goto: [0, 5.8] },
  { wait: 1.0 },
  { goto: [3.5, 5.8] },
  { wait: 1.0 },
  { interact: 'routeBreaker' },
  { goto: [7.5, -1.8] },
  { interact: 'tb1' },
  { goto: [10.5, -2.8] },
  { goto: [10.2, -5.6] },
  { waitRoom: 45.05 },
  { edit: 'delete', at: 1.0 },
  { interact: 'tb2' },
  { goto: [10.5, -2.0] },
  { goto: [6, -2.0] },
  { goto: [0, -5.6] },
  { waitDoor: 'd1' },
  { goto: [0, -8.3] },
  { goto: [-2.6, -8.4] },
  { interact: 'core' },
  { exit: true },
]
```

If the first headless run shows the 2 s section doesn't align with the detour, adjust the two `wait: 1.0` steps together, not the global edit length.

- [ ] **Step 6: Prove the mechanics are required**

Append to `tests/solutions.test.js`:

```js
it('room 6: without a noisy decoy the Hunter consumes the plate Echo', () => {
  const sim = new Simulation();
  sim.roomManager.begin(5);
  const collapse = [];
  sim.bus.on('echo:collapse', (event) => collapse.push(event.reason));
  runSteps(sim, SOLUTIONS[5].slice(3), 60 * 60);
  expect(collapse).toContain('hunted');
  expect(sim.rooms[5].complete).toBe(false);
});

it('room 7: without Delete, Echo 3 misses the short alcove door', () => {
  const sim = new Simulation();
  sim.roomManager.begin(6);
  const noDelete = SOLUTIONS[6].filter((step) => step.edit !== 'delete');
  runSteps(sim, noDelete, 60 * 90);
  expect(sim.rooms[6].complete).toBe(false);
});
```

- [ ] **Step 7: Run room solutions, then the full suite**

```powershell
npx vitest run tests/solutions.test.js tests/hunter.test.js tests/timeline.test.js tests/corruption.test.js
npx vitest run
```

Expected: rooms 6-8 and the full game solve; the two negative checks fail to solve as intended.

- [ ] **Step 8: Commit**

```powershell
git add src/rooms/room06.js src/rooms/room07.js src/rooms/room08.js src/debug/Autopilot.js src/debug/solutions.js tests/solutions.test.js
git commit -m "feat: retrofit Hunter timeline and corruption rooms"
```

### Task 9: Documentation and End-to-End Verification

**Files:**
- Modify: `README.md`
- Verify: all changed files

- [ ] **Step 1: Document the features and controls**

Update the control table in `README.md`:

```markdown
| T | Edit the newest Echo's timeline (rooms that allow it) |
| A / D | Move the timeline cursor while editing |
| 1-4 / Enter | Select and apply a timeline edit |
```

Add:

```markdown
## Phase 2 mechanics

- **Echo Hunter (room 6):** a slow sentinel that hunts moving Echoes. Sprinting, jumping and retracing an older Echo's route make a recording louder. A still or frozen Echo is silent. The Hunter can destroy Echoes and resets the room if it catches you.
- **Timeline editing (room 7):** press T to pause and edit the newest Echo. Delete skips 2 seconds, Freeze holds it for 2 seconds, Reverse runs a 2-second section backward, and Restart jumps back to the selected timestamp. Rooms limit which edits exist and how many times they can be used.
- **Echo corruption (room 8):** rare authored and deterministic Paradox-driven visual glitches. Some authored glitches can briefly pause an Echo or repeat a press; random glitches never change puzzle outcomes.
```

Document room config forms:

```js
hunter: { pos: [5.5, 5], patrol: [[5.5, 5], [5.5, -2.5]] },
edits: { delete: 1, freeze: 0, reverse: 0, restart: 1 },
corruption: [{ cycle: 2, at: 18.5, echo: 1, type: 'stare' }],
```

- [ ] **Step 2: Run the complete verification**

```powershell
npx vitest run
npx vite build
```

Expected:

- Every test file passes.
- Production build succeeds.
- No new test is skipped.

- [ ] **Step 3: Browser-check room 6**

Run:

```powershell
npm run dev
```

Open `http://localhost:5173/?debug=1`, then:

```js
__echoDebug.solve(6)
```

Verify:

- Hunter patrols and its scan cone sweeps.
- The noisy Echo draws it to the east lane.
- The Hunter cannot cross active lasers.
- The plate Echo survives inside the reactivated alcove laser.
- Contact with the player resets the room.
- Draw calls and FPS remain in the same range as before phase 2.

- [ ] **Step 4: Browser-check room 7**

```js
__echoDebug.goto(7)
```

Play or spawn the third Echo, press T, and verify:

- Fixed-loop simulation pauses.
- A/D moves the cursor in 0.5 s increments.
- Event markers and preview ghost move correctly.
- Delete consumes its one use, raises Paradox by 5, and closes the editor cleanly.
- Pointer lock resumes.

- [ ] **Step 5: Browser-check room 8 corruption**

```js
__echoDebug.solve(8)
```

Verify the authored stare and repeat events produce:

- Echo shader slicing and colour split.
- A 0.3 s screen distortion.
- Crackle audio.
- Nearby light flicker.
- No broken final-room solution or ending.

- [ ] **Step 6: Final repository review**

```powershell
git status --short
git diff --check
```

Expected: no whitespace errors; only intended uncommitted files, or a clean tree if every task commit was made.

- [ ] **Step 7: Commit**

```powershell
git add README.md
git commit -m "docs: explain Hunter timeline and corruption mechanics"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1-2 implement all four timeline edits and their event rules; Tasks 3-4 implement noise, resonance, patrol, barriers and catches; Task 5 implements authored and seeded random corruption; Tasks 6-7 cover UI, rendering and audio; Task 8 makes the mechanics necessary in rooms 6-8; Task 9 verifies and documents them.
- **Isolation:** simulation modules never import Three.js or the DOM. The editor pauses through `Game`; Hunter rendering and audio remain event/view adapters.
- **Type consistency:** `TimelineMap`, `TimelineEdits`, `Hunter`, `Resonance`, and `Corruption` signatures are defined before use.
- **Scope:** phase 3 story, the Impossible Event, the replacement ending and phase 4 polish are intentionally excluded.
