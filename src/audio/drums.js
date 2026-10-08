// Synthesized drum voices (no samples). Each hit builds short-lived nodes that
// stop themselves; the graph is garbage-collected afterwards.
//
// Voice signature: (v, P) where
//   v = { ctx, out, noise, kit, t, acc }  (kit holds per-machine state like hat chokes)
//   P(key) -> knob value 0..1 for the voice's group

const T60 = 1 / 6.9; // setTargetAtTime tau factor: reaches -60 dB at `decay`
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800]; // inharmonic square bank

const lvl = (x) => x * x * 1.3;

function env(v, peak, decay, attack = 0.0015, at = v.t) {
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setTargetAtTime(0, at + attack, decay * T60);
  return g;
}

function osc(v, type, hz) {
  const o = v.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(hz, v.t);
  return o;
}

function noise(v) {
  const n = v.ctx.createBufferSource();
  n.buffer = v.noise;
  n.loop = true;
  return n;
}

function filter(v, type, hz, Q = 0.7) {
  const f = v.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = Q;
  return f;
}

function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

function run(v, src, dur) {
  if (src.buffer) src.start(v.t, Math.random() * (src.buffer.duration - 0.1));
  else src.start(v.t);
  src.stop(v.t + dur);
}

// Six detuned squares summed: the classic analog metallic source.
function metal(v, scale, dur) {
  const sum = v.ctx.createGain();
  sum.gain.value = 1 / METAL.length;
  for (const hz of METAL) {
    const o = osc(v, 'square', hz * scale);
    o.connect(sum);
    run(v, o, dur);
  }
  return sum;
}

function kick(v, { base, sweep, sweepTime, decay, level, click, clickHz = 3500 }) {
  const o = osc(v, 'sine', base * sweep);
  o.frequency.exponentialRampToValueAtTime(base, v.t + sweepTime);
  chain(o, env(v, level, decay, 0.001), v.out);
  run(v, o, decay + 0.05);
  if (click > 0) {
    const n = noise(v);
    chain(n, filter(v, 'lowpass', clickHz), env(v, level * click, 0.012, 0.0005), v.out);
    run(v, n, 0.03);
  }
}

function snare(v, { tones, toneDecay, toneLevel, noiseHp, noiseLp, noiseDecay, noiseLevel }) {
  for (const hz of tones) {
    const o = osc(v, 'triangle', hz * 1.4);
    o.frequency.exponentialRampToValueAtTime(hz, v.t + 0.02);
    chain(o, env(v, toneLevel / tones.length, toneDecay), v.out);
    run(v, o, toneDecay + 0.05);
  }
  const n = noise(v);
  chain(n, filter(v, 'highpass', noiseHp), filter(v, 'lowpass', noiseLp), env(v, noiseLevel, noiseDecay), v.out);
  run(v, n, noiseDecay + 0.05);
}

function tom(v, { hz, decay, level, noiseAmt = 0 }) {
  const o = osc(v, 'sine', hz * 1.35);
  o.frequency.exponentialRampToValueAtTime(hz, v.t + 0.06);
  chain(o, env(v, level, decay), v.out);
  run(v, o, decay + 0.05);
  if (noiseAmt) {
    const n = noise(v);
    chain(n, filter(v, 'bandpass', hz * 4, 1), env(v, level * noiseAmt, decay * 0.3), v.out);
    run(v, n, decay * 0.3 + 0.05);
  }
}

function rim(v, level, bright = 1) {
  for (const [hz, type] of [[480, 'sine'], [1700 * bright, 'triangle']]) {
    const o = osc(v, type, hz);
    chain(o, filter(v, 'bandpass', 1700 * bright, 2), env(v, level * 1.6, 0.03, 0.0005), v.out);
    run(v, o, 0.06);
  }
}

