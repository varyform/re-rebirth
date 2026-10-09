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
import { KITS, playHit } from './drums.js';
import { loadCompressor } from './compressor.js';
import { createDelay, DIST, distDrive, foldCurve, INSERTS, InsertChain, PCF_TYPES, softClipCurve, whiteNoise } from './effects.js';
import { PCF_SLOTS, PCF_WAVE_COUNT, PCF_WAVES } from './pcf-waves.js';

const BASS_KNOBS = ['tuning', 'cutoff', 'resonance', 'envmod', 'decay', 'accent', 'volume', 'waveform'];
export const DELAY_STEPS = 32;
const MAX_SWING = 0.42; // fraction of a step that off-beats move at full shuffle
const METER_RANGE_DB = 48;
const VU_REF_DB = 16; // dBFS RMS that reads 0 VU
const SPECTRUM_BANDS = 28;
const MAX_FILTER_HZ = 14000;
// Pan knob offset -> equal-power pan position, clamped at the ends. Fitted to
// ReBirth's per-channel exports (808 at pan 0.22 / 0.28 / 0.63 / 0.71: right minus
// left -14.5 / -7.9 / +4.0 / +7.9 dB) and a test song panned hard left (no leak).
const PAN_WIDTH = 1.2;
const panPos = (knob) => Math.max(-1, Math.min(1, (knob - 0.5) * 2 * PAN_WIDTH));
// 909 per-step accent ("double power"): measured +3.3..+4.2 dB on the same voice.
const STEP_ACCENT = 1.55;
// Accent-track depth per accent-level knob. The 909's is strong: at level 32/127
// ReBirth's accented kick is ~8 dB louder (KiloMix); the 808's matched at 40/127.
const AC_DEPTH = { r808: 0.8, r909: 6 };

// Fixed per-channel gains, applied outside the song's automation (which only moves
// knobs and faders), so changing them never breaks a song.
//  INPUT_GAIN: before the channel's effects; part of the voice calibration, and it
//    changes how hard distortion / compressor are driven.
//  CHANNEL_TRIM_DB: after the effects, before pan and fader; a plain volume offset.
const INPUT_GAIN = { bass1: 1, bass2: 1, r808: 0.55, r909: 0.55 };
export const CHANNEL_TRIM_DB = { bass1: 0, bass2: 0, r808: 0, r909: 0 };

// Channel faders: linear in dB, 0.367 dB per step of 127, unity at the top
// (measured in a ReBirth export: 11.7 dB per 32 steps, 32 dB from 40 to 127).
const faderGain = (v) => (v > 0 ? 10 ** ((-0.367 * 127 * (1 - v)) / 20) : 0);
// Master fader: unresolved. A test export lost 7.4 dB from 100 to 80 (as steep as
// the channels), but full-song exports at master 97..104 sit as if the top of the
// range were much flatter; v * v fits those, and the voices were calibrated with it.
const masterGain = (v) => v * v;

