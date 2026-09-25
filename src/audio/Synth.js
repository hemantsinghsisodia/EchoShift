/** Small Web Audio building blocks used by the procedural sound effects and music. */

export function createNoiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function createImpulse(ctx, seconds = 2.2, decay = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function createDistortion(ctx, amount = 40) {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  ws.curve = curve;
  return ws;
}

/** Attack/decay gain envelope on a new GainNode connected to dest. */
export function envelope(ctx, dest, t, { attack = 0.005, hold = 0, release = 0.2, peak = 0.3 } = {}) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  g.connect(dest);
  return g;
}

/** Oscillator voice with optional pitch sweep. Returns end time. */
export function tone(ctx, dest, t, { type = 'sine', freq = 440, freqEnd = null, detune = 0, attack = 0.005, hold = 0, release = 0.2, peak = 0.3, sweep = null } = {}) {
  const env = envelope(ctx, dest, t, { attack, hold, release, peak });
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.detune.setValueAtTime(detune, t);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + (sweep ?? attack + hold + release));
  osc.connect(env);
  const end = t + attack + hold + release + 0.05;
  osc.start(t);
  osc.stop(end);
  return end;
}

/** Filtered noise burst with optional filter sweep. */
export function noise(ctx, dest, buffer, t, { filter = 'bandpass', freq = 1000, freqEnd = null, q = 1, attack = 0.003, hold = 0, release = 0.1, peak = 0.3, sweep = null } = {}) {
  const env = envelope(ctx, dest, t, { attack, hold, release, peak });
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + (sweep ?? attack + hold + release));
  src.connect(f);
  f.connect(env);
  const dur = attack + hold + release + 0.05;
  src.loop = dur >= buffer.duration;
  src.start(t, Math.max(0, Math.random() * (buffer.duration - dur - 0.01)));
  src.stop(t + dur);
  return t + dur;
}

/** Two-operator FM voice (used for the echo shimmer). */
export function fm(ctx, dest, t, { carrier = 440, carrierEnd = null, ratio = 2, index = 200, attack = 0.02, hold = 0.1, release = 0.6, peak = 0.2 } = {}) {
  const env = envelope(ctx, dest, t, { attack, hold, release, peak });
  const c = ctx.createOscillator();
  const m = ctx.createOscillator();
  const mg = ctx.createGain();
  const dur = attack + hold + release;
  c.frequency.setValueAtTime(carrier, t);
  m.frequency.setValueAtTime(carrier * ratio, t);
  if (carrierEnd) {
    c.frequency.exponentialRampToValueAtTime(carrierEnd, t + dur);
    m.frequency.exponentialRampToValueAtTime(carrierEnd * ratio, t + dur);
  }
  mg.gain.setValueAtTime(index, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, index * 0.1), t + dur);
  m.connect(mg);
  mg.connect(c.frequency);
  c.connect(env);
  c.start(t);
  m.start(t);
  c.stop(t + dur + 0.05);
  m.stop(t + dur + 0.05);
  return t + dur;
}

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
