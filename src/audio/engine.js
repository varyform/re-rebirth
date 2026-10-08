// Audio graph + step playback.
//
// device -> channel in -> inserts (dist/comp/pcf) -> pan -> fader -> mute -> master
//                                                          \-> delay send -> delay -> return -> master
// master -> master inserts -> master fader -> volume -> limiter -> soft clip -> out
//
// Knob values are pulled from state once per frame (`sync`) and applied with
// short smoothing, so the UI never has to know about audio.
import { CHANNELS, COMP_TARGETS, PCF_TARGETS } from '../channels.js';
import { BASS_IDS, DRUM_IDS, HIT } from '../state.js';
import { BassVoice } from './bass-voice.js';
import { KITS } from './drums.js';
import { createDelay, distMakeup, INSERTS, InsertChain, PCF_TYPES, softClipCurve, whiteNoise } from './effects.js';
import { PCF_WAVE_COUNT, PCF_WAVES } from './pcf-waves.js';

const BASS_KNOBS = ['tuning', 'cutoff', 'resonance', 'envmod', 'decay', 'accent', 'volume', 'waveform'];
export const DELAY_STEPS = 32;
const MAX_SWING = 0.42; // fraction of a step that off-beats move at full shuffle
const METER_RANGE_DB = 48;
const MAX_FILTER_HZ = 14000;
const PAN_WIDTH = 0.5;
// 909 per-step accent ("double power"): measured +3.3..+4.2 dB on the same voice.
const STEP_ACCENT = 1.55;

// Unity at the top: song files usually run channel faders near full.
const faderGain = (v) => v * v;

export class AudioEngine {
  constructor(state) {
    this.state = state;
    this.ctx = null;
    this.last = new WeakMap();
  }

