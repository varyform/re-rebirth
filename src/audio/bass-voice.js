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

// Tune knob (0..127): whole semitones, one per 4 knob steps, with a dead zone of
// 6 positions around the centre and an octave at each end (ReBirth.dll's tune
// table, as documented by OpenRB-338). Agrees with a ReBirth recording at 42, 64,
// 66, 111 and 127 (measured -330, 0, 0, +900, +1200 cents).
function tuneCents(knob) {
  const i = Math.min(127, Math.max(0, Math.round(knob * 127))) >> 2;
  const semis = i < 13 ? Math.max(-12, i - 13) : i > 18 ? Math.min(12, i - 18) : 0;
  return semis * 100;
}

const GATE = 0.5; // fraction of a step the gate stays open
const RELEASE = 0.022; // VCA release time constant after the gate closes, seconds
// "Vintage ReBirth sound" (the song's sound model): the VCA opens and closes with a
// 0.86 ms time constant, and resonance moves in 8 steps instead of smoothly. The
// rest of the voice is the same (ReBirth.dll, as documented by OpenRB-338).
const VINTAGE_AMP = 0.00086;
const vintageResonance = (r) => (Math.round(r * 127) >> 4) / 7;
const GLIDE = 0.017; // slide time constant, seconds; exponential in pitch, not Hz
const LEVEL = 1.244; // overall level, matched to the test song at mixer level 80

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
// Accent: a short sweep on top (decay knob ignored) and a VCA boost, fitted at
// resonance 32 to ReBirth's export of tools/bass-test-song.mjs, peak values.
const ACCENT_OCTAVES = 2.4;
const ACCENT_TAU = 0.065;
const ACCENT_GAIN = 2.4; // extra VCA gain at full accent
const ACCENT_GAIN_TAU = 0.092;
const ACCENT_FIT_RESO = 32 / 127;
// In ReBirth.dll (documented by OpenRB-338) both run through one accent envelope:
// a one-pole fed by the filter envelope times the accent amount, its pole set by
// resonance: coef = ((reso/12700 + 0.99) * 0.999) per sample at 44.1 kHz, a rise
// of ~2 ms at resonance 0, ~6 ms at 95 and ~23 ms at 127. Its share of the cutoff
// shrinks with resonance (0.10167 - reso/15); the VCA takes it as gain x (1 + acc).
const accentRise = (r) => -1 / (44100 * Math.log((Math.round(r * 127) / 12700 + 0.99) * 0.999));
const accentDepth = (r) => (0.10167 - Math.round(r * 127) / 127 / 15) / (0.10167 - ACCENT_FIT_RESO / 15);
// The one-pole's answer to an exponential is k(e^(-t/fall) - e^(-t/rise)) with
// k = fall / (fall - rise); scaled so that at the fitted resonance it peaks at 1.
function peakOf(rise, fall) {
  const t = (Math.log(fall / rise) * rise * fall) / (fall - rise);
  return Math.exp(-t / fall) - Math.exp(-t / rise);
}
function accentScale(rise, fall) {
  const fit = accentRise(ACCENT_FIT_RESO);
  return (fall - fit) / (fall - rise) / peakOf(fit, fall);
}

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

// The accent envelope on some params, as two constant sources whose sum is the
// one-pole: `up` holds k e^(-t/fall), `down` the rest, which decays at the rise
// time. A new input starts from whatever is left, so the level never jumps.
class AccentEnv {
  constructor(ctx, params) {
    this.srcs = [ctx.createConstantSource(), ctx.createConstantSource()];
    for (const src of this.srcs) {
      src.offset.value = 0;
      for (const param of params) src.connect(param);
      src.start();
    }
    this.events = []; // as scheduled, oldest first: { t, left, k, rise, fall }
  }

  valueAt(t) {
    const e = this.events.findLast((e) => e.t <= t);
    if (!e) return 0;
    const r = Math.exp(-(t - e.t) / e.rise);
    return e.left * r + e.k * (Math.exp(-(t - e.t) / e.fall) - r);
  }

