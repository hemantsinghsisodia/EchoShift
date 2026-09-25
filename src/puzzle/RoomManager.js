/**
 * Room flow: entering rooms, restarting the current room, completion and the final escape.
 * Operates on the Simulation that owns it.
 */
export class RoomManager {
  constructor(sim) {
    this.sim = sim;
    this.currentIndex = 0;
  }

  get current() {
    return this.sim.rooms[this.currentIndex];
  }

  get next() {
    return this.sim.rooms[this.currentIndex + 1] ?? null;
  }

  /** Put the player at the start of a room (used for new games and debug jumps). */
  begin(index) {
    const sim = this.sim;
    for (let i = 0; i < sim.rooms.length; i++) {
      const room = sim.rooms[i];
      if (room.exitDoor) {
        room.exitDoor.locked = i < index;
        if (i < index) room.exitDoor.openAmount = 0;
      }
      room.reset();
    }
    this.currentIndex = index;
    const room = this.current;
    sim.player.teleport(room.spawn.x, room.spawn.y, room.spawn.z, room.spawn.yaw);
    this.startRoom(room);
    sim.bus.emit('room:enter', { room, index, teleport: true });
  }

  /** Transition triggered by walking into the next room's entry volume. */
  enter(index) {
    const sim = this.sim;
    const prev = this.current;
    if (prev.exitDoor) prev.exitDoor.lock();
    this.currentIndex = index;
    const room = this.current;
    room.reset();
    this.startRoom(room);
    sim.bus.emit('room:enter', { room, index, teleport: false });
  }

  startRoom(room) {
    const sim = this.sim;
    sim.echoes.clear();
    sim.abilities?.reset();
    sim.cycleTick = 0;
    if (room.kind === 'puzzle') sim.recorder.start(sim.player);
    else sim.recorder.stop();
  }

  restart(reason = 'manual') {
    const sim = this.sim;
    const room = this.current;
    if (room.kind !== 'puzzle' || sim.state === 'ending' || sim.state === 'escaped') return false;
    room.reset();
    sim.player.teleport(room.spawn.x, room.spawn.y, room.spawn.z, room.spawn.yaw);
    this.startRoom(room);
    sim.stats.restarts++;
    sim.state = 'playing';
    sim.bus.emit('room:reset', { room, reason });
    return true;
  }

  complete(room) {
    const sim = this.sim;
    if (room.complete) return;
    room.complete = true;
    sim.stats.completedRooms.add(room.index);
    sim.recorder.stop();
    sim.cycleTick = 0;
    sim.bus.emit('room:complete', { room, final: !!room.cfg.final });
    if (room.cfg.final) sim.startEnding();
  }

  checkTriggers() {
    const sim = this.sim;
    const next = this.next;
    const p = sim.player.pos;
    if (next && this.current.complete && next.entryTrigger.contains(p)) this.enter(this.currentIndex + 1);
    const room = this.current;
    if (room.escapeTrigger && sim.state === 'ending' && room.escapeTrigger.contains(p)) sim.escape();
  }
}
