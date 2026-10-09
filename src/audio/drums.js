// Synthesized drum voices (no samples). Each hit builds short-lived nodes that
// stop themselves; playHit() then disconnects them so they can be collected.
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
  if (v.t + dur >= v.end) {
    v.end = v.t + dur;
    v.last = src;
  }
}

// Every hit plays through its own bus, disconnected once its last source ends.
// Left connected, finished hits kept costing render time, which grew faster
// than the song length (offline renders slowed down more and more).
export function playHit(voice, v, P) {
  const bus = v.ctx.createGain();
  bus.connect(v.out);
  const hit = { ...v, out: bus, end: 0, last: null };
  voice(hit, P);
  if (hit.last) hit.last.onended = () => bus.disconnect();
  else bus.disconnect();
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

// Pitch falls from base * sweep to base, either reaching it at sweepTime or, with
// `settle` (time constant), approaching it gradually.
// harm: level of a second harmonic that follows the same sweep.
function kick(v, { base, sweep, sweepTime, settle, decay, level, click, clickHz = 3500, harm = 0 }) {
  for (const [mul, gain] of harm ? [[1, 1], [2, harm]] : [[1, 1]]) {
    const o = osc(v, 'sine', base * sweep * mul);
    if (settle) o.frequency.setTargetAtTime(base * mul, v.t, settle);
    else o.frequency.exponentialRampToValueAtTime(base * mul, v.t + sweepTime);
    chain(o, env(v, level * gain, decay, 0.001), v.out);
    run(v, o, decay + 0.05);
  }
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

function tom(v, { hz, decay, level, noiseAmt = 0, sweep = 1.35, sweepTime = 0.06 }) {
  const o = osc(v, 'sine', hz * sweep);
  o.frequency.exponentialRampToValueAtTime(hz, v.t + sweepTime);
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

// Damped sine partials [hz, relative level], plus a short noise tick.
function ring(v, { partials, decay, level, tick = 0, tickHz = 2500 }) {
  for (const [hz, rel] of partials) {
    const o = osc(v, 'sine', hz);
    chain(o, env(v, level * rel, decay, 0.0005), v.out);
    run(v, o, decay + 0.05);
  }
  if (tick) {
    const n = noise(v);
    chain(n, filter(v, 'bandpass', tickHz, 0.8), env(v, level * tick, 0.01, 0.0005), v.out);
    run(v, n, 0.03);
  }
}

// Several rapid noise bursts then a diffuse tail.
function clap(v, level, hz, tail, q = 1.6, tailLevel = 0.8) {
  const n = noise(v);
  const g = v.ctx.createGain();
  const p = g.gain;
  p.setValueAtTime(0, v.t);
  for (let i = 0; i < 3; i++) {
    const at = v.t + i * 0.011;
    p.setValueAtTime(level, at);
    p.setTargetAtTime(0, at + 0.001, 0.0035);
  }
  p.setValueAtTime(level * tailLevel, v.t + 0.033);
  p.setTargetAtTime(0, v.t + 0.034, tail * T60);
  chain(n, filter(v, 'bandpass', hz, q), filter(v, 'highpass', 600), g, v.out);
  run(v, n, 0.04 + tail);
}

// body: level of the square bank's low partials leaking past the filters,
// heard as a metallic ring around 400 Hz on the 808 hats.
function hat(v, { level, decay, scale = 1, hp = 7000, lp = 20000, noiseMix = 0, metalMix = 1, body = 0, bodyDecay = 0.06, choke = false, chokeable = false }) {
  const out = env(v, level, decay, 0.0008);
  const mg = v.ctx.createGain();
  mg.gain.value = metalMix;
  const source = metal(v, scale, decay + 0.05);
  chain(source, filter(v, 'bandpass', 10000, 1), filter(v, 'highpass', hp), filter(v, 'lowpass', lp), mg, out);
  if (body) chain(source, filter(v, 'bandpass', 400, 2), env(v, level * body, bodyDecay, 0.0008), out);
  if (noiseMix) {
    const n = noise(v);
    const ng = v.ctx.createGain();
    ng.gain.value = noiseMix;
    chain(n, filter(v, 'highpass', hp), filter(v, 'lowpass', lp), ng, out);
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

// 808 voices fitted to a ReBirth test recording (knobs at centre unless noted).
const R808 = {
  // ~57 Hz, -20 dB after ~170 ms at decay 64. Even at full tone the click is faint
  // (ReBirth's channel export of a song: little above 400 Hz).
  bd: ['bd', (v, P) => kick(v, { base: 50 + P('tone') * 6, sweep: 1.5, sweepTime: 0.03, decay: 0.15 + P('decay') * 0.75, level: lvl(P('level')) * v.acc * 1.4, click: P('tone') * 0.1 })],
  sd: ['sd', (v, P) => snare(v, { tones: [185, 330], toneDecay: 0.12, toneLevel: lvl(P('level')) * v.acc * 1.27 * (1.2 - P('tone') * 0.5), noiseHp: 1800, noiseLp: 6000 + P('tone') * 6000, noiseDecay: 0.18, noiseLevel: lvl(P('level')) * v.acc * P('snappy') })],
  // Toms measured on isolated hits in a ReBirth recording: ~194/280/388 Hz at
  // tuning ~0.56, with almost no pitch sweep.
  lt: ['lt', (v, P) => tom(v, { hz: 180 * (0.8 + P('tuning') * 0.5), decay: 0.45, level: lvl(P('level')) * v.acc * 0.7, sweep: 1.04, sweepTime: 0.02 })],
  mt: ['mt', (v, P) => tom(v, { hz: 260 * (0.8 + P('tuning') * 0.5), decay: 0.38, level: lvl(P('level')) * v.acc * 0.45, sweep: 1.04, sweepTime: 0.02 })],
  ht: ['ht', (v, P) => tom(v, { hz: 360 * (0.8 + P('tuning') * 0.5), decay: 0.2, level: lvl(P('level')) * v.acc * 0.7, sweep: 1.04, sweepTime: 0.02 })],
  // Rimshot energy sits above 1.5 kHz, -20 dB after ~45 ms.
  rs: ['rs', (v, P) => ring(v, { partials: [[1700, 1], [2600, 0.45]], decay: 0.13, level: lvl(P('level')) * v.acc * 0.3, tick: 0.5, tickHz: 6000 })],
  // The clap is bright: most energy above 4 kHz.
  cp: ['cp', (v, P) => clap(v, lvl(P('level')) * v.acc * 0.55, 9000, 0.14, 0.7)],
  // Measured on isolated hits: centred near 1 kHz, short in the mids.
  cb: ['cb', (v, P) => {
    const out = env(v, lvl(P('level')) * v.acc * 0.6, 0.12, 0.001);
    for (const hz of [540, 800]) {
      const o = osc(v, 'square', hz);
      chain(o, filter(v, 'bandpass', 1000, 1), out);
      run(v, o, 0.2);
    }
    out.connect(v.out);
  }],
  // -20 dB after ~175 ms at decay 100; little energy below 4 kHz at tone 0.
  cy: ['cy', (v, P) => cymbal(v, { level: lvl(P('level')) * v.acc * 1.7, decay: 0.2 + P('decay') * 0.5, scale: 1, hp: 6000 + P('tone') * 3000, bp: 9000 + P('tone') * 2000, noiseMix: 0.2 })],
  oh: ['oh', (v, P) => hat(v, { level: lvl(P('level')) * v.acc * 2.6, decay: 0.15 + P('decay') * 0.6, hp: 8000, chokeable: true })],
  ch: ['ch', (v, P) => hat(v, { level: lvl(P('level')) * v.acc * 2.9, decay: 0.045, hp: 8000, choke: true })],
};

// 909 voices fitted to a ReBirth test recording with every knob at centre
// (one or two hits per step, effects off).
const R909 = {
  // ~86 Hz average in the first 80 ms at tune 64, -20 dB after ~290 ms at max decay.
  // Tune sets the start of the pitch sweep (~120 Hz at 64, ~280 Hz at 127; at 127
  // ~112 Hz average over 20-60 ms and ~67 Hz over 60-120 ms, per ReBirth's channel
  // export of a song), settling on 56 Hz. A weak second harmonic carries the tail
  // in the 100-200 Hz band. Decay (-60 dB) fitted between ~1.1 s at 127 and ~0.7 s
  // at 65. Attack 0 has no audible click.
  bd: ['bd', (v, P) => kick(v, { base: 56, sweep: 1 + 1.1 * 3.6 ** (2 * P('tune') - 1), settle: 0.076 - P('tune') * 0.052, decay: 0.25 + P('decay') * 0.85, level: lvl(P('level')) * v.acc * 0.75, click: 1.5 * P('attack') ** 0.45, clickHz: 7000, harm: 0.07 })],
  // Body around 186 Hz dominates; the noise sits ~7 dB under it.
  sd: ['sd', (v, P) => {
    const k = 0.8 + P('tune') * 0.6;
    snare(v, { tones: [170 * k, 310 * k], toneDecay: 0.09, toneLevel: lvl(P('level')) * v.acc * 2, noiseHp: 1200, noiseLp: 3000 + P('tone') * 9000, noiseDecay: 0.18, noiseLevel: lvl(P('level')) * v.acc * P('snappy') * 0.45 });
  }],
  // Toms: ~102 / 127 Hz at tune 64; short even at max decay (-20 dB at ~72 / ~40 ms).
  lt: ['lt', (v, P) => tom(v, { hz: 90 * (0.8 + P('tune') * 0.5), decay: 0.3 * (0.3 + P('decay') * 0.7), level: lvl(P('level')) * v.acc * 2, sweep: 1.2, sweepTime: 0.04 })],
  mt: ['mt', (v, P) => tom(v, { hz: 112 * (0.8 + P('tune') * 0.5), decay: 0.16 * (0.3 + P('decay') * 0.7), level: lvl(P('level')) * v.acc * 2, sweep: 1.2, sweepTime: 0.04 })],
  ht: ['ht', (v, P) => tom(v, { hz: 140 * (0.8 + P('tune') * 0.5), decay: 0.12 * (0.3 + P('decay') * 0.7), level: lvl(P('level')) * v.acc * 2, sweep: 1.2, sweepTime: 0.04 })],
  // Rimshot: low body peaking ~113 Hz, -20 dB after ~40 ms.
  rs: ['rs', (v, P) => ring(v, { partials: [[113, 1], [330, 0.35], [900, 0.12], [1700, 0.06]], decay: 0.12, level: lvl(P('level')) * v.acc * 1.4, tick: 0.12 })],
  // Clap centred near 900 Hz, little below 600 Hz. The tail sits ~14 dB under the
  // bursts (ReBirth's channel export of a song).
  cp: ['cp', (v, P) => clap(v, lvl(P('level')) * v.acc * 6.5, 1100, 0.35, 1.3, 0.2)],
  // The 909's sampled hats are broadband (flat ~4-13 kHz in ReBirth recordings):
  // mostly high-passed noise with a lighter metallic layer.
  ch: ['hh', (v, P) => hat(v, { level: lvl(P('level')) * v.acc * 0.7, decay: 0.03 + P('chDecay') * 0.15, scale: 1.3, hp: 2400, noiseMix: 1, metalMix: 0.35, choke: true })],
  oh: ['hh', (v, P) => hat(v, { level: lvl(P('level')) * v.acc * 0.5, decay: 0.25 + P('ohDecay') * 1.5, scale: 1.3, hp: 2600, lp: 12000, noiseMix: 1, metalMix: 0.35, chokeable: true })],
  cr: ['cy', (v, P) => cymbal(v, { level: lvl(P('crLevel')) * v.acc * 1.6, decay: 1.6, scale: 1.7 * (0.7 + P('crTune') * 0.6), hp: 4000, bp: 6000, noiseMix: 0.5 })],
  rd: ['cy', (v, P) => cymbal(v, { level: lvl(P('rdLevel')) * v.acc * 1.2, decay: 1.2, scale: 2.3 * (0.7 + P('rdTune') * 0.6), hp: 5000, bp: 8000, noiseMix: 0.15 })],
};

// track id -> [knob group id, voice]
export const KITS = { r808: R808, r909: R909 };
