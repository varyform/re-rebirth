import { emptySong } from './song/song.js';

export const PATTERN_COUNT = 32; // 4 banks × 8 patterns
export const STEPS = 16;
export const MAX_CHAIN = 16; // patterns in a pattern chain
export const BASS_IDS = ['bass1', 'bass2'];
export const DRUM_IDS = ['r808', 'r909'];
export const DEVICE_IDS = [...BASS_IDS, ...DRUM_IDS];

// Drum step values, as stored in ReBirth songs. The 909 has per-step accents
// ("double power") and flams; the 808 only uses off/on.
export const HIT = { off: 0, on: 1, accent: 2, flam: 3 };

// tie: sustain the previous (slid) note through this step instead of playing a new one.
export const emptyBassStep = () => ({ note: 0, octave: 0, accent: false, slide: false, gate: false, tie: false });
export const emptyBassPattern = () => ({ length: STEPS, shuffle: false, steps: Array.from({ length: STEPS }, emptyBassStep) });

// Which steps hold the note before them (a tie, shown ⁀): a rest right after a
// sounding step with SLIDE, as ReBirth stores held notes. Worked out from the
// steps, so SLIDE + rest shows as held the moment it's made. Chains: a held
// step with SLIDE holds on into the next rest. The pattern loops, so it goes
// round twice for holds over its end.
export function heldSteps(pattern) {
  const { steps, length: n } = pattern;
  const rest = (s) => !s.gate || s.tie;
  const sounding = steps.map((s) => !rest(s));
  const held = steps.map(() => false);
  for (let k = 0; k < 2 * n; k++) {
    const i = k % n;
    if (!rest(steps[i])) continue;
    const prev = (i + n - 1) % n;
    held[i] = !!steps[prev].slide && sounding[prev];
    sounding[i] = held[i];
  }
  return held;
}
export const emptyDrumPattern = () => ({ length: STEPS, shuffle: false, tracks: {} });

export class State {
  constructor() {
    // Continuous controls, normalised 0..1, keyed like "bass1.cutoff".
    // Defaults are registered by the controls that own them (see `define`).
    this.params = new Map();
    this.defaults = new Map();
    this.listeners = new Set();
    this.meters = {};
    // App chrome, not part of a song. automation: the open view's scroll/zoom, or
    // null when closed; grid: drum machines showing all lanes instead of knobs;
    // masterView: the master module's meters, 'vu' needles or 'spectrum'.
    // stage: the view ('rack' or a focus stage); show: the device the focus
    // stages show; octave: computer-keyboard step entry;
    // recMode: how a recording pass writes touched knobs, 'latch' or 'touch';
    // picker: the focus stages show the pattern picker instead of the instrument.
    this.ui = {
      about: false,
      automation: null,
      library: null,
      grid: { r808: false, r909: false },
      masterView: 'vu',
      stage: 'rack',
      show: 'bass1',

      octave: 0,
      recMode: 'latch',
      picker: false,
      brush: {}, // ARRANGE: the pattern each machine's row paints with
      arrange: null, // ARRANGE's visible range { from, span } in ticks
      export: null, // the EXPORT WAV window's choices and progress, or null
      help: false, // the keyboard shortcuts overlay ("/")
      midiWindow: null, // the MIDI window: { mode: 'menu' | 'setup' | 'done', ... }
    };
    this.clearSong();
  }

  // Resets everything a song file holds; knobs return to their defaults.
  clearSong() {
    this.params = new Map(this.defaults);
    this.transport = { playing: false, tempo: 120, mode: 'pattern', loop: false, rec: false, bar: 1, step: -1, positions: {} };
    this.bass = {};
    for (const id of BASS_IDS) {
      this.bass[id] = { bank: 0, pattern: 0, queued: null, chain: [], chainPos: 0, selectedStep: 0, patterns: Array.from({ length: PATTERN_COUNT }, emptyBassPattern) };
    }
    this.drums = {};
    for (const id of DRUM_IDS) {
      this.drums[id] = { bank: 0, pattern: 0, queued: null, chain: [], chainPos: 0, selected: 'bd', patterns: Array.from({ length: PATTERN_COUNT }, emptyDrumPattern) };
    }
    this.song = emptySong();
    // `mod`: the ReBirth mod a song was made for, empty for the standard sounds.
    // The rest is what Song Information shows (render/song-info.js).
    this.info = { title: '', text: '', url: '', file: '', mod: '', modWeb: '', modFtp: '', copyright: '', format: '' };
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
    const prev = this.params.get(key);
    if (prev === v) return;
    this.params.set(key, v);
    this.emit('param', { key, value: v, prev, source });
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
  // A single pick ends a chain.
  pickPattern(id, index) {
    this.clearChain(id);
    if (this.transport.playing) this.device(id).queued = index;
    else this.selectPattern(id, index);
  }

  // Pattern chains (pattern mode): the machine plays its chain's patterns in
  // turn, one after another, and goes round. `chainPos` is the one playing.
  // Adding to an empty chain starts it with what plays now (or is queued).
  chainPattern(id, index) {
    const dev = this.device(id);
    if (!dev.chain.length) Object.assign(dev, { chain: [dev.queued ?? this.patternIndex(id)], chainPos: 0 });
    if (dev.chain.length < MAX_CHAIN) dev.chain.push(index);
  }

  clearChain(id) {
    Object.assign(this.device(id), { chain: [], chainPos: 0 });
  }

  // Moves the chain on; returns the pattern to play next, or null without a chain.
  nextInChain(id) {
    const dev = this.device(id);
    if (dev.chain.length < 2) return null;
    dev.chainPos = (dev.chainPos + 1) % dev.chain.length;
    return dev.chain[dev.chainPos];
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
