// Audio graph + step playback.
//
// device -> channel in -> inserts (dist/comp/pcf) -> pan -> fader -> mute -> master
//                                                          \-> delay send -> delay -> return -> master
// master -> master inserts -> master fader -> volume -> safety limiter -> out
//
// Knob values are pulled from state once per frame (`sync`) and applied with
// short smoothing, so the UI never has to know about audio.
import { CHANNELS } from '../channels.js';
import { BASS_IDS, DRUM_IDS } from '../state.js';
import { BassVoice } from './bass-voice.js';
import { KITS } from './drums.js';
import { createDelay, distortionCurve, INSERTS, InsertChain, PCF_TYPES, softClipCurve, whiteNoise } from './effects.js';

const BASS_KNOBS = ['tuning', 'cutoff', 'resonance', 'envmod', 'decay', 'accent', 'volume', 'waveform'];
const SHUFFLE = 0.33; // fraction of a step that off-beats are pushed late
const METER_RANGE_DB = 48;

const faderGain = (v) => (v / 0.75) ** 2;

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
    this.volume = ctx.createGain();
    this.masterFader = ctx.createGain();
    this.masterBus = ctx.createGain();
    this.masterMeter = this.analyser();
    this.masterInserts = new InsertChain(ctx, this.masterBus, this.masterFader);
    // The compressor-limiter lets fast transients through; the tanh stage catches them.
    const clipper = ctx.createWaveShaper();
    clipper.curve = softClipCurve();
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

  chainFor(label) {
    if (label === 'MASTER') return this.masterInserts;
    return Object.values(this.channels).find((c) => c.label === label)?.inserts;
  }

  bassParams(id) {
    return Object.fromEntries(BASS_KNOBS.map((k) => [k, this.state.get(`${id}.${k}`)]));
  }

  stepDuration() {
    return 60 / this.state.transport.tempo / 4;
  }

  sync() {
    if (!this.ctx) return;
    const { state, set } = this;
    const g = (k) => state.get(k);

    for (const id of BASS_IDS) this.bass[id].setParams(this.bassParams(id), set);

    const anySolo = CHANNELS.some(([id]) => g(`mixer.${id}.solo`) >= 0.5);
    for (const [id, ch] of Object.entries(this.channels)) {
      set(ch.pan.pan, (g(`mixer.${id}.pan`) - 0.5) * 2);
      set(ch.fader.gain, faderGain(g(`mixer.${id}.level`)));
      set(ch.send.gain, g(`mixer.${id}.delay`) ** 2);
      const audible = g(`mixer.${id}.mute`) < 0.5 && (!anySolo || g(`mixer.${id}.solo`) >= 0.5);
      set(ch.mute.gain, audible ? 1 : 0, 0.005);
    }
    set(this.masterFader.gain, faderGain(g('mixer.master.level')));
    set(this.volume.gain, g('master.volume') ** 2 * 0.8);

    const d = this.delay;
    const steps = 1 + Math.round(g('fx.delay.steps') * 7);
    const time = Math.min(3.9, steps * this.stepDuration());
    set(d.dl.delayTime, time, 0.05);
    set(d.dr.delayTime, time, 0.05);
    const fb = g('fx.delay.feedback') * 0.85;
    set(d.fb1.gain, fb);
    set(d.fb2.gain, fb);
    const cross = 1 - g('fx.delay.pan');
    set(d.mix.lB.gain, cross);
    set(d.mix.rB.gain, cross);
    set(this.delayReturn.gain, g('mixer.delayReturn') * 1.2);

    this.syncInserts();
  }

  syncInserts() {
    const { state, set } = this;
    const g = (k) => state.get(k);
    const chains = [...Object.values(this.channels).map((c) => c.inserts), this.masterInserts];
    const targets = { dist: state.fx.distTarget, comp: state.fx.compTarget, pcf: state.fx.pcfTarget };

    for (const key of INSERTS) {
      const active = g(`fx.${key}.on`) >= 0.5 ? this.chainFor(targets[key]) : null;
      for (const chain of chains) {
        const on = chain === active;
        set(chain.stages[key].wet.gain, on ? 1 : 0, 0.01);
        set(chain.stages[key].dry.gain, on ? 0 : 1, 0.01);
      }
    }

    const amount = g('fx.dist.amount');
    const shape = g('fx.dist.shape');
    const curveKey = `${amount.toFixed(3)}:${shape.toFixed(3)}`;
    if (curveKey !== this.curveKey) {
      this.curveKey = curveKey;
      const curve = distortionCurve(amount, shape);
      for (const chain of chains) chain.stages.dist.fx.shaper.curve = curve;
    }

    const ca = g('fx.comp.amount');
    const speed = g('fx.comp.speed');
    const type = PCF_TYPES[Math.round(g('fx.pcf.mode') * (PCF_TYPES.length - 1))];
    for (const chain of chains) {
      const { comp, makeup } = chain.stages.comp.fx;
      set(comp.threshold, -ca * 40);
      set(comp.ratio, 2 + ca * 10);
      set(comp.attack, 0.001 + (1 - speed) * 0.05);
      set(comp.release, 0.04 + (1 - speed) * 0.5);
      set(makeup.gain, 1 + ca * 1.5);
      const filter = chain.stages.pcf.fx.filter;
      if (filter.type !== type) filter.type = type;
    }
  }

  playStep(step, time, stepDur) {
    const { state } = this;
    this.sync();
    const late = (id) => (step % 2 && state.get(`${id}.shuffle`) >= 0.5 ? stepDur * SHUFFLE : 0);

    for (const id of BASS_IDS) {
      const pattern = state.bassPattern(id);
      this.bass[id].step(pattern[step], pattern[(step + 1) % 16], time + late(id), stepDur, this.bassParams(id));
    }

    for (const id of DRUM_IDS) {
      const t = time + late(id);
      const accented = state.drumTrack(id, 'ac')[step];
      const acc = accented ? 1 + state.get(`${id}.ac.level`) * 0.8 : 1;
      const v = { ctx: this.ctx, out: this.channels[id].input, noise: this.noise, kit: this.kits[id], t, acc };
      for (const [track, [group, voice]] of Object.entries(KITS[id])) {
        if (!state.drumTrack(id, track)[step]) continue;
        voice(v, (k) => state.get(`${id}.${group}.${k}`));
      }
    }

    this.pcfStep(step, time, stepDur);
  }

  // Pattern-controlled filter: each step kicks the cutoff, which then decays.
  pcfStep(step, time, stepDur) {
    const { state } = this;
    const chain = this.chainFor(state.fx.pcfTarget);
    if (!chain || state.get('fx.pcf.on') < 0.5) return;
    const f = chain.stages.pcf.fx.filter.frequency;
    const level = state.get('fx.pcf.level');
    const floor = 120;
    const peak = Math.min(14000, floor * 2 ** (state.fx.pcf[step] * level * 7.5));
    const decay = stepDur * (0.3 + state.get('fx.pcf.decay') * 6);
    f.cancelScheduledValues(time);
    f.setValueAtTime(peak, time);
    f.setTargetAtTime(floor, time + 0.002, decay / 3);
  }

  stop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const voice of Object.values(this.bass)) voice.release(t);
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