  // Must be called from a user gesture the first time (autoplay policy).
  start() {
    if (!this.ctx) this.build();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // Takes an optional context so tests can render offline.
  build(ctx = new AudioContext({ latencyHint: 'interactive' })) {
    this.ctx = ctx;
    this.noise = whiteNoise(ctx, 2);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    // The compressor-limiter lets fast transients through; the soft clipper catches them.
    const clipper = ctx.createWaveShaper();
    clipper.curve = softClipCurve();
    this.volume = ctx.createGain();
    this.masterFader = ctx.createGain();
    this.masterBus = ctx.createGain();
    this.masterMeter = this.analyser();
    this.masterInserts = new InsertChain(ctx, this.masterBus, this.masterFader);
    this.masterFader.connect(this.volume).connect(limiter).connect(clipper).connect(ctx.destination);
    clipper.connect(this.masterMeter);

    this.delay = createDelay(ctx);
    this.delayReturn = ctx.createGain();
    this.delay.out.connect(this.delayReturn).connect(this.masterBus);

    this.channels = {};
    for (const [id, label] of CHANNELS) {
      const input = ctx.createGain();
      const post = ctx.createGain();
      const pan = ctx.createStereoPanner();
      const fader = ctx.createGain();
      const mute = ctx.createGain();
      const send = ctx.createGain();
      const meter = this.analyser();
      const inserts = new InsertChain(ctx, input, post);
      post.connect(pan).connect(fader).connect(mute).connect(this.masterBus);
      mute.connect(meter);
      mute.connect(send).connect(this.delay.in);
      this.channels[id] = { label, input, inserts, pan, fader, mute, send, meter, level: 0 };
    }
    this.channels.r808.input.gain.value = 0.55;
    this.channels.r909.input.gain.value = 0.55;

    this.bass = Object.fromEntries(BASS_IDS.map((id) => [id, new BassVoice(ctx, this.channels[id].input)]));
    this.kits = Object.fromEntries(DRUM_IDS.map((id) => [id, {}]));
    this.meterBuf = new Float32Array(512);
    this.masterLevel = 0;
    this.sync();
  }

  analyser() {
    const a = this.ctx.createAnalyser();
    a.fftSize = 512;
    return a;
  }

  // Smoothly move an AudioParam, skipping values that haven't changed.
  set = (param, value, tau = 0.012) => {
    if (this.last.get(param) === value) return;
    this.last.set(param, value);
    param.setTargetAtTime(value, this.ctx.currentTime, tau);
  };

  bassParams(id) {
    return Object.fromEntries(BASS_KNOBS.map((k) => [k, this.state.get(`${id}.${k}`)]));
  }

  stepDuration() {
    return 60 / this.state.transport.tempo / 4;
  }

  // Index into CHANNELS for a routing choice, or -1 (off) / 'master'.
  compChain() {
    const { state } = this;
    if (!state.on01('fx.comp.on') || !state.on01('fx.comp.routed')) return null;
    const i = state.choice('fx.comp.target', COMP_TARGETS.length);
    return i === 0 ? this.masterInserts : this.channels[CHANNELS[i - 1][0]].inserts;
  }

  pcfChain() {
    const { state } = this;
    if (!state.on01('fx.pcf.on')) return null;
    const i = state.choice('fx.pcf.target', PCF_TARGETS.length);
    return i === 0 ? null : this.channels[CHANNELS[i - 1][0]].inserts;
  }

  sync() {
    if (!this.ctx) return;
    const { state, set } = this;
    const g = (k) => state.get(k);

    for (const id of BASS_IDS) this.bass[id].setParams(this.bassParams(id), set);

    const anySolo = CHANNELS.some(([id]) => state.on01(`mixer.${id}.solo`));
    for (const [id, ch] of Object.entries(this.channels)) {
      // Measured against ReBirth: its pan law is a little gentler than equal-power at full width.
      set(ch.pan.pan, (g(`mixer.${id}.pan`) - 0.5) * 2 * PAN_WIDTH);
      set(ch.fader.gain, faderGain(g(`mixer.${id}.level`)));
      set(ch.send.gain, g(`mixer.${id}.delay`) ** 2);
      const audible = state.on01(`${id}.on`) && !state.on01(`mixer.${id}.mute`) && (!anySolo || state.on01(`mixer.${id}.solo`));
      set(ch.mute.gain, audible ? 1 : 0, 0.005);
    }
    set(this.masterFader.gain, faderGain(g('mixer.master.level')));
    set(this.volume.gain, g('master.volume') ** 2 * 0.8);

    const d = this.delay;
    set(d.in.gain, state.on01('fx.delay.on') ? 1 : 0, 0.01);
    const steps = state.choice('fx.delay.steps', DELAY_STEPS) + 1;
    const unit = this.stepDuration() * (state.on01('fx.delay.triplet') ? 2 / 3 : 1);
    set(d.delay.delayTime, Math.min(11.9, steps * unit), 0.05);
    set(d.feedback.gain, g('fx.delay.feedback') * 0.85);
    set(d.pan.pan, (g('fx.delay.pan') - 0.5) * 2 * PAN_WIDTH);
    set(this.delayReturn.gain, g('mixer.delayReturn') * 1.2);

    this.syncInserts();
  }

  syncInserts() {
    const { state, set } = this;
    const g = (k) => state.get(k);
    const chains = [...Object.values(this.channels).map((c) => c.inserts), this.masterInserts];
    const distOn = state.on01('fx.dist.on');
    const active = {
      dist: new Set(distOn ? CHANNELS.filter(([id]) => state.on01(`mixer.${id}.dist`)).map(([id]) => this.channels[id].inserts) : []),
      comp: new Set([this.compChain()].filter(Boolean)),
      pcf: new Set([this.pcfChain()].filter(Boolean)),
    };
    for (const key of INSERTS) {
      for (const chain of chains) {
        const on = active[key].has(chain);
        set(chain.stages[key].wet.gain, on ? 1 : 0, 0.01);
        set(chain.stages[key].dry.gain, on ? 0 : 1, 0.01);
      }
    }

    const amount = g('fx.dist.amount');
    const shape = g('fx.dist.shape');
    const drive = 0.5 + amount * amount * 12;
    const distKey = `${drive.toFixed(3)}:${shape.toFixed(3)}`;
    if (distKey !== this.distKey) {
      this.distKey = distKey;
      this.distGain = distMakeup(drive, shape);
    }

    const ca = g('fx.comp.amount');
    const lowpass = state.on01('fx.pcf.mode');
    const type = PCF_TYPES[lowpass ? 1 : 0];
    const reso = g('fx.pcf.reso');
    for (const chain of chains) {
      const dist = chain.stages.dist.fx;
      set(dist.drive.gain, drive);
      set(dist.mix.soft.gain, (1 - shape) * this.distGain);
      set(dist.mix.hard.gain, shape * this.distGain);
      // Fitted to a ReBirth recording: threshold spans 0 to -20 dB, and about a
      // third of the gain reduction comes back as makeup gain.
      const { comp, makeup } = chain.stages.comp.fx;
      const thresholdDb = -g('fx.comp.threshold') * 20;
      const ratio = 1 + ca * 11;
      set(comp.threshold, thresholdDb);
      set(comp.ratio, ratio);
      set(comp.attack, 0.004);
      set(comp.release, 0.15);
      set(makeup.gain, 10 ** ((-thresholdDb * (1 - 1 / ratio) * 0.3) / 20));
      const filter = chain.stages.pcf.fx.filter;
      if (filter.type !== type) filter.type = type;
      // Q is in dB for lowpass, linear for bandpass. The bandpass is fairly
      // broad: measured against ReBirth, resonance ~0.8 gives Q ~1.4.
      set(filter.Q, lowpass ? reso * 18 : 0.6 + reso);
      // A bandpass drops everything off-centre; ReBirth's keeps roughly the same loudness.
      set(chain.stages.pcf.fx.makeup.gain, lowpass ? 1 : 2.2);
    }
  }

  // positions: { deviceId: step index within its current pattern }
  playStep(positions, time, stepDur) {
    const { state } = this;
    this.sync();
    for (const id of BASS_IDS) {
      const pattern = state.pattern(id);
      const pos = positions[id];
      const t = time + this.swing(pattern, pos, stepDur);
      if (!state.on01(`${id}.on`)) {
        this.bass[id].release(t);
        continue;
      }
      const next = pattern.steps[(pos + 1) % pattern.length];
      this.bass[id].step(pattern.steps[pos], next, t, stepDur, this.bassParams(id));
    }
    for (const id of DRUM_IDS) {
      if (!state.on01(`${id}.on`)) continue;
      const pattern = state.pattern(id);
      const pos = positions[id];
      this.playDrums(id, pattern, pos, time + this.swing(pattern, pos, stepDur));
    }
    this.pcfStep(positions, time, stepDur);
  }

  swing(pattern, pos, stepDur) {
    return pattern.shuffle && pos % 2 ? stepDur * MAX_SWING * this.state.get('song.shuffle') : 0;
  }

  playDrums(id, pattern, pos, t, only = null) {
    const { state } = this;
    const accent = state.drumTrack(id, 'ac', pattern)[pos] ? 1 + state.get(`${id}.ac.level`) * 0.8 : 1;
    for (const [track, [group, voice]] of Object.entries(KITS[id])) {
      if (only && track !== only) continue;
      const hit = only ? HIT.on : state.drumTrack(id, track, pattern)[pos];
      if (!hit) continue;
      const stepAccent = id === 'r909' && hit === HIT.accent ? STEP_ACCENT : 1;
      const P = (k) => state.get(`${id}.${group}.${k}`);
      const v = { ctx: this.ctx, out: this.channels[id].input, noise: this.noise, kit: this.kits[id], t, acc: accent * stepAccent };
      if (id === 'r909' && hit === HIT.flam) {
        voice({ ...v, acc: v.acc * 0.5 }, P);
        v.t += 0.006 + state.get('r909.ac.flam') * 0.03;
      }
      voice(v, P);
    }
  }

  // Pattern-controlled filter: the wave sets a cutoff kick per step, which decays.
  pcfStep(positions, time, stepDur) {
    const { state } = this;
    const chain = this.pcfChain();
    if (!chain) return;
    const target = CHANNELS[state.choice('fx.pcf.target', PCF_TARGETS.length) - 1][0];
    const wave = PCF_WAVES[state.choice('fx.pcf.wave', PCF_WAVE_COUNT)];
    const value = wave[positions[target] ?? 0];
    // Frequency 42/127 measured at ~145 Hz centre in ReBirth renders.
    const base = Math.min(MAX_FILTER_HZ, 30 * 2 ** (state.get('fx.pcf.freq') * 7));
    const peak = Math.min(MAX_FILTER_HZ, base * 2 ** (value * state.get('fx.pcf.amount') * 4));
    const decay = stepDur * (0.2 + state.get('fx.pcf.decay') * 4);
    const f = chain.stages.pcf.fx.filter.frequency;
    f.cancelScheduledValues(time);
    f.setValueAtTime(peak, time);
    f.setTargetAtTime(base, time + 0.002, decay / 3);
  }

  stop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const voice of Object.values(this.bass)) voice.release(t);
  }

  // Preview while editing: one bass step, or one drum voice.
  auditionBass(id, step) {
    this.start();
    if (this.state.transport.playing) return;
    const t = this.ctx.currentTime + 0.01;
    this.sync();
    this.bass[id].sliding = false;
    this.bass[id].step(step, { gate: false }, t, Math.min(0.3, this.stepDuration() * 2), this.bassParams(id));
  }

  auditionDrum(id, track) {
    this.start();
    if (this.state.transport.playing) return;
    this.sync();
    this.playDrums(id, this.state.pattern(id), 0, this.ctx.currentTime + 0.01, track);
  }

  // Peak meters with falloff. Returns true when any meter visibly moved.
  updateMeters() {
    if (!this.ctx) return false;
    let changed = false;
    const read = (analyser, prev) => {
      analyser.getFloatTimeDomainData(this.meterBuf);
      let peak = 0;
      for (const s of this.meterBuf) peak = Math.max(peak, Math.abs(s));
      const db = 20 * Math.log10(peak || 1e-6);
      const level = Math.max(0, Math.min(1, (db + METER_RANGE_DB) / METER_RANGE_DB));
      const next = Math.max(level, prev - 0.025);
      if (Math.abs(next - prev) > 0.004) changed = true;
      return next;
    };
    for (const [id, ch] of Object.entries(this.channels)) {
      ch.level = read(ch.meter, ch.level);
      this.state.meters[id] = ch.level;
    }
    this.masterLevel = read(this.masterMeter, this.masterLevel);
    this.state.meters.master = this.masterLevel;
    return changed;
  }
}
