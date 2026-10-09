// Monophonic acid bass voice. The oscillator runs continuously so slides can
// glide pitch; notes are scheduled as automation on the pitch, filter env and VCA.
//
// osc -> resonant lowpass -> one-pole lowpass -> VCA -> level -> one-pole highpass -> out
//
// Everything below is fitted to ReBirth's export of a purpose-built test song
// (tools/bass-test-song.mjs: one setting per bar, Bass Line 1 alone, no effects).
// The filter envelope drives both lowpasses' `detune` (cents), so the cutoff knob
// stays live on `frequency` while notes are playing.

// Note 0 at the centre tune position: C2 (C with octave -1 plays 32.7 Hz).
const BASE_MIDI = 36;

// Tune knob (0..127, centre 64), fitted to a ReBirth recording at 42, 64, 66,
// 111 and 127 (measured -330, 0, 0, +900, +1200 cents). Upwards it moves in whole
// semitones up to +1 octave; downwards it's continuous, scaling frequency
// linearly (half speed at 0).
function tuneCents(knob) {
  const u = knob * 127 - 64;
  if (u >= 0) return Math.round((u * 12) / 63) * 100;
  return 1200 * Math.log2(1 + u / 128);
}

const GATE = 0.5; // fraction of a step the gate stays open
const RELEASE = 0.022; // VCA release time constant after the gate closes, seconds
const GLIDE = 0.017; // slide time constant, seconds; exponential in pitch, not Hz
const LEVEL = 0.43; // overall level, matched to the test song at mixer level 80

// Static filter, per cutoff c and resonance r (both 0..1). A held sawtooth's
// harmonics match ReBirth within ~0.7 dB across cutoff 0..127 x resonance 0..127:
// fa/q: the resonant biquad; it spans ~205 Hz..1.75 kHz and peaks harder higher up
// pole: a one-pole lowpass that follows it, low at zero resonance (gentle slope)
// gainDb: resonance thins the level, less so at high cutoff
const OCTAVES = 3.093; // cutoff knob range
function filterShape(c, r) {
  const fa = 204.6 * 2 ** (OCTAVES * c) * (1 + 0.2565 * r ** 3);
  const pole = fa * (0.1582 + 1.062 * r);
  const gainDb = 2.691 + r * (-5.016 - 20.27 * c) + r * r * (-3.414 + 22.4 * c);
  return { fa, pole, gainDb, ...qDb(r) };
}
// The peak follows the actual frequency, not the knob: during an envelope sweep
// Q matches the static fit at the swept frequency. In dB it's linear in c:
// Q dB = q0 + q1 * c.
const qDb = (r) => ({
  q0: (20 / Math.LN10) * (-0.4045 + 1.339 * r + 0.5493 * r * r),
  q1: (20 / Math.LN10) * (0.9314 * r + 0.8111 * r * r),
});
// Beyond the measured range (the env sweeps well past the knob's top), Q stops growing.
const Q_MAX_C = 1.25;

// The one-pole is a biquad with a low Q: two real poles, the lower one at
// `frequency * lowPole(q)`, the other far above. More Q keeps the upper one
// below Nyquist when the pole sits high (at high resonance).
const lowPole = (q) => (1 / q - Math.sqrt(1 / q ** 2 - 4)) / 2;

// Filter envelope, in octaves above the base cutoff, decaying exponentially.
// Env mod also lowers the base cutoff (as on the TB-303), and even at 0 there's a
// small sweep.
const ENV_OCTAVES = (envmod) => 0.81 + 3.91 * envmod;
const ENV_BASE_SHIFT = -1.51; // octaves at full env mod
// Decay time constants at knob 0, 32, 64, 96, 127; interpolated in log time.
const DECAY_TAUS = [0.011, 0.124, 0.261, 0.763, 2.089];
function decayTau(knob) {
  const x = Math.min(1, Math.max(0, knob)) * (DECAY_TAUS.length - 1);
  const i = Math.min(DECAY_TAUS.length - 2, Math.floor(x));
  return DECAY_TAUS[i] * (DECAY_TAUS[i + 1] / DECAY_TAUS[i]) ** (x - i);
}
// Accent: a short sweep on top (decay knob ignored) and a VCA boost that fades
// over the step and drops back at the next step.
const ACCENT_OCTAVES = 3.3;
const ACCENT_TAU = 0.065;
const ACCENT_GAIN = 2.85; // extra VCA gain at full accent
const ACCENT_GAIN_TAU = 0.092;

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

// ReBirth's square is a slightly off-centre pulse (duty ~0.477: even harmonics
// creep back in) at about half the sawtooth's harmonic level.
const PULSE_DUTY = 0.4767;
const PULSE_SCALE = 0.55;
function waves(ctx) {
  const n = 2048;
  const saw = { real: new Float32Array(n), imag: new Float32Array(n) };
  const pulse = { real: new Float32Array(n), imag: new Float32Array(n) };
  for (let k = 1; k < n; k++) {
    const b = ((k % 2 ? 1 : -1) * 2) / (Math.PI * k); // the standard sawtooth's series
    const th = 2 * Math.PI * k * PULSE_DUTY;
    saw.imag[k] = b;
    pulse.imag[k] = PULSE_SCALE * b * (1 - Math.cos(th));
    pulse.real[k] = PULSE_SCALE * b * Math.sin(th);
  }
  const make = (w) => new PeriodicWave(ctx, { ...w, disableNormalization: true });
  return { saw: make(saw), pulse: make(pulse) };
}

// Freeze a param at its value at `t` and drop later events. Firefox lacks
// cancelAndHoldAtTime; there the following setTarget ramps from the last event.
export function hold(param, t) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else param.cancelScheduledValues(t);
}

