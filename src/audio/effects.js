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

// Distortion, fitted to a ReBirth export of a steady tone through every amount
// and shape (tools/fx-test-song.mjs). It sits before the fader and isn't level
// compensated. Levels are in `ref` units: the channel's internal level that
// matches ReBirth's (the bass test tone peaks at 1).
//  amount: input drive, 0 dB at 0 rising to +24 dB (square law)
//  shape 0 (ReBirth 1.5 mode): a hard clipper at `clip`
//  shape 1..127: a sine wavefolder that folds more the higher the shape,
//    clamped at `foldClip`, with some of the dry signal left at low shapes
//    and a gentle lowpass on the result
export const DIST = {
  ref: 0.2,
  driveDb: 24.25,
  clip: 1.97,
  foldClip: 3.446,
  foldGain: 6.267,
  foldPow: 1.661,
  foldAmp: 2.505,
  foldDry: 0.691,
  foldDryPow: 0.82,
  foldLowpass: 4881,
};
export const distDrive = (amount) => 10 ** ((DIST.driveDb * amount * amount) / 20);
// Input is clamped to [-1, 1] = +-foldClip; output in ref units.
export const foldCurve = (shape) =>
  curve((z) => {
    const v = z * DIST.foldClip;
    const g = DIST.foldGain * shape ** DIST.foldPow;
    return DIST.foldAmp * Math.sin(g * v) + DIST.foldDry * (1 - shape) ** DIST.foldDryPow * v;
  }, 4096);

// DynamicsCompressorNode applies its own makeup gain, from its static curve:
// (1 / the curve's gain at 0 dBFS)^0.6. Ported from Blink's DynamicsCompressorKernel
// (Firefox uses the same code), so it can be divided out exactly.
export function builtinMakeupDb(thresholdDb, kneeDb, ratio) {
  const lin = (db) => 10 ** (db / 20);
  const db = (x) => 20 * Math.log10(x);
  const t = lin(thresholdDb);
  const knee = (x, k) => (x < t ? x : t + (1 - Math.exp(-k * (x - t))) / k);
  const slopeAt = (x, k) => (x < t ? 1 : (db(knee(x * 1.001, k)) - db(knee(x, k))) / (db(x * 1.001) - db(x)));
  const kneeTop = lin(thresholdDb + kneeDb);
  let lo = 0.1;
  let hi = 10000;
  let k = 5;
  for (let i = 0; i < 15; i++) {
    if (slopeAt(kneeTop, k) < 1 / ratio) hi = k;
    else lo = k;
    k = Math.sqrt(lo * hi);
  }
  const kneeTopOut = db(knee(kneeTop, k));
  const full = 1 < kneeTop ? knee(1, k) : lin(kneeTopOut + (0 - (thresholdDb + kneeDb)) / ratio);
  return -0.6 * db(full);
}

function onePoleLowpass(ctx, hz) {
  const p = Math.exp((-2 * Math.PI * hz) / ctx.sampleRate);
  return ctx.createIIRFilter([1 - p], [1, -p]);
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
  // in -> drive -> clipper ---------------> mix.clip -> out
  //    -> drive -> folder -> lowpass ----> mix.fold -/
  // Only one path is open: shape 0 clips, anything above folds.
  dist(ctx) {
    const input = ctx.createGain();
    const out = ctx.createGain();
    const clip = ctx.createWaveShaper();
    clip.curve = Float32Array.from([-1, 1]); // linear; WaveShaper input clamps at +-1
    clip.oversample = '2x';
    const fold = ctx.createWaveShaper();
    fold.curve = foldCurve(0.5);
    fold.oversample = '4x';
    const drive = { clip: ctx.createGain(), fold: ctx.createGain() };
    const mix = { clip: ctx.createGain(), fold: ctx.createGain() };
    input.connect(drive.clip).connect(clip).connect(mix.clip).connect(out);
    input.connect(drive.fold).connect(fold).connect(onePoleLowpass(ctx, DIST.foldLowpass)).connect(mix.fold).connect(out);
    return { in: input, out, drive, mix, fold };
  },
  comp(ctx) {
    const pre = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.knee.value = 0;
    const out = ctx.createGain();
    pre.connect(comp).connect(out);
    return { in: pre, out, pre, comp, makeup: out };
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
// changes (including automated ones) are click-free. A distortion or pattern
// filter that has been off for a while is disconnected from its input, so it
// stops costing CPU (5 chains of mostly idle oversampled shapers otherwise run
// all the time). Compressors stay connected: idling them audibly changed renders.
const IDLE_AFTER = 1; // seconds; well past the crossfade and offline render slices
const IDLES = new Set(['dist', 'pcf']);

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
      fx.out.connect(wet).connect(out);
      const idles = IDLES.has(key);
      if (!idles) node.connect(fx.in);
      this.stages[key] = { fx, dry, wet, input: node, idles, connected: !idles, offAt: null };
      node = out;
    }
    node.connect(output);
  }

  // Call alongside the wet/dry crossfade, with the current audio time.
  setActive(key, on, now) {
    const stage = this.stages[key];
    if (!stage.idles) return;
    if (on) {
      if (!stage.connected) stage.input.connect(stage.fx.in);
      stage.connected = true;
      stage.offAt = null;
    } else if (stage.connected) {
      stage.offAt ??= now;
      if (now - stage.offAt > IDLE_AFTER) {
        stage.input.disconnect(stage.fx.in);
        stage.connected = false;
        stage.offAt = null;
      }
    }
  }
}

// Mono tempo-synced echo with a darkening feedback loop, panned into the mix.
export function createDelay(ctx) {
  const input = ctx.createGain();
  const delay = ctx.createDelay(12);
  // ReBirth's echoes keep their tone: at full feedback they repeat unchanged forever.
  const feedback = ctx.createGain();
  const pan = ctx.createStereoPanner();
  const out = ctx.createGain();
  input.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(pan).connect(out);
  return { in: input, out, delay, feedback, pan };
}