// Compressor, fitted to a ReBirth export of a steady tone with the fader stepping
// through 32/64/96/127 under every threshold and amount. Levels are the export's
// RMS in dB at master 100.
// Fits all 36 quarter-bar levels within 0.12 dB RMS:
//  threshold: amplitude proportional to the knob, -14.9 dB at the top (a full-level
//    channel is just not compressed there), floored at -48.9 dB
//  amount: the ratio, 1:1 at 0 to ~45:1 at the top; soft knee, 7 dB wide
//  makeup: grows with how low the threshold sits, -2.3 dB at the top (x amount)
const COMP_TOP_DB = -14.94;
export const COMP_KNEE_DB = 7.1;
export function compCurve(threshold, amount) {
  const thresholdDb = Math.max(-48.94, 20 * Math.log10(Math.max(threshold, 1e-6)) + COMP_TOP_DB);
  const slope = 0.978 * amount ** 1.34; // 1 - 1/ratio
  const makeupDb = amount * (0.077 * (COMP_TOP_DB - thresholdDb) ** 1.57 - 2.31);
  return { thresholdDb, slope, makeupDb };
}
// Pattern filter, fitted to a ReBirth export of a bright tone through it (static
// settings, then the envelope): a 2-pole lowpass or bandpass. The frequency knob
// spans ~10 Hz to ~14 kHz, 2.5 octaves per 32 steps. Resonance raises Q (more so
// higher up) and nudges the frequency up; the lowpass's level falls with it while
// the bandpass's peak rises. Tables are at resonance 0/32/64/96/127, frequency 64.
const PCF_Q = [0.7, 1.11, 2.06, 4.7, 7.5];
const PCF_HZ_SHIFT = [0.99, 0.94, 1, 1.11, 1.17];
const PCF_LP_DB = [4.5, 2, -1.6, -4.1, -4.1];
const PCF_BP_DB = [5, 6.5, 8.2, 12.8, 16.9];
const PCF_ENV_OCTAVES = 9.5;
// Envelope time constants at decay 0/32/64/96; 127 holds.
const PCF_DECAY = [0.01, 0.025, 0.18, 0.9, 1e5];
function lerpTable(table, v, log = false) {
  const x = Math.min(1, Math.max(0, v)) * (table.length - 1);
  const i = Math.min(table.length - 2, Math.floor(x));
  const [a, b] = [table[i], table[i + 1]];
  return log ? a * (b / a) ** (x - i) : a + (b - a) * (x - i);
}
const pcfDecay = (decay) => lerpTable(PCF_DECAY, decay, true);
function pcfShape(freq, reso) {
  const octaves = (freq * 127 - 64) / 32; // from the middle, in 32-step units
  // Away from the middle, with resonance: measured at 64, 32 steps either way.
  const r = Math.min(1, reso / 0.5);
  const up = r * Math.max(0, Math.min(1, octaves));
  const down = r * Math.max(0, Math.min(1, -octaves));
  return {
    hz: Math.min(MAX_FILTER_HZ, 379 * 2 ** (octaves * 2.65) * lerpTable(PCF_HZ_SHIFT, reso)),
    q: lerpTable(PCF_Q, reso, true) * Math.exp(0.82 * up - 0.5 * down),
    lpGainDb: lerpTable(PCF_LP_DB, reso) - 2.4 * up + 4 * down,
    bpGainDb: lerpTable(PCF_BP_DB, reso) + 4.7 * up - 1.4 * down,
  };
}

