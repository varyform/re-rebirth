export const INSERTS = ['dist', 'comp', 'pcf'];
export const PCF_TYPES = ['lowpass', 'bandpass', 'highpass', 'notch'];

export function whiteNoise(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// shape 0 = smooth tanh saturation, 1 = hard clipping.
export function distortionCurve(amount, shape, n = 2048) {
  const drive = 1 + amount * amount * 40;
  const norm = Math.tanh(drive);
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const soft = Math.tanh(x * drive) / norm;
    const hard = Math.max(-1, Math.min(1, x * drive * 0.6));
    curve[i] = soft * (1 - shape) + hard * shape;
  }
  return curve;
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
  dist(ctx) {
    const shaper = ctx.createWaveShaper();
    shaper.oversample = '2x';
    const out = ctx.createGain();
    out.gain.value = 0.6;
    shaper.connect(out);
    return { in: shaper, out, shaper };
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
    filter.Q.value = 6;
    return { in: filter, out: filter, filter };
  },
};

// One instance of each effect per channel, crossfaded in/out. Only the targeted
// channel gets wet signal, which makes retargeting click-free.
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

// Tempo-synced ping-pong delay; `width` blends mono echoes to full L/R.
export function createDelay(ctx) {
  const input = ctx.createGain();
  const out = ctx.createGain();
  const dl = ctx.createDelay(4);
  const dr = ctx.createDelay(4);
  const fb1 = ctx.createGain();
  const fb2 = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 4500;
  input.connect(dl);
  dl.connect(fb1).connect(dr);
  dr.connect(fb2).connect(tone).connect(dl);

  const merger = ctx.createChannelMerger(2);
  const mix = {};
  for (const [name, src, ch] of [['lA', dl, 0], ['lB', dr, 0], ['rA', dr, 1], ['rB', dl, 1]]) {
    mix[name] = ctx.createGain();
    src.connect(mix[name]).connect(merger, 0, ch);
  }
  merger.connect(out);
  return { in: input, out, dl, dr, fb1, fb2, mix };
}
