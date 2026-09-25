import { createNoiseBuffer, createImpulse, createDistortion, tone, noise, fm } from './Synth.js';
import { MusicSequencer } from './MusicSequencer.js';

/**
 * Fully procedural audio (no files). Buses: sfx + music -> master -> compressor -> out,
 * with a shared reverb send. Positional sounds use distance attenuation + stereo panning.
 */
export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = createImpulse(ctx);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    this.sfx.connect(this.reverbSend);
    this.music.connect(this.reverbSend);
    this.noiseBuf = createNoiseBuffer(ctx, 2);
    this.dist = createDistortion(ctx, 60);
    this.distOut = ctx.createGain();
    this.distOut.gain.value = 0.5;
    this.dist.connect(this.distOut);
    this.distOut.connect(this.sfx);
    this.seq = new MusicSequencer(ctx, this.music);
    this.applyVolumes();
  }

  resume() {
    this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.master, t, 0.05);
    this.music.gain.setTargetAtTime(this.settings.music * 0.8, t, 0.05);
  }

  startMusic() {
    this.init();
    this.seq?.start();
  }

  setMusicIntensity(v) {
    this.seq?.setIntensity(v);
  }

  setMusicMode(mode) {
    this.seq?.setMode(mode);
  }

  setListener(pos, yaw) {
    this.listener.x = pos.x;
    this.listener.y = pos.y;
    this.listener.z = pos.z;
    this.listener.yaw = yaw;
  }

  /** Output node for a sound at a world position (null pos = non-positional). */
  out(pos, gain = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let vol = gain;
    let pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x;
      const dz = pos.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      vol *= 1 / (1 + d * d * 0.02);
      if (d > 0.3) {
        const rx = Math.cos(this.listener.yaw);
        const rz = -Math.sin(this.listener.yaw);
        pan = Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / d) * 0.8));
      }
    }
    g.gain.value = vol;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfx);
    } else {
      g.connect(this.sfx);
    }
    setTimeout(() => g.disconnect(), 4000);
    return g;
  }

  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const fn = SOUNDS[name];
    if (!fn) return;
    try {
      fn(this, this.ctx, this.ctx.currentTime + 0.005, opts);
    } catch (err) {
      console.warn(`sound '${name}' failed`, err);
    }
  }
}