  // Sets the input at `t`: k = 0 lets the envelope die away at the rise time.
  input(t, k, rise, fall) {
    const left = this.valueAt(t);
    this.events = this.events.filter((e) => e.t < t).slice(-7);
    this.events.push({ t, left, k, rise, fall });
    const [up, down] = this.srcs.map((s) => s.offset);
    for (const [param, value, tau] of [
      [up, k, fall],
      [down, left - k, rise],
    ]) {
      param.cancelScheduledValues(t);
      param.setValueAtTime(value, t);
      param.setTargetAtTime(0, t, tau);
    }
  }
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
    this.accentSweep = new AccentEnv(ctx, [this.f1.detune, this.f2.detune, this.qIn]);
    this.vca = ctx.createGain();
    this.vca.gain.value = 0;
    this.boost = ctx.createGain(); // 1 + the accent
    this.accentBoost = new AccentEnv(ctx, [this.boost.gain]);
    this.level = ctx.createGain();
    // One-pole highpass at 90 Hz: ReBirth keeps less of the fundamental than an
    // ideal sawtooth, 6 dB/octave below ~90 Hz.
    const p = Math.tan((Math.PI * 90) / ctx.sampleRate);
    const a = (1 - p) / (1 + p);
    const lowCut = ctx.createIIRFilter([(1 + a) / 2, -(1 + a) / 2], [1, -a]);
    this.osc.connect(this.f1).connect(this.f2).connect(this.vca).connect(this.boost).connect(this.level).connect(lowCut).connect(out);
    this.osc.start();
    this.pitch.start();
    this.env.start();
    this.slide = false; // the last step's slide flag: the next step is legato
    this.open = false; // the gate (as scheduled up to the last step)
    this.vintage = false;
    this.envStart = { t: 0, tau: 1 }; // the filter envelope's last retrigger
  }

  // Continuous controls. `set(param, value)` smooths and skips unchanged values.
  setParams(p, set) {
    this.vintage = p.vintage;
    const resonance = p.vintage ? vintageResonance(p.resonance) : p.resonance;
    const { fa, pole, gainDb, q0, q1 } = filterShape(p.cutoff, resonance);
    const shift = ENV_BASE_SHIFT * p.envmod;
    const base = 2 ** shift;
    const q2 = 0.1 + 0.15 * resonance;
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

  // Every step is a note-on, as in ReBirth.dll (documented by OpenRB-338): a rest or
  // a tie (a pause after a slide) still takes the step's pitch and slide flag; only a
  // played step opens the gate. After a step with its slide flag set, the next one is
  // legato: the pitch glides and the filter envelope isn't retriggered, even when a
  // slid rest came between. The gate closes half a step in unless the step slides.
  // Every step also sets the accent's input, from the envelope where it is now.
  step(s, next, t, stepDur, p) {
    const rest = !s.gate || s.tie;
    const legato = this.slide;
    const cents = (s.note + s.octave * 12) * 100;
    const pitch = this.pitch.offset;
    if (legato) {
      pitch.setTargetAtTime(cents, t, GLIDE);
    } else {
      pitch.cancelScheduledValues(t);
      pitch.setValueAtTime(cents, t);
    }
    if (!rest && !legato) {
      this.trigger(t, s.accent, p);
    } else {
      if (!rest && !this.open) this.openGate(t);
      const { t: t0, tau } = this.envStart;
      this.accent(t, s.accent ? p.accent * Math.exp(-(t - t0) / tau) : 0, p);
    }
    if (!rest) this.open = true;
    this.slide = !!s.slide;
    if (!s.slide && this.open) this.close(t + stepDur * GATE);
  }

  // Played live (MIDI keys): the note sounds until liveRelease. Legato (a key
  // still down) glides to the new pitch without restarting the envelopes, like a
  // slide. Starting a note cancels whatever the sequencer had scheduled.
  liveNote(s, legato, t, p) {
    const cents = (s.note + s.octave * 12) * 100;
    const pitch = this.pitch.offset;
    if (legato && this.open) {
      hold(pitch, t);
      pitch.setTargetAtTime(cents, t, GLIDE);
      return;
    }
    pitch.cancelScheduledValues(t);
    pitch.setValueAtTime(cents, t);
    this.trigger(t, s.accent, p);
    this.open = true;
    this.slide = false;
  }

  liveRelease(t) {
    this.release(t);
  }

  // A single note for previews: never legato, never held.
  audition(s, t, dur, p) {
    this.slide = false;
    this.step({ ...s, slide: false }, null, t, dur, p);
  }

  trigger(t, accent, p) {
    const env = this.env.offset;
    const tau = accent ? ACCENT_TAU : decayTau(p.decay);
    env.cancelScheduledValues(t);
    env.setValueAtTime(ENV_OCTAVES(p.envmod) * 1200, t);
    env.setTargetAtTime(0, t, tau);
    this.envStart = { t, tau };
    this.accent(t, accent ? p.accent : 0, p);

    // Every envelope starts from an explicit value: setTarget right after a
    // cancel has no defined start in some implementations and can explode.
    // The previous note's release is down to a few percent by now.
    const gain = this.vca.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(0, t);
    if (this.vintage) gain.setTargetAtTime(1, t, VINTAGE_AMP);
    else gain.linearRampToValueAtTime(1, t + 0.001);
  }

  // The accent envelope's input: the accent amount times the filter envelope.
  accent(t, amount, p) {
    const rise = accentRise(p.resonance);
    const sweep = amount * ACCENT_OCTAVES * 1200 * accentDepth(p.resonance);
    this.accentSweep.input(t, sweep * accentScale(rise, ACCENT_TAU), rise, ACCENT_TAU);
    this.accentBoost.input(t, amount * ACCENT_GAIN * accentScale(rise, ACCENT_GAIN_TAU), rise, ACCENT_GAIN_TAU);
  }

  // A legato note after the gate had closed (a slid rest came between): the VCA
  // opens again, the filter envelope carries on where it was.
  openGate(t) {
    const gain = this.vca.gain;
    hold(gain, t);
    if (this.vintage) gain.setTargetAtTime(1, t, VINTAGE_AMP);
    else gain.linearRampToValueAtTime(1, t + 0.001);
  }

  close(t) {
    this.open = false;
    this.vca.gain.setTargetAtTime(0, t, this.vintage ? VINTAGE_AMP : RELEASE);
  }

  release(t) {
    this.slide = false;
    this.open = false;
    hold(this.vca.gain, t);
    this.vca.gain.setTargetAtTime(0, t, this.vintage ? VINTAGE_AMP : RELEASE);
  }
}