export class BassVoice {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.waves = waves(ctx);
    this.osc = ctx.createOscillator();
    this.osc.frequency.value = midiToHz(BASE_MIDI);
    this.osc.setPeriodicWave(this.waves.saw);
    this.wave = 'saw';
    // Note pitch in cents above BASE_MIDI; adds to the tune knob on `detune`.
    this.pitch = ctx.createConstantSource();
    this.pitch.offset.value = 0;
    this.pitch.connect(this.osc.detune);
    this.f1 = ctx.createBiquadFilter();
    this.f2 = ctx.createBiquadFilter();
    for (const f of [this.f1, this.f2]) f.type = 'lowpass';
    this.env = ctx.createConstantSource();
    this.env.offset.value = 0;
    this.env.connect(this.f1.detune);
    this.env.connect(this.f2.detune);
    // env cents -> Q dB, clamped: scale so the WaveShaper's input clips at Q_MAX_C.
    this.qIn = ctx.createGain();
    this.qOut = ctx.createGain();
    const clamp = new WaveShaperNode(ctx, { curve: new Float32Array([-1, 1]) });
    this.env.connect(this.qIn).connect(clamp).connect(this.qOut).connect(this.f1.Q);
    this.vca = ctx.createGain();
    this.vca.gain.value = 0;
    this.level = ctx.createGain();
    // One-pole highpass at 90 Hz: ReBirth keeps less of the fundamental than an
    // ideal sawtooth, 6 dB/octave below ~90 Hz.
    const p = Math.tan((Math.PI * 90) / ctx.sampleRate);
    const a = (1 - p) / (1 + p);
    const lowCut = ctx.createIIRFilter([(1 + a) / 2, -(1 + a) / 2], [1, -a]);
    this.osc.connect(this.f1).connect(this.f2).connect(this.vca).connect(this.level).connect(lowCut).connect(out);
    this.osc.start();
    this.pitch.start();
    this.env.start();
    this.sliding = false;
  }

  // Continuous controls. `set(param, value)` smooths and skips unchanged values.
  setParams(p, set) {
    const { fa, pole, gainDb, q0, q1 } = filterShape(p.cutoff, p.resonance);
    const shift = ENV_BASE_SHIFT * p.envmod;
    const base = 2 ** shift;
    const q2 = 0.1 + 0.15 * p.resonance;
    set(this.f1.frequency, fa * base);
    // Lowpass Q is in dB. Its env-driven part saturates at Q_MAX_C.
    const c = Math.min(Q_MAX_C, p.cutoff + shift / OCTAVES);
    const span = (Q_MAX_C - c) * OCTAVES * 1200; // env cents until the clamp
    set(this.f1.Q, q0 + q1 * c);
    set(this.qIn.gain, span > 1 ? 1 / span : 0);
    set(this.qOut.gain, (q1 * span) / (OCTAVES * 1200));
    set(this.f2.frequency, (pole * base) / lowPole(q2));
    set(this.f2.Q, 20 * Math.log10(q2));
    set(this.osc.detune, tuneCents(p.tuning));
    set(this.level.gain, p.volume * p.volume * LEVEL * 10 ** (gainDb / 20));
    const wave = p.waveform >= 0.5 ? 'pulse' : 'saw';
    if (this.wave !== wave) this.osc.setPeriodicWave(this.waves[(this.wave = wave)]);
  }

  step(s, next, t, stepDur, p) {
    if (!s.gate) {
      if (this.sliding) this.release(t);
      return;
    }
    // A tie holds the previous note: no new pitch, no retrigger, gate stays open.
    // Whether the *next* note slides in depends on this held step's own slide flag.
    if (s.tie && this.holding) {
      this.holding = !!next.tie;
      this.sliding = s.slide && next.gate && !next.tie;
      if (!this.holding && !this.sliding) this.close(t + stepDur * GATE);
      return;
    }
    const cents = (s.note + s.octave * 12) * 100;
    const pitch = this.pitch.offset;
    const triggered = !this.sliding;
    if (this.sliding) {
      pitch.setTargetAtTime(cents, t, GLIDE);
    } else {
      pitch.cancelScheduledValues(t);
      pitch.setValueAtTime(cents, t);
      this.trigger(t, s.accent, p);
    }
    // A slide into a following note holds the gate and skips the retrigger.
    this.sliding = s.slide && next.gate && !next.tie;
    this.holding = !!next.tie;
    if (!this.sliding && !this.holding) this.close(t + stepDur * GATE);
    else if (triggered && s.accent) this.vca.gain.setTargetAtTime(1, t + stepDur, 0.004);
  }

  trigger(t, accent, p) {
    const acc = accent ? p.accent : 0;
    const env = this.env.offset;
    const octaves = ENV_OCTAVES(p.envmod) + acc * ACCENT_OCTAVES;
    env.cancelScheduledValues(t);
    env.setValueAtTime(octaves * 1200, t);
    env.setTargetAtTime(0, t, accent ? ACCENT_TAU : decayTau(p.decay));

    // Every envelope starts from an explicit value: setTarget right after a
    // cancel has no defined start in some implementations and can explode.
    // The previous note's release is down to a few percent by now.
    const gain = this.vca.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(0, t);
    gain.linearRampToValueAtTime(1 + acc * ACCENT_GAIN, t + 0.001);
    if (acc) gain.setTargetAtTime(1, t + 0.001, ACCENT_GAIN_TAU);
  }

  close(t) {
    this.vca.gain.setTargetAtTime(0, t, RELEASE);
  }

  release(t) {
    this.sliding = false;
    hold(this.vca.gain, t);
    this.vca.gain.setTargetAtTime(0, t, RELEASE);
  }
}