// The compressor's input level -> the export's dB (master 100) the curve was fitted
// on. Fitted against the export: 3.3 dB above what the gain after the master bus
// (-10 dB) predicts. ReBirth's channel compressor measured 7 dB less sensitive.
const COMP_OFFSET_DB = { master: -6.64, channel: -6.64 - 7 };
const COMP_HISTORY = 96; // gain-reduction samples (~3 s) for the panel
const COMP_TRAIL = 10;

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
    this.masterMeter = this.stereoMeter(clipper);
    this.spectrum = this.spectrumAnalyser(clipper);
    this.masterInserts = new InsertChain(ctx, this.masterBus, this.masterFader);
    this.masterFader.connect(this.volume).connect(limiter).connect(clipper).connect(ctx.destination);

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
      input.gain.value = INPUT_GAIN[id];
      // Channels run in stereo from the input on: every voice level and the pan law
      // were fitted that way (a mono input through the panner loses 3 dB).
      input.channelCount = 2;
      input.channelCountMode = 'explicit';
      post.gain.value = 10 ** (CHANNEL_TRIM_DB[id] / 20);
      const inserts = new InsertChain(ctx, input, post);
      post.connect(pan).connect(fader).connect(mute).connect(this.masterBus);
      const meter = this.stereoMeter(mute);
      mute.connect(send).connect(this.delay.in);
      this.channels[id] = { label, input, inserts, pan, fader, mute, send, meter };
    }
    // Effect activity meters: delay echoes, and each chain's distortion output.
    this.delayMeter = this.analyser();
    this.delay.out.connect(this.delayMeter);
    for (const chain of this.chains()) {
      chain.distMeter = this.analyser();
      chain.stages.dist.wet.connect(chain.distMeter);
    }
    this.fxLevels = { delay: 0, dist: 0 };

    this.bass = Object.fromEntries(BASS_IDS.map((id) => [id, new BassVoice(ctx, this.channels[id].input)]));
    this.kits = Object.fromEntries(DRUM_IDS.map((id) => [id, {}]));
    this.meterBuf = new Float32Array(512);
    this.sync();
    // The compressor is an AudioWorklet; until it loads, its stages pass audio through.
    this.ready = loadCompressor(ctx)
      .then(() => {
        for (const chain of this.chains()) chain.stages.comp.fx.attach();
        this.syncInserts();
      })
      .catch((e) => console.warn('Compressor unavailable:', e));
  }

  // Left/right peak meters on a stereo signal.
  stereoMeter(source) {
    const split = this.ctx.createChannelSplitter(2);
    source.connect(split);
    const sides = [this.analyser(), this.analyser()];
    sides.forEach((a, i) => split.connect(a, i));
    return { sides, levels: [0, 0], vu: [0, 0] };
  }

  // Spectrum of the master output in log-spaced bands from 40 Hz to 16 kHz.
  spectrumAnalyser(source) {
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);
    const binHz = this.ctx.sampleRate / analyser.fftSize;
    const edges = Array.from({ length: SPECTRUM_BANDS + 1 }, (_, b) => 40 * (16000 / 40) ** (b / SPECTRUM_BANDS));
    // Bin range per band; narrow low bands get at least one bin.
    const ranges = edges.slice(0, -1).map((f0, b) => {
      const i0 = Math.max(1, Math.round(f0 / binHz));
      return [i0, Math.max(i0, Math.round(edges[b + 1] / binHz) - 1)];
    });
    return { analyser, ranges, buf: new Float32Array(analyser.frequencyBinCount), bands: new Array(SPECTRUM_BANDS).fill(0), peaks: new Array(SPECTRUM_BANDS).fill(0) };
  }

  // state.meters.spectrum = { bands, peaks }, 0..1 over -90..-20 dB, bars falling
  // back smoothly and peak markers held a little longer.
  updateSpectrum() {
    const s = this.spectrum;
    s.analyser.getFloatFrequencyData(s.buf);
    let moved = false;
    s.ranges.forEach(([i0, i1], b) => {
      let db = -Infinity;
      for (let i = i0; i <= i1; i++) db = Math.max(db, s.buf[i]);
      const level = Math.max(0, Math.min(1, (db + 90) / 70));
      const next = Math.max(level, s.bands[b] - 0.03);
      if (Math.abs(next - s.bands[b]) > 0.01) moved = true;
      s.bands[b] = next;
      const peak = Math.max(next, s.peaks[b] - 0.006);
      if (Math.abs(peak - s.peaks[b]) > 0.001) moved = true;
      s.peaks[b] = peak;
    });
    this.state.meters.spectrum = s;
    return moved;
  }

  // Master VU needles, state.meters.vu = [left, right] as needle travel 0..1:
  // RMS with ~300 ms ballistics, 0 VU = -16 dBFS RMS, scale -20..+3 VU laid out
  // linear in amplitude like a real VU face (0 VU at ~70% of the travel).
  updateVu() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.vuTime ?? now)) / 1000);
    this.vuTime = now;
    const k = 1 - Math.exp(-dt / 0.3);
    const meter = this.masterMeter;
    let moved = false;
    meter.vu = meter.sides.map((a, i) => {
      a.getFloatTimeDomainData(this.meterBuf);
      let sum = 0;
      for (const s of this.meterBuf) sum += s * s;
      const vu = 10 * Math.log10(sum / this.meterBuf.length + 1e-12) + VU_REF_DB;
      const target = Math.max(0, Math.min(1, (10 ** (vu / 20) - 0.1) / (10 ** (3 / 20) - 0.1)));
      const next = meter.vu[i] + (target - meter.vu[i]) * k;
      if (Math.abs(next - meter.vu[i]) > 0.002) moved = true;
      return next;
    });
    this.state.meters.vu = meter.vu;
    return moved;
  }

  chains() {
    return [...Object.values(this.channels).map((c) => c.inserts), this.masterInserts];
  }

  analyser() {
    const a = this.ctx.createAnalyser();
    a.fftSize = 512;
    return a;
  }

  // Smoothly move an AudioParam, skipping values that haven't changed. While a
  // step is being scheduled (ahead of the clock), its automation lands on the
  // step's time rather than now.
  set = (param, value, tau = 0.012) => {
    if (this.last.get(param) === value) return;
    this.last.set(param, value);
    param.setTargetAtTime(value, this.at ?? this.ctx.currentTime, tau);
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
      set(ch.pan.pan, panPos(g(`mixer.${id}.pan`)));
      set(ch.fader.gain, faderGain(g(`mixer.${id}.level`)));
      // Measured: send 64 echoes 5.1 dB below send 127, close to linear amplitude.
      set(ch.send.gain, g(`mixer.${id}.delay`));
      const audible = state.on01(`${id}.on`) && !state.on01(`mixer.${id}.mute`) && (!anySolo || state.on01(`mixer.${id}.solo`));
      set(ch.mute.gain, audible ? 1 : 0, 0.005);
    }
    set(this.masterFader.gain, masterGain(g('mixer.master.level')));
    set(this.volume.gain, g('master.volume') ** 2 * 0.8);

    const d = this.delay;
    set(d.in.gain, state.on01('fx.delay.on') ? 1 : 0, 0.01);
    const steps = state.choice('fx.delay.steps', DELAY_STEPS) + 1;
    // Steps count sixteenths, or eighth-note triplets (4/3 of a sixteenth).
    const unit = this.stepDuration() * (state.on01('fx.delay.triplet') ? 4 / 3 : 1);
    set(d.delay.delayTime, Math.min(11.9, steps * unit), 0.05);
    // Each repeat is `feedback` times the last: -6 dB at 64, endless at 127.
    set(d.feedback.gain, g('fx.delay.feedback'));
    set(d.pan.pan, panPos(g('fx.delay.pan')));
    // At full send an echo is 1.8 dB below the dry note (return knob at its default).
    set(this.delayReturn.gain, g('mixer.delayReturn') * 1.48);

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
        chain.setActive(key, on, this.ctx.currentTime);
        set(chain.stages[key].wet.gain, on ? 1 : 0, 0.01);
        set(chain.stages[key].dry.gain, on ? 0 : 1, 0.01);
      }
    }

    const drive = distDrive(g('fx.dist.amount'));
    const shape = Math.round(g('fx.dist.shape') * 127) / 127;
    const folds = shape > 0;
    if (folds && shape !== this.foldShape) {
      this.foldShape = shape;
      this.foldCurve = foldCurve(shape);
    }
    const curve = compCurve(g('fx.comp.threshold'), g('fx.comp.amount'));
    const lowpass = state.on01('fx.pcf.mode');
    const type = PCF_TYPES[lowpass ? 1 : 0];
    const pcf = pcfShape(g('fx.pcf.freq'), g('fx.pcf.reso'));
    for (const chain of chains) {
      // Shaper inputs clamp at +-1, so the drive gains scale to the clip levels.
      const dist = chain.stages.dist.fx;
      if (folds && dist.fold.curve !== this.foldCurve) dist.fold.curve = this.foldCurve;
      set(dist.drive.clip.gain, drive / (DIST.clip * DIST.ref));
      set(dist.drive.fold.gain, drive / (DIST.foldClip * DIST.ref));
      set(dist.mix.clip.gain, folds ? 0 : DIST.clip * DIST.ref);
      set(dist.mix.fold.gain, folds ? DIST.ref : 0);
      const comp = chain.stages.comp.fx.node?.parameters;
      if (comp) {
        set(comp.get('thresholdDb'), curve.thresholdDb);
        set(comp.get('kneeDb'), COMP_KNEE_DB);
        set(comp.get('slope'), curve.slope);
        set(comp.get('makeupDb'), curve.makeupDb);
        set(comp.get('offsetDb'), chain === this.masterInserts ? COMP_OFFSET_DB.master : COMP_OFFSET_DB.channel);
      }
      const filter = chain.stages.pcf.fx.filter;
      if (filter.type !== type) filter.type = type;
      set(filter.frequency, pcf.hz);
      set(filter.Q, lowpass ? 20 * Math.log10(pcf.q) : pcf.q); // Q is in dB for lowpass
      set(chain.stages.pcf.fx.makeup.gain, 10 ** ((lowpass ? pcf.lpGainDb : pcf.bpGainDb) / 20));
    }
  }

  // positions: { deviceId: step index within its current pattern }
  playStep(positions, time, stepDur) {
    const { state } = this;
    this.at = time;
    this.sync();
    this.at = null;
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
    const accent = state.drumTrack(id, 'ac', pattern)[pos] ? 1 + state.get(`${id}.ac.level`) * AC_DEPTH[id] : 1;
    for (const [track, [group, voice]] of Object.entries(KITS[id])) {
      if (only && track !== only) continue;
      const hit = only ? HIT.on : state.drumTrack(id, track, pattern)[pos];
      if (!hit) continue;
      const stepAccent = id === 'r909' && hit === HIT.accent ? STEP_ACCENT : 1;
      const P = (k) => state.get(`${id}.${group}.${k}`);
      const v = { ctx: this.ctx, out: this.channels[id].input, noise: this.noise, kit: this.kits[id], t, acc: accent * stepAccent };
      if (id === 'r909' && hit === HIT.flam) {
        playHit(voice, { ...v, acc: v.acc * 0.5 }, P);
        v.t += 0.006 + state.get('r909.ac.flam') * 0.03;
      }
      playHit(voice, v, P);
    }
  }

  // Pattern-controlled filter: the wave sets a cutoff kick per step, which decays.
  pcfStep(positions, time, stepDur) {
    const { state } = this;
    const chain = this.pcfChain();
    if (!chain) return;
    const target = CHANNELS[state.choice('fx.pcf.target', PCF_TARGETS.length) - 1][0];
    const wave = PCF_WAVES[state.choice('fx.pcf.wave', PCF_WAVE_COUNT)];
    const step = (positions[target] ?? 0) % (PCF_SLOTS / 2);
    // Measured in a ReBirth export: each half step either sets the envelope to
    // amount x value (up to 9.5 octaves above the frequency knob) or lets it keep
    // falling, exponentially in octaves at the decay knob's rate.
    const detune = chain.stages.pcf.fx.filter.detune;
    const tau = pcfDecay(state.get('fx.pcf.decay'));
    [0, 1].forEach((half) => {
      const value = wave[step * 2 + half];
      if (value === null) return;
      const t = time + (half * stepDur) / 2;
      detune.cancelScheduledValues(t);
      detune.setValueAtTime(1200 * PCF_ENV_OCTAVES * value * state.get('fx.pcf.amount'), t);
      detune.setTargetAtTime(0, t, tau);
    });
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
    // state.meters[channel id | 'master'] = [left, right], 0..1
    const readStereo = (meter) => {
      meter.levels = meter.sides.map((a, i) => read(a, meter.levels[i]));
      return meter.levels;
    };
    for (const [id, ch] of Object.entries(this.channels)) this.state.meters[id] = readStereo(ch.meter);
    this.state.meters.master = readStereo(this.masterMeter);
    if (this.updateVu()) changed = true;
    if (this.updateSpectrum()) changed = true;
    return this.updateFxMeters(read) || changed;
  }

  // Effect activity for the panels: compressor gain reduction (dB), delay echo and
  // distortion output levels (0..1), and the pattern filter's live cutoff.
  updateFxMeters(read) {
    const { state } = this;
    const fx = (state.meters.fx ??= {});
    const before = JSON.stringify(fx);
    this.fxLevels.delay = read(this.delayMeter, this.fxLevels.delay);
    fx.delay = this.fxLevels.delay;
    const distChains = state.on01('fx.dist.on') ? CHANNELS.filter(([id]) => state.on01(`mixer.${id}.dist`)).map(([id]) => this.channels[id].inserts) : [];
    let dist = 0;
    for (const chain of distChains) dist = Math.max(dist, read(chain.distMeter, 0));
    this.fxLevels.dist = Math.max(dist, this.fxLevels.dist - 0.025);
    fx.dist = this.fxLevels.dist;
    // Compressor: detected level and gain (export dB, as the curve), and ~30 times
    // a second a sample for the panel's moving trace and the dot's trail.
    const comp = this.compChain();
    const meter = comp?.stages.comp.fx.meter;
    const heard = meter && meter.level > -80;
    fx.compReduction = meter ? Math.min(0, meter.gain - meter.makeup) : 0;
    fx.compLevel = heard ? Math.round(meter.level * 4) / 4 : null;
    fx.compGain = meter ? Math.round(meter.gain * 4) / 4 : 0;
    const now = performance.now();
    this.compViz ??= { at: 0, history: new Array(COMP_HISTORY).fill(0), trail: [] };
    const viz = this.compViz;
    if (now - viz.at > 33) {
      viz.at = now;
      viz.history.push(Math.round(-fx.compReduction * 2) / 2);
      viz.history.shift();
      viz.trail.push(heard ? [fx.compLevel, fx.compGain] : null);
      if (viz.trail.length > COMP_TRAIL) viz.trail.shift();
    }
    fx.compHistory = viz.history;
    fx.compTrail = viz.trail.every((p) => p === null) ? [] : viz.trail;
    const pcf = this.pcfChain();
    const filter = pcf?.stages.pcf.fx.filter;
    fx.pcfHz = filter ? Math.min(MAX_FILTER_HZ, filter.frequency.value * 2 ** (filter.detune.value / 1200)) : null;
    // Round so idle meters don't trigger redraws every frame.
    fx.compReduction = Math.round(fx.compReduction * 2) / 2;
    if (fx.pcfHz !== null) fx.pcfHz = Math.round(fx.pcfHz);
    return JSON.stringify(fx) !== before;
  }
}
