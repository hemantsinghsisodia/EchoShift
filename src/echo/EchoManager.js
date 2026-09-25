import { PARADOX_TICKS } from '../core/config.js';
import { capsuleOverlapsBox } from '../physics/Collision.js';
import { Echo } from './Echo.js';

/** Owns all live echoes: spawning with a per-room limit (oldest evicted first), updates and paradox checks. */
export class EchoManager {
  constructor(bus = null) {
    this.bus = bus;
    this.echoes = [];
    this.nextSerial = 1;
  }

  get live() {
    return this.echoes.filter((e) => e.isActivator);
  }

  get count() {
    let n = 0;
    for (const e of this.echoes) if (e.isActivator) n++;
    return n;
  }

  spawn(track, maxEchoes, platforms) {
    const live = this.live;
    let over = live.length + 1 - maxEchoes;
    for (let i = 0; i < live.length && over > 0; i++, over--) {
      live[i].collapse('evicted');
      this.bus?.emit('echo:collapse', { echo: live[i], reason: 'evicted' });
    }
    const echo = new Echo(track, this.nextSerial++, platforms);
    this.echoes.push(echo);
    this.bus?.emit('echo:spawn', { echo });
    return echo;
  }

  /** ctx: { platforms, doors (array of Door), onEvent, onStep } */
  update(ctx) {
    for (const echo of this.echoes) {
      echo.update(ctx);
      if (!echo.isActivator) continue;
      let overlapping = false;
      for (const door of ctx.doors) {
        if (!door.blocking) continue;
        if (capsuleOverlapsBox(echo.pos, echo.radius, echo.height, door.box)) {
          overlapping = true;
          break;
        }
      }
      echo.overlapTicks = overlapping ? echo.overlapTicks + 1 : 0;
      if (echo.overlapTicks > PARADOX_TICKS) {
        echo.collapse('paradox');
        this.bus?.emit('echo:collapse', { echo, reason: 'paradox' });
      }
    }
    if (this.echoes.some((e) => e.dead)) this.echoes = this.echoes.filter((e) => !e.dead);
  }

  clear() {
    for (const e of this.echoes) if (e.isActivator) this.bus?.emit('echo:collapse', { echo: e, reason: 'cleared', silent: true });
    this.echoes = [];
    this.nextSerial = 1;
  }
}
