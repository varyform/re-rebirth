import { emptySong } from './song/song.js';

export const PATTERN_COUNT = 32; // 4 banks × 8 patterns
export const STEPS = 16;
export const BASS_IDS = ['bass1', 'bass2'];
export const DRUM_IDS = ['r808', 'r909'];
export const DEVICE_IDS = [...BASS_IDS, ...DRUM_IDS];

// Drum step values, as stored in ReBirth songs. The 909 has per-step accents
// ("double power") and flams; the 808 only uses off/on.
export const HIT = { off: 0, on: 1, accent: 2, flam: 3 };

// tie: sustain the previous (slid) note through this step instead of playing a new one.
export const emptyBassStep = () => ({ note: 0, octave: 0, accent: false, slide: false, gate: false, tie: false });
export const emptyBassPattern = () => ({ length: STEPS, shuffle: false, steps: Array.from({ length: STEPS }, emptyBassStep) });
export const emptyDrumPattern = () => ({ length: STEPS, shuffle: false, tracks: {} });

export class State {
  constructor() {
    // Continuous controls, normalised 0..1, keyed like "bass1.cutoff".
    // Defaults are registered by the controls that own them (see `define`).
    this.params = new Map();
    this.defaults = new Map();
    this.listeners = new Set();
    this.meters = {};
    this.ui = { about: false }; // app chrome, not part of a song
    this.clearSong();
  }

  // Resets everything a song file holds; knobs return to their defaults.
  clearSong() {
    this.params = new Map(this.defaults);
    this.transport = { playing: false, tempo: 120, mode: 'pattern', loop: false, rec: false, bar: 1, step: -1, positions: {} };
    this.bass = {};
    for (const id of BASS_IDS) {
      this.bass[id] = { bank: 0, pattern: 0, queued: null, selectedStep: 0, patterns: Array.from({ length: PATTERN_COUNT }, emptyBassPattern) };
    }
    this.drums = {};
    for (const id of DRUM_IDS) {
      this.drums[id] = { bank: 0, pattern: 0, queued: null, selected: 'bd', patterns: Array.from({ length: PATTERN_COUNT }, emptyDrumPattern) };
    }
    this.song = emptySong();
    this.info = { title: '', text: '', url: '', file: '' };
    this.emit('reset', {});
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, detail) {
    for (const fn of this.listeners) fn(type, detail);
  }

  define(key, value) {
    if (this.defaults.has(key)) return;
    this.defaults.set(key, value);
    if (!this.params.has(key)) this.params.set(key, value);
  }

  reset(key) {
    if (this.defaults.has(key)) this.set(key, this.defaults.get(key));
  }

  get(key) {
    return this.params.get(key) ?? 0;
  }

  // `source` lets the song recorder skip changes made by song playback itself.
  set(key, value, source = 'user') {
    const v = Math.min(1, Math.max(0, value));
    if (this.params.get(key) === v) return;
    this.params.set(key, v);
    this.emit('param', { key, value: v, source });
  }

  toggle(key) {
    this.set(key, this.get(key) >= 0.5 ? 0 : 1);
  }

  on01(key) {
    return this.get(key) >= 0.5;
  }

  // Discrete controls (targets, wave numbers, step counts) live in the same
  // 0..1 param space so they can be automated like knobs.
  choice(key, n) {
    return Math.round(this.get(key) * (n - 1));
  }

  setChoice(key, index, n, source = 'user') {
    this.set(key, n > 1 ? Math.min(n - 1, Math.max(0, index)) / (n - 1) : 0, source);
  }

  setTempo(bpm) {
    this.transport.tempo = Math.round(Math.min(300, Math.max(20, bpm)) * 10) / 10;
  }

  device(id) {
    return this.bass[id] ?? this.drums[id];
  }

  patternIndex(id) {
    const dev = this.device(id);
    return dev.bank * 8 + dev.pattern;
  }

  // While playing, user picks are queued and take effect when the clock
  // reaches the end of the current pattern (or the next bar in song mode).
  pickPattern(id, index) {
    if (this.transport.playing) this.device(id).queued = index;
    else this.selectPattern(id, index);
  }

  selectPattern(id, index, source = 'user') {
    const dev = this.device(id);
    const i = Math.min(PATTERN_COUNT - 1, Math.max(0, index));
    dev.bank = Math.floor(i / 8);
    dev.pattern = i % 8;
    dev.queued = null;
    this.emit('pattern', { id, index: i, source });
  }

  pattern(id) {
    return this.device(id).patterns[this.patternIndex(id)];
  }

  drumTrack(id, instrument, pattern = this.pattern(id)) {
    return (pattern.tracks[instrument] ??= Array(STEPS).fill(0));
  }
}
