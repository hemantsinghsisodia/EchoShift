# Echo Hunter, Timeline Editing and Corruption - Phase 2 Design

Approved 2026-09-25. Builds on phase 1 (Swap, Freeze, Furnace, Paradox). Phases 3 (room redesign, story, Impossible Event, new ending) and 4 (polish) come later.

## Goal

Move the player's question from "how can I change what my Echo will do?" toward "can I trust what my Echo is doing?":

- The **Hunter** turns recordings into bait and liabilities.
- **Timeline editing** lets the player rewrite an Echo's future directly.
- **Corruption** quietly suggests the system has a will of its own.

## Echo Hunter

- **Entity:** one simulation entity per room that has one. It moves at 2.2 m/s (slower than walking) with the same wall-sliding collision as the player (radius 0.45).
- **Movement:**
  - It patrols a loop of authored points in the room config: `hunter: { patrol: [[x,z], ...] }`.
  - When chasing, it steers straight at its target.
  - If it makes no progress for 1.5 s, or loses its target for 3 s, it returns to the nearest patrol point.
- **Noise (evaluated every tick):**

  | Source | Noise | Notes |
  | --- | --- | --- |
  | Walking Echo | 1.0 | |
  | Sprinting Echo | 1.6 | |
  | Jumping Echo | +0.8 | added on the jump |
  | Holding or frozen Echo | 0 | silent |
  | Resonance | +0.8 | the Echo stands where an older Echo in this room already walked (within 0.8 m) |

  Resonance uses a coarse 1 m grid of visited cells, filled in when each Echo spawns from its track.
- **Hearing:**
  - An Echo is heard within `12 m × noise`.
  - The player is heard only within 3 m, or 8 m while sprinting.
  - The loudest target wins. A tie goes to the closer one.
  - Once locked on, the Hunter keeps a target for at least 1 s so it doesn't flip between targets.
- **Barriers:** active lasers and blocking doors act as walls for the Hunter. Glass also blocks it.
- **Catching:**
  - Touching an Echo destroys it (collapse reason `hunted`, +5 Paradox).
  - Touching the player kills them (reason `hunter`), which resets the room like a laser.
  - Room reset puts the Hunter back at its first patrol point.
- **Visuals and audio:**
  - Visuals: a low-poly red sentinel (octahedron body, orbiting shards), a sweeping scan cone, and an eye that turns white when it locks on.
  - Audio: a positional low hum, an alert sting when it locks on, and a strike sound.

## Timeline editing

- **Opening it:** press T in a room whose config has `edits`. The simulation pauses (no ticks) and the editor targets the newest live Echo.
- **The editor UI:**
  - A 15 s bar with markers for presses, jumps and swaps.
  - A cursor moved by A/D in 0.5 s steps.
  - A ghost preview of the Echo at the cursor time.
  - Operation keys 1–4 (only those the room allows, each showing its remaining uses).
  - Enter applies an edit, and T or Esc closes the editor.
- **Operations:** each "section" is 2 s starting at the cursor, `[c, c + 2 s]`. They are implemented as a piecewise time map from replay time to track time, stored on the Echo. The track itself is never changed.

  | Edit | Effect | Presses inside the affected time |
  | --- | --- | --- |
  | Delete | Replay jumps from `c` to `c + 2 s`, so the Echo arrives 2 s earlier. | Dropped |
  | Freeze | Replay holds `c` for 2 s, then continues, so everything later is delayed 2 s. | Delayed |
  | Reverse | Track time runs from `c + 2 s` back to `c`, then continues from `c + 2 s`. | Do not fire |
  | Restart | Replay jumps back to `c` and replays from there. | Presses after `c` fire again |

- **Edits already in progress:**
  - An edit can only affect replay time that hasn't happened yet.
  - A cursor earlier than the Echo's current replay time is clamped for Delete, Freeze and Reverse. Restart is the exception: it may point into the past.
- **Limits and cost:**
  - Rooms set their uses: `edits: { delete: 1, freeze: 1, reverse: 0, restart: 1 }`.
  - Each edit adds Paradox: Delete +5, Freeze +3, Reverse +6, Restart +6.
- **Events:** interaction events are fired by track time. The time map exposes which track-time intervals were played forwards, so a press fires exactly when its track tick is crossed forwards, and never during a reversed or skipped interval. Restart rewinds the event cursor.

## Echo corruption

- **Authored glitches:**
  - Room config: `corruption: [{ cycle, at, echo, type, ... }]`. `echo` is the Echo's number, and `at` is seconds into that cycle.
  - Types:
    - `stare`: the Echo turns toward the player for 1.5 s. This changes facing only.
    - `pause`: it stops replaying for 0.5 s (like a short freeze).
    - `repeat`: it re-fires its most recent press.
    - `early`: its next spawn arrives 1 s into its track.
  - These can affect the simulation. They are only placed where the intended solution still works.
- **Random glitches:**
  - A seeded PRNG (seed = room id + cycle index + run seed) rolls once per cycle, per Echo.
  - Chance: `2% + Paradox × 0.3%`.
  - Types: `jitter`, `flicker`, `stare` and `ghostPause`. `ghostPause` shows the Echo pausing on screen while the simulation keeps replaying.
  - They change nothing in the game logic beyond facing, so they can never break a puzzle.
- **Cues:** a 0.3 s screen distortion (a CSS or post-processing pass), a burst of audio crackle, the nearest room lights flickering, and `uCorrupt` in the Echo shader (colour split and slicing).
- **No explanation:** corruption is never mentioned in the HUD or the hints.

## Room changes (light retrofits)

| Room | Mechanic | Concept |
| --- | --- | --- |
| 6 CROSSFIRE | Hunter | The Hunter patrols the hub. The plate-holding Echo must reach the alcove while a noisy decoy Echo pulls the Hunter away. Once inside, the alcove laser (re-enabled by the Echo's own repeated switch press) shields it. |
| 7 TRIAD | Timeline | `edits: { delete: 1, restart: 1 }`. The alcove-plate Echo's recording includes a long detour to press a switch that an earlier Echo now handles. Deleting that section makes it arrive before the timed door closes. |
| 8 REACTOR CORE | Corruption | Two authored glitches (a stare in cycle 2, a repeated press in cycle 5) that don't break the solution, plus random glitches driven by Paradox. |

Exact layouts are tuned with headless solutions, plus checks proving the Hunter or timeline edit is actually required.

## Testing

- **Hunter:**
  - Targets the loudest Echo; resonance boosts noise; still Echoes are ignored.
  - Hears the player only within range.
  - Blocked by lasers and doors.
  - Catching an Echo gives `hunted` and Paradox; catching the player gives death and reset.
- **Timeline:** for each operation, check exact positions against time and exactly which events fire, including the clamping rules and limits.
- **Corruption:** fixed seed gives the same glitch sequence; random glitches don't change any puzzle signal; authored glitches fire at their scheduled tick.
- **Solutions:** rooms 6–8 are re-solved headlessly, and the full-game run still passes.