// Several rapid noise bursts then a diffuse tail.
function clap(v, level, hz, tail, q = 1.6) {
  const n = noise(v);
  const g = v.ctx.createGain();
  const p = g.gain;
  p.setValueAtTime(0, v.t);
  for (let i = 0; i < 3; i++) {
    const at = v.t + i * 0.011;
    p.setValueAtTime(level, at);
    p.setTargetAtTime(0, at + 0.001, 0.0035);
  }
  p.setValueAtTime(level * 0.8, v.t + 0.033);
  p.setTargetAtTime(0, v.t + 0.034, tail * T60);
  chain(n, filter(v, 'bandpass', hz, q), filter(v, 'highpass', 600), g, v.out);
  run(v, n, 0.04 + tail);
}

function hat(v, { level, decay, scale = 1, hp = 7000, noiseMix = 0, choke = false, chokeable = false }) {
  const out = env(v, level, decay, 0.0008);
  chain(metal(v, scale, decay + 0.05), filter(v, 'bandpass', 10000, 1), filter(v, 'highpass', hp), out);
  if (noiseMix) {
    const n = noise(v);
    const ng = v.ctx.createGain();
    ng.gain.value = noiseMix;
    chain(n, filter(v, 'highpass', hp), ng, out);
    run(v, n, decay + 0.05);
  }
  // The open hat goes through a separate gain so a closed hat can cut it off.
  const gate = v.ctx.createGain();
  chain(out, gate, v.out);
  // The gate is never automated before a choke, so pin its value explicitly first.
  if (choke && v.kit.openHat) {
    v.kit.openHat.gain.setValueAtTime(1, v.t);
    v.kit.openHat.gain.setTargetAtTime(0, v.t, 0.004);
  }
  if (chokeable) v.kit.openHat = gate;
}

function cymbal(v, { level, decay, scale, hp, bp, noiseMix }) {
  const out = env(v, level, decay, 0.001);
  chain(metal(v, scale, decay + 0.05), filter(v, 'bandpass', bp, 0.6), filter(v, 'highpass', hp), out, v.out);
  if (noiseMix) {
    const n = noise(v);
    const ng = v.ctx.createGain();
    ng.gain.value = noiseMix;
    chain(n, filter(v, 'highpass', hp), ng, out);
    run(v, n, decay + 0.05);
  }
}

const R808 = {
  bd: ['bd', (v, P) => kick(v, { base: 47 + P('tone') * 8, sweep: 2.2, sweepTime: 0.05, decay: 0.15 + P('decay') * 1.4, level: lvl(P('level')) * v.acc * 1.4, click: P('tone') * 0.35 })],
  sd: ['sd', (v, P) => snare(v, { tones: [185, 330], toneDecay: 0.12, toneLevel: lvl(P('level')) * v.acc * (1.2 - P('tone') * 0.5), noiseHp: 1800, noiseLp: 6000 + P('tone') * 6000, noiseDecay: 0.18, noiseLevel: lvl(P('level')) * v.acc * P('snappy') * 0.8 })],
  // Tom pitches measured against ReBirth renders (~185/270/390 Hz at mid tuning).
  lt: ['lt', (v, P) => tom(v, { hz: 170 * (0.8 + P('tuning') * 0.5), decay: 0.45, level: lvl(P('level')) * v.acc })],
  mt: ['mt', (v, P) => tom(v, { hz: 250 * (0.8 + P('tuning') * 0.5), decay: 0.38, level: lvl(P('level')) * v.acc })],
  ht: ['ht', (v, P) => tom(v, { hz: 360 * (0.8 + P('tuning') * 0.5), decay: 0.3, level: lvl(P('level')) * v.acc })],
  rs: ['rs', (v, P) => rim(v, lvl(P('level')) * v.acc)],
  cp: ['cp', (v, P) => clap(v, lvl(P('level')) * v.acc * 1.6, 1100, 0.2)],
  cb: ['cb', (v, P) => {
    const out = env(v, lvl(P('level')) * v.acc * 0.5, 0.3, 0.001);
    for (const hz of [540, 800]) {
      const o = osc(v, 'square', hz);
      chain(o, filter(v, 'bandpass', 2640, 1.2), out);
      run(v, o, 0.35);
    }
    out.connect(v.out);
  }],
  cy: ['cy', (v, P) => cymbal(v, { level: lvl(P('level')) * v.acc * 1.6, decay: 0.5 + P('decay') * 1.8, scale: 1, hp: 3000 + P('tone') * 4000, bp: 7000 + P('tone') * 3000, noiseMix: 0.2 })],
  oh: ['oh', (v, P) => hat(v, { level: lvl(P('level')) * v.acc * 2.2, decay: 0.15 + P('decay') * 0.6, chokeable: true })],
  ch: ['ch', (v, P) => hat(v, { level: lvl(P('level')) * v.acc * 2.2, decay: 0.045, choke: true })],
};

