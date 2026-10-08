// Monophonic acid bass voice. The oscillator runs continuously so slides can
// glide pitch; notes are scheduled as automation on the filter env and VCA.
//
// osc -> lowpass (flat) -> lowpass (resonant) -> VCA -> level -> low cut -> out
// The filter envelope drives both filters' `detune` (cents), so the cutoff knob
// stays live on `frequency` while notes are playing.

// Note 0 at the centre tune position: C2. Verified against a ReBirth recording
// (C+1 octave with tune at max plays C4 = 262 Hz).
const BASE_MIDI = 36;

// Tune knob (0..127, centre 64) scales frequency linearly: ×0.5 at 0, ×1 at
// 64, ×2 at 127. Fitted to a ReBirth recording at tune 42 and 127.
function tuneCents(knob) {
  const u = knob * 127 - 64;
  const ratio = u >= 0 ? 1 + u / 63 : 1 + u / 128;
  return 1200 * Math.log2(ratio);
}
const GATE = 0.55; // fraction of a step the gate stays open
const GLIDE = 0.035; // slide time constant, seconds
const MAX_CUTOFF = 14000; // keep cutoff + envelope sweep safely below Nyquist
const CUTOFF_MIN = 300;
const CUTOFF_OCTAVES = 5.5;
const ENV_DEPTH = 4200; // cents of filter sweep at full env mod

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

// Freeze a param at its value at `t` and drop later events. Firefox lacks
// cancelAndHoldAtTime; there the following setTarget ramps from the last event.
export function hold(param, t) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
  else param.cancelScheduledValues(t);
}

export class BassVoice {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.f1 = ctx.createBiquadFilter();
    this.f2 = ctx.createBiquadFilter();
    for (const f of [this.f1, this.f2]) f.type = 'lowpass';
    this.f1.Q.value = -3; // Butterworth (Q is in dB for lowpass)
    this.env = ctx.createConstantSource();
    this.env.offset.value = 0;
    this.env.connect(this.f1.detune);
    this.env.connect(this.f2.detune);
    this.vca = ctx.createGain();
    this.vca.gain.value = 0;
    this.level = ctx.createGain();
    // Like the hardware's output coupling, the low octave's fundamental is thinned out
    // (ReBirth renders show sub notes ~8 dB lower than an unfiltered saw).
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = 55;
    lowCut.Q.value = 0.6;
    this.osc.connect(this.f1).connect(this.f2).connect(this.vca).connect(this.level).connect(lowCut).connect(out);
    this.osc.start();
    this.env.start();
    this.sliding = false;
  }

  // Continuous controls. `set(param, value)` smooths and skips unchanged values.
  setParams(p, set) {
    // Fitted to a ReBirth recording: the knob spans ~300 Hz to ~13 kHz.
    const cutoff = CUTOFF_MIN * 2 ** (p.cutoff * CUTOFF_OCTAVES);
    this.cutoff = cutoff;
    set(this.f1.frequency, cutoff);
    set(this.f2.frequency, cutoff);
    set(this.f2.Q, -3 + p.resonance * 22);
    set(this.osc.detune, tuneCents(p.tuning));
    // Resonance peaks add a lot of energy; trim so the knob doesn't double as volume.
    // Overall level calibrated against ReBirth renders (bass sits ~10 dB above v1).
    set(this.level.gain, (p.volume * p.volume * 2.2) / (1 + p.resonance * 1.5));
    const type = p.waveform >= 0.5 ? 'square' : 'sawtooth';
    if (this.osc.type !== type) this.osc.type = type;
  }

  step(s, next, t, stepDur, p) {
    if (!s.gate) {
      if (this.sliding) this.release(t);
      return;
    }
    // A tie holds the previous note: no new pitch, no retrigger, gate stays open.
    if (s.tie && this.holding) {
      this.holding = !!next.tie;
      if (!this.holding) this.vca.gain.setTargetAtTime(0, t + stepDur * GATE, 0.006);
      return;
    }
    const freq = this.osc.frequency;
    const hz = midiToHz(BASE_MIDI + s.note + s.octave * 12);
    if (this.sliding) {
      freq.setTargetAtTime(hz, t, GLIDE);
    } else {
      freq.cancelScheduledValues(t);
      freq.setValueAtTime(hz, t);
      this.trigger(t, s.accent, p);
    }
    // A slide into a following note holds the gate and skips the retrigger.
    this.sliding = s.slide && next.gate && !next.tie;
    this.holding = !!next.tie;
    if (!this.sliding && !this.holding) this.vca.gain.setTargetAtTime(0, t + stepDur * GATE, 0.006);
  }

  trigger(t, accent, p) {
    const acc = accent ? p.accent : 0;
    const headroom = 1200 * Math.log2(MAX_CUTOFF / this.cutoff);
    const peak = Math.min(headroom, p.envmod * ENV_DEPTH + acc * 2400); // cents above cutoff
    const decay = accent ? 0.2 : 0.2 + p.decay * p.decay * 1.8; // ~ -60 dB time
    const env = this.env.offset;
    env.cancelScheduledValues(t);
    env.setValueAtTime(peak, t);
    env.setTargetAtTime(0, t + 0.002, decay / 6.9);

    // Every envelope starts from an explicit value: setTarget right after a
    // cancel has no defined start in some implementations and can explode.
    // The previous gate closed ≥ 40 ms ago (≈ 7 time constants), so 0 is exact enough.
    const gain = this.vca.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(0, t);
    gain.linearRampToValueAtTime(1 + acc * 0.9, t + 0.003);
    gain.setTargetAtTime(0.55 + acc * 0.4, t + 0.012, 0.6);
  }

  release(t) {
    this.sliding = false;
    hold(this.vca.gain, t);
    this.vca.gain.setTargetAtTime(0, t, 0.008);
  }
}
