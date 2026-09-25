# Echo Abilities - Phase 1 Design

Approved 2026-09-25. Part of a four-phase enhancement of ECHO SHIFT:

1. Echo abilities and the Paradox core (this document).
2. Echo Hunter, timeline manipulation and Echo corruption.
3. Room redesign, environmental story, the Impossible Event puzzle and the new ending.
4. Visual and audio polish.

## Goal

Give the player ways to act on existing Echoes, not just record new ones. The central question shifts from "what should my Echo do?" toward "how can I change what my Echo will do?". Each ability is introduced in its own room and required by that room's puzzle.

## Rules

### Echo Swap (Q)

- Targets the Echo in the crosshair within 10 m.
- Line of sight is blocked by walls and by doors that are currently blocking. Lasers and glass do not block it.
- Blocked if the player's destination (the Echo's position) is inside an active laser, has no floor under it, or is inside a solid box. The HUD shows the reason.
- 3 s cooldown.
- The Echo moves to the player's old position. Its whole remaining path shifts by the same vector, so its later movement and button presses happen offset from where they were recorded. A shifted press only works if its recorded target is still within reach.
- The swap is written into the player's current recording as a blink. The resulting future Echo teleports at that moment instead of sliding, and it does not swap with anything itself.

### Echo Freeze (F)

- Targets the Echo in the crosshair within 12 m.
- For 5 s the Echo stops: it doesn't move, fires no recorded events, and keeps holding plates. Everything after that happens 5 s later than recorded.
- Only one Echo can be frozen at a time. 8 s cooldown.

### Echo Furnace (sacrifice device)

- A floor field. It is harmless to the player.
- Any live Echo that enters it collapses permanently, and the furnace latches on.
- A latched furnace can power doors and other logic like any other signal.

### Paradox meter

- One value for the whole run, from 0 to 100%. It never decreases, and restarting a room keeps it.
- Costs:

  | Event | Paradox |
  | --- | --- |
  | Swap | +4 |
  | Freeze | +3 |
  | Sacrifice | +5 |
  | An Echo collapsed by a door | +6 |

- Hidden until the first increase. After that the HUD shows `PARADOX: n%`, with no explanation.
- Only starting a new game resets it. Phase 2 and later phases attach effects to high values.

## Architecture

- Tracks stay immutable. Each Echo gets a small runtime modifier layer: `offset` (Swap) and `frozenTicks` (Freeze). Phase 2 timeline edits will reuse this layer.
- Everything stays inside the headless 60 Hz simulation, so it remains deterministic and testable in Node.
- New modules:
  - `EchoAbilities`: targeting, validation, cooldowns.
  - `Paradox`: the meter.
  - `EchoFurnace`: the sacrifice device.
  - A line-of-sight query in `PhysicsWorld`.
- Rooms opt in with `abilities: ['swap', 'freeze']`.
- Supporting features:
  - Glass boxes that block movement but not line of sight.
  - Pulsing lasers driven by the room clock. Their periods divide 15 s so that replays stay in phase.

## Room changes

| Room | Ability | Puzzle |
| --- | --- | --- |
| 3 THRESHOLD | Swap | A permanent laser grid guards the node. Record an Echo walking up to the grid. Swap with it from further along its route, which pushes the rest of its path through the laser (harmless to Echoes). Then swap into it. |
| 4 TIMED GATES | Freeze | The plate sits inside a pulsing laser field, so the Echo can only cross it briefly. A chain of gates driven by the plate is too long to clear in that moment. Freeze the Echo on the plate. Only 1 Echo is allowed. |
| 5 SHUTTLE | Sacrifice | The upper door needs the island plate held and the furnace lit. An Echo whose route crosses the furnace burns before reaching the plate, so the order and route of recordings matter. |

## Testing

- Unit tests:
  - Swap: path offset, blink frames, blocking by walls, closed doors and hazards, cooldown.
  - Freeze: exact 5 s delay of events, plate holding, the one-at-a-time limit, cooldown.
  - Furnace latching.
  - Paradox accumulation and persistence.
- Headless solutions for all rooms, plus solo checks proving Swap (room 3) and Freeze (room 4) are required.