const R909 = {
  // Fundamental measured at ~67 Hz with tune at max.
  // Measured against ReBirth: even at attack 0 the kick has a strong 1-5 kHz click.
  bd: ['bd', (v, P) => kick(v, { base: 52 + P('tune') * 15, sweep: 2 + P('tune') * 4, sweepTime: 0.03, decay: 0.2 + P('decay') * 0.8, level: lvl(P('level')) * v.acc * 1.4, click: 0.7 + P('attack') * 0.8, clickHz: 7000 })],
  sd: ['sd', (v, P) => {
    const k = 0.8 + P('tune') * 0.6;
    snare(v, { tones: [180 * k, 330 * k], toneDecay: 0.1, toneLevel: lvl(P('level')) * v.acc, noiseHp: 1200, noiseLp: 3000 + P('tone') * 9000, noiseDecay: 0.2, noiseLevel: lvl(P('level')) * v.acc * P('snappy') * 0.9 });
  }],
  lt: ['lt', (v, P) => tom(v, { hz: 90 * (0.8 + P('tune') * 0.5), decay: 0.15 + P('decay') * 0.6, level: lvl(P('level')) * v.acc, noiseAmt: 0.2 })],
  mt: ['mt', (v, P) => tom(v, { hz: 130 * (0.8 + P('tune') * 0.5), decay: 0.12 + P('decay') * 0.5, level: lvl(P('level')) * v.acc, noiseAmt: 0.2 })],
  ht: ['ht', (v, P) => tom(v, { hz: 180 * (0.8 + P('tune') * 0.5), decay: 0.1 + P('decay') * 0.4, level: lvl(P('level')) * v.acc, noiseAmt: 0.2 })],
  rs: ['rs', (v, P) => rim(v, lvl(P('level')) * v.acc, 1.2)],
  // Hat/clap/cymbal levels calibrated against ReBirth renders (~8 dB hotter than v1).
  cp: ['cp', (v, P) => clap(v, lvl(P('level')) * v.acc * 6, 1700, 0.28, 0.9)],
  ch: ['hh', (v, P) => hat(v, { level: lvl(P('level')) * v.acc * 2, decay: 0.03 + P('chDecay') * 0.15, scale: 1.3, hp: 8000, noiseMix: 0.6, choke: true })],
  oh: ['hh', (v, P) => hat(v, { level: lvl(P('level')) * v.acc * 2.5, decay: 0.25 + P('ohDecay') * 1.5, scale: 1.3, hp: 7500, noiseMix: 0.6, chokeable: true })],
  cr: ['cy', (v, P) => cymbal(v, { level: lvl(P('crLevel')) * v.acc * 1.6, decay: 1.6, scale: 1.7 * (0.7 + P('crTune') * 0.6), hp: 4000, bp: 6000, noiseMix: 0.5 })],
  rd: ['cy', (v, P) => cymbal(v, { level: lvl(P('rdLevel')) * v.acc * 1.2, decay: 1.2, scale: 2.3 * (0.7 + P('rdTune') * 0.6), hp: 5000, bp: 8000, noiseMix: 0.15 })],
};

// track id -> [knob group id, voice]
export const KITS = { r808: R808, r909: R909 };
