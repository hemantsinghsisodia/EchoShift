import { midiToHz, tone } from './Synth.js';

const LOOKAHEAD = 0.12;
const INTERVAL_MS = 25;

// A minor ambient progression: Am - F - C - G (MIDI roots with voicings).
const CHORDS = [
  [45, 57, 60, 64],
  [41, 57, 60, 65],
  [48, 55, 60, 64],
  [43, 55, 59, 62],
];
const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79];

/**
 * Generative ambient score: detuned saw pads through a slowly breathing low-pass filter,
 * a delayed pentatonic arpeggio and a soft sub pulse. `intensity` (0..1) opens the filter
 * and thickens the arpeggio; 'alarm' mode swaps to a siren for the ending.
 */
export class MusicSequencer {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.running = false;
    this.intensity = 0.2;
    this.mode = 'ambient';
    this.bpm = 92;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 700;
    this.padFilter.Q.value = 2;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.5;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(out);
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.07;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 350;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.padFilter.frequency);
    this.lfo.start();

    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = (60 / this.bpm) * 0.75;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.42;
    this.delayFilter = ctx.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 2400;
    this.arpBus = ctx.createGain();
    this.arpBus.gain.value = 0.55;
    this.arpBus.connect(out);
    this.arpBus.connect(this.delay);
    this.delay.connect(this.delayFilter);
    this.delayFilter.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delayFilter.connect(out);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), INTERVAL_MS);
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  setMode(mode) {
    this.mode = mode;
  }

  schedule() {
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      const sixteenth = 60 / this.bpm / 4;
      this.nextTime += sixteenth;
      this.step++;
    }
    const target = this.mode === 'alarm' ? 420 : 500 + this.intensity * 1100;
    this.padFilter.frequency.setTargetAtTime(target, ctx.currentTime, 2);
  }

  playStep(step, t) {
    const ctx = this.ctx;
    const barLen = 16;
    const bar = Math.floor(step / barLen);
    const inBar = step % barLen;
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const beat = 60 / this.bpm;

    if (step % (barLen * 2) === 0) {
      for (const n of chord) {
        for (const det of [-9, 0, 8]) {
          tone(ctx, this.padFilter, t, { type: 'sawtooth', freq: midiToHz(n), detune: det, attack: 2.2, hold: beat * 8 - 2.2, release: 2.6, peak: 0.028 });
        }
      }
    }

    if (inBar % 4 === 0) {
      const root = midiToHz(chord[0] - 12);
      tone(ctx, this.out, t, { type: 'sine', freq: root, attack: 0.01, release: beat * 0.9, peak: this.mode === 'alarm' ? 0.2 : 0.09 + this.intensity * 0.06 });
    }

    if (this.mode === 'alarm') {
      if (inBar === 0 || inBar === 8) {
        tone(ctx, this.arpBus, t, { type: 'square', freq: 620, freqEnd: 820, attack: 0.02, hold: beat * 1.6, release: 0.2, peak: 0.05, sweep: beat * 1.8 });
      }
      return;
    }

    const density = 0.18 + this.intensity * 0.55;
    const pattern = [1, 0, 0.6, 0, 0.9, 0, 0.5, 0.3, 1, 0, 0.6, 0, 0.8, 0.2, 0.5, 0];
    if (Math.random() < pattern[inBar] * density) {
      const note = PENTA[(inBar * 3 + bar * 5 + Math.floor(Math.random() * 3)) % PENTA.length];
      tone(ctx, this.arpBus, t, { type: 'triangle', freq: midiToHz(note), attack: 0.004, release: 0.35, peak: 0.07 });
      if (this.intensity > 0.5 && Math.random() < 0.3) tone(ctx, this.arpBus, t, { type: 'square', freq: midiToHz(note + 12), attack: 0.004, release: 0.12, peak: 0.015 });
    }
  }
}
