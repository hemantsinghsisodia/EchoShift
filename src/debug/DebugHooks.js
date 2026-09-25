import { Autopilot } from './Autopilot.js';
import { SOLUTIONS } from './solutions.js';

/**
 * window.__echoDebug - developer console helpers (dev server or ?debug=1).
 *   goto(n)       jump to room n (1-8)
 *   skip()        complete the current room and walk-free jump to the next
 *   solve(n?)     play the scripted solution for room n (default: current) live
 *   reset()       restart the current room
 *   state()       snapshot of useful simulation state
 *   timeScale(x)  speed up / slow down the simulation
 *   god(on)       ignore lasers
 *   spawnEcho()   end the current echo cycle immediately
 */
export function attachDebugHooks(game) {
  const sim = game.sim;
  const ensurePlaying = () => {
    if (game.state === 'menu') game.startGame(false);
    else if (game.state !== 'playing') game.setPlaying();
  };
  const api = {
    game,
    sim,
    goto(n) {
      ensurePlaying();
      game.autopilot = null;
      sim.roomManager.begin(Math.max(0, Math.min(sim.rooms.length - 1, n - 1)));
      game.input.setLook(sim.player.yaw, 0);
      return api.state();
    },
    skip() {
      const i = sim.room.index;
      if (sim.room.kind === 'puzzle') sim.stats.completedRooms.add(i);
      return api.goto(i + 2);
    },
    solve(n) {
      const idx = (n ?? sim.room.index + 1) - 1;
      api.goto(idx + 1);
      game.autopilot = new Autopilot(sim, SOLUTIONS[idx], { label: `room${idx + 1}` });
      return `solving room ${idx + 1}`;
    },
    reset() {
      return sim.restartRoom();
    },
    state() {
      const r = sim.room;
      return {
        room: r.index + 1,
        name: r.cfg.name,
        clock: +(r.clock / 60).toFixed(2),
        cycleRemaining: +sim.cycleRemaining.toFixed(2),
        echoes: sim.echoes.echoes.map((e) => ({ id: e.id, state: e.state, pos: [e.pos.x, e.pos.y, e.pos.z].map((v) => +v.toFixed(2)) })),
        player: [sim.player.pos.x, sim.player.pos.y, sim.player.pos.z].map((v) => +v.toFixed(2)),
        complete: r.complete,
        simState: sim.state,
        gameState: game.state,
        stats: sim.summary(),
      };
    },
    timeScale(x) {
      game.loop.timeScale = x;
      return x;
    },
    god(on = true) {
      sim.godMode = !!on;
      return sim.godMode;
    },
    spawnEcho() {
      if (!sim.recorder.active) return false;
      const track = sim.recorder.finish(sim.cycleTick, sim.player);
      sim.echoes.spawn(track, sim.room.maxEchoes, sim.room.platforms);
      sim.stats.echoesCreated++;
      sim.recorder.start(sim.player);
      sim.cycleTick = 0;
      return true;
    },
  };
  window.__echoDebug = api;
  return api;
}
