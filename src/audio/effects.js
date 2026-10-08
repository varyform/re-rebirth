export const INSERTS = ['dist', 'comp', 'pcf'];
// Pattern filter modes: 0 = bandpass, 1 = lowpass.
export const PCF_TYPES = ['bandpass', 'lowpass'];

export function whiteNoise(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function curve(fn, n = 2048) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn((i / (n - 1)) * 2 - 1);
  return out;
}

// Fixed curves; drive comes from a gain in front (input past ±1 clamps to the ends).
const softFn = (x) => Math.tanh(x * 3) / Math.tanh(3);
const hardFn = (x) => Math.max(-1, Math.min(1, x * 1.6));
const SOFT_CURVE = curve(softFn);
const HARD_CURVE = curve(hardFn);

// Output gain that keeps a typical program level (-12 dBFS sine) unchanged
// through the distortion, so the amount knob changes tone, not loudness.
export function distMakeup(drive, shape) {
  const a = 0.25;
  const n = 256;
  let inSum = 0;
  let outSum = 0;
  for (let i = 0; i < n; i++) {
    const x = a * Math.sin((2 * Math.PI * i) / n);
    const d = Math.max(-1, Math.min(1, x * drive));
    const y = softFn(d) * (1 - shape) + hardFn(d) * shape;
    inSum += x * x;
    outSum += y * y;
  }
  return Math.sqrt(inSum / Math.max(outSum, 1e-9));
}

// Unity below the knee, tanh rounding above it. WaveShaper clamps input to
// [-1, 1], so output can never exceed the curve's end value (~0.9).
export function softClipCurve(knee = 0.6, n = 2048) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a < knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

const makers = {
  // drive -> soft and hard shapers -> crossfaded by `shape`
  dist(ctx) {
    const drive = ctx.createGain();
    const out = ctx.createGain();
    const mix = {};
    for (const [name, c] of [['soft', SOFT_CURVE], ['hard', HARD_CURVE]]) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = c;
      shaper.oversample = '2x';
      mix[name] = ctx.createGain();
      drive.connect(shaper).connect(mix[name]).connect(out);
    }
    return { in: drive, out, drive, mix };
  },
  comp(ctx) {
    const comp = ctx.createDynamicsCompressor();
    comp.knee.value = 6;
    const out = ctx.createGain();
    comp.connect(out);
    return { in: comp, out, comp, makeup: out };
  },
  pcf(ctx) {
    const filter = ctx.createBiquadFilter();
    filter.frequency.value = 1000;
    const out = ctx.createGain();
    filter.connect(out);
    return { in: filter, out, filter, makeup: out };
  },
};

// One instance of each effect per channel, crossfaded in/out, so routing
// changes (including automated ones) are click-free.
export class InsertChain {
  constructor(ctx, input, output) {
    this.stages = {};
    let node = input;
    for (const key of INSERTS) {
      const fx = makers[key](ctx);
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const out = ctx.createGain();
      wet.gain.value = 0;
      node.connect(dry).connect(out);
      node.connect(fx.in);
      fx.out.connect(wet).connect(out);
      this.stages[key] = { fx, dry, wet };
      node = out;
    }
    node.connect(output);
  }
}

// Mono tempo-synced echo with a darkening feedback loop, panned into the mix.
export function createDelay(ctx) {
  const input = ctx.createGain();
  const delay = ctx.createDelay(12);
  const feedback = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 5000;
  const pan = ctx.createStereoPanner();
  const out = ctx.createGain();
  input.connect(delay);
  delay.connect(tone).connect(feedback).connect(delay);
  delay.connect(pan).connect(out);
  return { in: input, out, delay, feedback, pan };
}
