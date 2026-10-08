// Monophonic acid bass voice. The oscillator runs continuously so slides can
// glide pitch; notes are scheduled as automation on the filter env and VCA.
//
// osc -> lowpass (flat) -> lowpass (resonant) -> VCA -> level -> out
// The filter envelope drives both filters' `detune` (cents), so the cutoff knob
// stays live on `frequency` while notes are playing.

const BASE_MIDI = 36; // C2
const GATE = 0.55; // fraction of a step the gate stays open
const GLIDE = 0.035; // slide time constant, seconds
const MAX_CUTOFF = 14000; // keep cutoff + envelope sweep safely below Nyquist

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
    this.osc.connect(this.f1).connect(this.f2).connect(this.vca).connect(this.level).connect(out);
    this.osc.start();
    this.env.start();
    this.sliding = false;
  }

  // Continuous controls. `set(param, value)` smooths and skips unchanged values.
  setParams(p, set) {
    const cutoff = 60 * 2 ** (p.cutoff * 6.5);
    this.cutoff = cutoff;
    set(this.f1.frequency, cutoff);
    set(this.f2.frequency, cutoff);
    set(this.f2.Q, -3 + p.resonance * 25);
    set(this.osc.detune, (p.tuning - 0.5) * 2400);
    // Resonance peaks add a lot of energy; trim so the knob doesn't double as volume.
    set(this.level.gain, (p.volume * p.volume * 0.7) / (1 + p.resonance * 1.5));
    const type = p.waveform >= 0.5 ? 'square' : 'sawtooth';
    if (this.osc.type !== type) this.osc.type = type;
  }

  step(s, next, t, stepDur, p) {
    if (!s.gate) {
      if (this.sliding) this.release(t);
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
    this.sliding = s.slide && next.gate;
    if (!this.sliding) this.vca.gain.setTargetAtTime(0, t + stepDur * GATE, 0.006);
  }

  trigger(t, accent, p) {
    const acc = accent ? p.accent : 0;
    const headroom = 1200 * Math.log2(MAX_CUTOFF / this.cutoff);
    const peak = Math.min(headroom, p.envmod * 4800 + acc * 2400); // cents above cutoff
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
