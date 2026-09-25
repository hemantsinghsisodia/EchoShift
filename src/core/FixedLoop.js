import { DT } from './config.js';

const MAX_STEPS_PER_FRAME = 8;

/**
 * Fixed-timestep loop: simulation steps at exactly 60 Hz regardless of display rate,
 * rendering receives an interpolation alpha between the last two sim states.
 */
export class FixedLoop {
  constructor({ step, render }) {
    this.step = step;
    this.render = render;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.simulating = false;
    this.timeScale = 1;
    this.frame = this.frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (this.simulating) {
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME) {
        this.step();
        this.acc -= DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    }
    this.render(this.simulating ? this.acc / DT : 1, dt);
    requestAnimationFrame(this.frame);
  }
}
