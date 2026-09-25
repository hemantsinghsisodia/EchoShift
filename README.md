# ECHO SHIFT

A first-person puzzle game built with Three.js. Everything you do is recorded, and every 15 seconds an **Echo** of you appears and repeats those exact actions. Cooperate with your past selves to get through 8 laboratory rooms and escape.

No backend and no external assets: the geometry, textures, shaders, music and sound effects are all generated in code.

## Requirements

- Node.js 18 or newer (tested on Node 26)
- A modern desktop browser with WebGL2 (Chrome, Edge, Firefox)

## Install, run, build

```powershell
npm install        # installs three, vite, vitest
npm run dev        # dev server at http://localhost:5173
npm test           # run the Vitest suite (headless simulation tests)
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

In Windows PowerShell 5.1, chain commands with `;` instead of `&&` (for example `npm install; npm run dev`).

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click the game to capture the mouse) |
| Shift | Sprint |
| Space | Jump |
| E (or left click) | Interact |
| R | Restart the current room |
| Esc | Pause |

## How the Echo works

- The game records your position, view direction, movement state and every button press at 30 samples per second.
- When the 15 s cycle ends, an Echo spawns where you stood when that cycle began. It replays the cycle with interpolated movement and fires your button presses on the exact same tick.
- When the replay ends, the Echo **holds its final position**, so it keeps plates pressed for you.
- Each room has an Echo limit. When a new Echo would go over the limit, the oldest one dissolves.
- Echoes can't be hurt by lasers, but a door closing on one collapses it (a paradox).
- Colours: blue means inactive, green activated, red dangerous and white is the objective. Glowing floor lines show which plate or switch powers which door.

## Project structure

```
src/
  main.js                 entry point
  core/                   Game (state machine), Simulation (headless 60 Hz), FixedLoop, Input, EventBus, Stats, config
  physics/                AABB collision (circle vs box, ground/ceiling probes), PhysicsWorld
  player/                 Player controller, interaction targeting
  echo/                   EchoRecorder, EchoTrack (interpolation), Echo (replay), EchoManager, EchoView + EchoMaterial (hologram shader)
  puzzle/                 Logic expressions (all/any/not/count/sync/latch), Puzzle, Room, RoomManager, LabLayout
  objects/                PressurePlate, Switch, TimedButton, Door, MovingPlatform, Laser, EnergyNode, Trigger
  rooms/                  room01..room08 + escape chamber (declarative configs) and helpers
  render/                 Renderer (bloom), SceneView, RoomBuilder (instanced geometry), ObjectViews, LightRig, LightCones, Particles, CameraShake, EndingFX
  audio/                  AudioManager, MusicSequencer, Synth (procedural Web Audio)
  ui/                     UI (menus, HUD), Settings (localStorage), Tutorial
  debug/                  Autopilot, scripted solutions, DebugHooks
tests/                    Vitest suites
```

The simulation never imports Three.js. Rendering, audio and UI subscribe to simulation events, so the game logic runs identically in Node, which is how the tests play through every room.

### Adding a room

1. Create `src/rooms/roomNN.js` exporting a config: size, `entranceX`/`exitX`, walls built with `wallX`/`wallZ`/`block`, objects, and logic such as `opensWhen: all(['plateA', 'plateB'])`.
2. Insert it into `ROOM_CONFIGS` in `src/rooms/index.js`. The layout, corridor, exit door, entry trigger and visuals are generated automatically.
3. Optionally add a scripted solution to `src/debug/solutions.js` so the tests prove the room can be solved.

## Tests

`npm test` covers collision, movement, echo recording, echo replay (interpolation, yaw wrap-around, exactly-once events), interaction replay, paradox collapse, logic (including `sync` window edges), puzzle objects, room reset and death, room transitions and the ending. It also runs a **headless playthrough of every room** using the scripted solutions, checks that rooms 1, 3 and 4 can't be solved alone, and plays the whole game from start to escape.

## Debug hooks

On the dev server, or on any build with `?debug=1` in the URL, `window.__echoDebug` is available in the browser console:

- `goto(n)` jumps to room n.
- `skip()` skips the current room.
- `solve(n)` watches the scripted solution play live.
- `reset()` restarts the current room.
- `state()` returns a snapshot of the game state.
- `timeScale(x)` speeds up or slows down the simulation.
- `god(true)` makes lasers harmless.
- `spawnEcho()` ends the current cycle immediately.

`?debug=1` also shows an FPS and draw-call overlay.