const SOUNDS = {
  step(a, ctx, t, { pos, echo, sprint }) {
    const o = a.out(echo ? pos : null, echo ? 0.45 : 0.55);
    noise(ctx, o, a.noiseBuf, t, { filter: echo ? 'lowpass' : 'bandpass', freq: echo ? 900 : 1700 + Math.random() * 400, freqEnd: 700, q: 1.2, release: sprint ? 0.06 : 0.08, peak: 0.25 });
    tone(ctx, o, t, { freq: 95, freqEnd: 45, release: 0.07, peak: 0.25 });
  },
  jump(a, ctx, t, { pos, echo }) {
    const o = a.out(echo ? pos : null, echo ? 0.35 : 0.5);
    noise(ctx, o, a.noiseBuf, t, { filter: 'highpass', freq: 800, freqEnd: 3000, release: 0.12, peak: 0.12 });
    tone(ctx, o, t, { freq: 180, freqEnd: 360, release: 0.1, peak: 0.08 });
  },
  land(a, ctx, t, { impact = 6 }) {
    const o = a.out(null, Math.min(1, impact / 10));
    tone(ctx, o, t, { freq: 120, freqEnd: 40, release: 0.14, peak: 0.4 });
    noise(ctx, o, a.noiseBuf, t, { filter: 'lowpass', freq: 900, release: 0.1, peak: 0.25 });
  },
  switch(a, ctx, t, { pos, echo }) {
    const o = a.out(pos, echo ? 0.8 : 1);
    tone(ctx, o, t, { type: 'sine', freq: 880, freqEnd: 1320, release: 0.12, peak: 0.25 });
    tone(ctx, o, t + 0.06, { type: 'triangle', freq: 1760, release: 0.15, peak: 0.08 });
    noise(ctx, o, a.noiseBuf, t, { filter: 'highpass', freq: 4000, release: 0.02, peak: 0.2 });
  },
  button(a, ctx, t, { pos, echo }) {
    const o = a.out(pos, echo ? 0.8 : 1);
    tone(ctx, o, t, { type: 'square', freq: 660, release: 0.06, peak: 0.07 });
    tone(ctx, o, t + 0.08, { type: 'square', freq: 990, release: 0.1, peak: 0.07 });
    noise(ctx, o, a.noiseBuf, t, { filter: 'highpass', freq: 3500, release: 0.02, peak: 0.2 });
  },
  buttonExpire(a, ctx, t, { pos }) {
    const o = a.out(pos, 0.8);
    tone(ctx, o, t, { type: 'triangle', freq: 520, freqEnd: 260, release: 0.25, peak: 0.12 });
  },
  plateOn(a, ctx, t, { pos }) {
    const o = a.out(pos, 1);
    tone(ctx, o, t, { freq: 190, freqEnd: 110, release: 0.18, peak: 0.35 });
    tone(ctx, o, t + 0.02, { type: 'triangle', freq: 440, freqEnd: 660, release: 0.2, peak: 0.08 });
  },
  plateOff(a, ctx, t, { pos }) {
    const o = a.out(pos, 0.7);
    tone(ctx, o, t, { type: 'triangle', freq: 400, freqEnd: 200, release: 0.2, peak: 0.08 });
  },
  doorOpen(a, ctx, t, { pos, heavy }) {
    const o = a.out(pos, heavy ? 1.2 : 0.9);
    noise(ctx, o, a.noiseBuf, t, { filter: 'bandpass', freq: 300, freqEnd: 1400, q: 2, attack: 0.05, hold: 0.25, release: 0.35, peak: 0.22, sweep: 0.6 });
    tone(ctx, o, t, { type: 'sawtooth', freq: 55, freqEnd: 70, attack: 0.05, hold: 0.3, release: 0.4, peak: 0.08 });
    tone(ctx, o, t + 0.55, { freq: 90, freqEnd: 50, release: 0.15, peak: 0.25 });
  },
  doorClose(a, ctx, t, { pos }) {
    const o = a.out(pos, 0.9);
    noise(ctx, o, a.noiseBuf, t, { filter: 'bandpass', freq: 1300, freqEnd: 300, q: 2, attack: 0.03, hold: 0.1, release: 0.2, peak: 0.18, sweep: 0.3 });
    tone(ctx, o, t + 0.28, { freq: 110, freqEnd: 40, release: 0.18, peak: 0.35 });
  },
  echoSpawn(a, ctx, t, { pos }) {
    const o = a.out(pos, 1.2);
    fm(ctx, o, t, { carrier: 330, carrierEnd: 880, ratio: 1.5, index: 400, attack: 0.05, hold: 0.2, release: 0.8, peak: 0.12 });
    noise(ctx, o, a.noiseBuf, t, { filter: 'highpass', freq: 2000, freqEnd: 8000, attack: 0.2, release: 0.5, peak: 0.08 });
    tone(ctx, o, t + 0.25, { type: 'triangle', freq: 1318, release: 0.9, peak: 0.07 });
    tone(ctx, o, t + 0.35, { type: 'triangle', freq: 1976, release: 0.9, peak: 0.04 });
  },
  echoCollapse(a, ctx, t, { pos }) {
    const o = a.out(pos, 1);
    for (let i = 0; i < 6; i++) tone(ctx, o, t + i * 0.05, { type: 'square', freq: 300 - i * 40 + Math.random() * 80, release: 0.04, peak: 0.06 });
    noise(ctx, o, a.noiseBuf, t, { filter: 'bandpass', freq: 2500, freqEnd: 200, q: 4, release: 0.4, peak: 0.15 });
  },
  nodeActivate(a, ctx, t, { pos }) {
    const o = a.out(pos, 1);
    fm(ctx, o, t, { carrier: 220, carrierEnd: 440, ratio: 2, index: 300, attack: 0.02, hold: 0.1, release: 0.9, peak: 0.12 });
    [523, 659, 784].forEach((f, i) => tone(ctx, o, t + i * 0.07, { type: 'triangle', freq: f, release: 0.7, peak: 0.1 }));
  },
  complete(a, ctx, t) {
    const o = a.out(null, 1);
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(ctx, o, t + i * 0.09, { type: 'triangle', freq: f, attack: 0.01, hold: 0.1, release: 1.2, peak: 0.12 }));
    tone(ctx, o, t, { type: 'sawtooth', freq: 130.8, attack: 0.3, hold: 0.6, release: 1.4, peak: 0.04 });
  },
  death(a, ctx, t) {
    const o = a.out(null, 1);
    tone(ctx, a.dist, t, { type: 'sawtooth', freq: 440, freqEnd: 40, release: 0.8, peak: 0.5 });
    noise(ctx, o, a.noiseBuf, t, { filter: 'lowpass', freq: 3000, freqEnd: 200, release: 0.6, peak: 0.35 });
  },
  laserOff(a, ctx, t, { pos }) {
    const o = a.out(pos, 0.9);
    tone(ctx, o, t, { type: 'sawtooth', freq: 1200, freqEnd: 150, release: 0.3, peak: 0.07 });
  },
  laserOn(a, ctx, t, { pos }) {
    const o = a.out(pos, 0.9);
    tone(ctx, o, t, { type: 'sawtooth', freq: 150, freqEnd: 1200, release: 0.25, peak: 0.06 });
  },
  tick(a, ctx, t, { last }) {
    const o = a.out(null, 1);
    tone(ctx, o, t, { type: 'sine', freq: last ? 1500 : 1100, release: 0.05, peak: 0.12 });
  },
  restart(a, ctx, t) {
    const o = a.out(null, 1);
    tone(ctx, o, t, { type: 'sine', freq: 900, freqEnd: 200, release: 0.35, peak: 0.15 });
    noise(ctx, o, a.noiseBuf, t, { filter: 'bandpass', freq: 400, freqEnd: 3000, release: 0.3, peak: 0.1 });
  },
  powerDown(a, ctx, t) {
    const o = a.out(null, 1.2);
    tone(ctx, o, t, { type: 'sawtooth', freq: 220, freqEnd: 20, attack: 0.02, hold: 0.3, release: 1.8, peak: 0.12, sweep: 2 });
    tone(ctx, o, t, { type: 'sine', freq: 60, freqEnd: 25, attack: 0.02, hold: 0.5, release: 1.5, peak: 0.3, sweep: 2 });
    noise(ctx, o, a.noiseBuf, t + 0.1, { filter: 'lowpass', freq: 2000, freqEnd: 100, hold: 0.3, release: 1.4, peak: 0.1 });
  },
  escape(a, ctx, t) {
    const o = a.out(null, 1);
    [261.6, 329.6, 392, 523.3, 659.3, 784].forEach((f, i) => tone(ctx, o, t + i * 0.12, { type: 'triangle', freq: f, attack: 0.05, hold: 0.8, release: 2.5, peak: 0.07 }));
    noise(ctx, o, a.noiseBuf, t, { filter: 'highpass', freq: 3000, freqEnd: 9000, attack: 1, release: 2, peak: 0.05 });
  },
  swap(a, ctx, t) {
    const o = a.out(null, 1);
    fm(ctx, o, t, { carrier: 880, carrierEnd: 220, ratio: 1.41, index: 600, attack: 0.005, hold: 0.05, release: 0.35, peak: 0.12 });
    fm(ctx, o, t + 0.12, { carrier: 220, carrierEnd: 990, ratio: 2.01, index: 300, attack: 0.005, hold: 0.05, release: 0.4, peak: 0.1 });
    noise(ctx, o, a.noiseBuf, t, { filter: 'bandpass', freq: 600, freqEnd: 5000, q: 3, attack: 0.01, release: 0.35, peak: 0.14 });
  },
  freeze(a, ctx, t, { pos }) {
    const o = a.out(pos, 1.2);
    [1568, 2093, 2637, 3136].forEach((f, i) => tone(ctx, o, t + i * 0.03, { type: 'sine', freq: f, attack: 0.002, hold: 0.05, release: 0.9, peak: 0.05 }));
    noise(ctx, o, a.noiseBuf, t, { filter: 'highpass', freq: 5000, freqEnd: 9000, attack: 0.005, release: 0.4, peak: 0.1 });
    tone(ctx, o, t, { type: 'triangle', freq: 330, freqEnd: 110, release: 0.3, peak: 0.12 });
  },
  unfreeze(a, ctx, t, { pos }) {
    const o = a.out(pos, 1);
    noise(ctx, o, a.noiseBuf, t, { filter: 'bandpass', freq: 3000, freqEnd: 800, q: 2, release: 0.25, peak: 0.12 });
    tone(ctx, o, t, { type: 'sine', freq: 660, freqEnd: 990, release: 0.2, peak: 0.06 });
  },
  blocked(a, ctx, t) {
    const o = a.out(null, 0.8);
    tone(ctx, o, t, { type: 'square', freq: 140, release: 0.08, peak: 0.08 });
    tone(ctx, o, t + 0.1, { type: 'square', freq: 110, release: 0.12, peak: 0.08 });
  },
  sacrifice(a, ctx, t, { pos }) {
    const o = a.out(pos, 1.3);
    noise(ctx, o, a.noiseBuf, t, { filter: 'lowpass', freq: 400, freqEnd: 3000, attack: 0.05, hold: 0.4, release: 0.9, peak: 0.3, sweep: 0.6 });
    tone(ctx, a.dist, t, { type: 'sawtooth', freq: 220, freqEnd: 55, attack: 0.02, hold: 0.2, release: 0.8, peak: 0.25 });
    fm(ctx, o, t + 0.1, { carrier: 440, carrierEnd: 110, ratio: 3.3, index: 900, attack: 0.01, hold: 0.1, release: 0.8, peak: 0.08 });
  },
  furnaceLit(a, ctx, t, { pos }) {
    const o = a.out(pos, 1);
    [196, 247, 294, 392].forEach((f, i) => tone(ctx, o, t + 0.3 + i * 0.06, { type: 'triangle', freq: f, attack: 0.02, hold: 0.2, release: 1, peak: 0.08 }));
  },
  blink(a, ctx, t, { pos }) {
    const o = a.out(pos, 0.8);
    fm(ctx, o, t, { carrier: 660, carrierEnd: 330, ratio: 1.41, index: 300, attack: 0.005, release: 0.25, peak: 0.07 });
  },
  uiHover(a, ctx, t) {
    const o = a.out(null, 0.5);
    tone(ctx, o, t, { type: 'sine', freq: 1500, release: 0.03, peak: 0.05 });
  },
  uiClick(a, ctx, t) {
    const o = a.out(null, 0.7);
    tone(ctx, o, t, { type: 'triangle', freq: 900, freqEnd: 600, release: 0.08, peak: 0.12 });
  },
};
