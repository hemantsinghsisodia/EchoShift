import { TICK_RATE } from './config.js';

export class Stats {
  constructor() {
    this.reset();
  }

  reset() {
    this.ticks = 0;
    this.echoesCreated = 0;
    this.restarts = 0;
    this.completedRooms = new Set();
  }

  get totalSeconds() {
    return this.ticks / TICK_RATE;
  }

  get roomsCompleted() {
    return this.completedRooms.size;
  }

  static formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds * 100) % 100);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }
}
