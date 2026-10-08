import { loadDemo } from './demo.js';

const PATTERN_COUNT = 32; // 4 banks × 8 patterns
export const BASS_IDS = ['bass1', 'bass2'];
export const DRUM_IDS = ['r808', 'r909'];

const emptyBassStep = () => ({ note: 0, octave: 0, accent: false, slide: false, gate: false });
const emptyBassPattern = () => Array.from({ length: 16 }, emptyBassStep);

export class State {
  constructor() {
    // Continuous controls, normalised 0..1, keyed like "bass1.cutoff".
    this.params = new Map();
    this.transport = { playing: false, tempo: 125, mode: 'pattern', bar: 1, step: -1 };
    this.bass = {};
    for (const id of BASS_IDS) {
      this.bass[id] = { bank: 0, pattern: 0, selectedStep: 0, patterns: Array.from({ length: PATTERN_COUNT }, emptyBassPattern) };
    }
    this.drums = {};
    for (const id of DRUM_IDS) {
      this.drums[id] = { bank: 0, pattern: 0, selected: 'bd', patterns: Array.from({ length: PATTERN_COUNT }, () => ({})) };
    }
    this.fx = { distTarget: 'BASS 1', compTarget: 'MASTER', pcfTarget: 'DRUM 09', pcf: Array(16).fill(0) };
    this.meters = {};
    loadDemo(this);
  }

  define(key, value) {
    if (!this.params.has(key)) this.params.set(key, value);
  }

  get(key) {
    return this.params.get(key) ?? 0;
  }

  set(key, value) {
    this.params.set(key, Math.min(1, Math.max(0, value)));
  }

  bassPattern(id) {
    const d = this.bass[id];
    return d.patterns[d.bank * 8 + d.pattern];
  }

  drumTrack(id, instrument) {
    const d = this.drums[id];
    const pattern = d.patterns[d.bank * 8 + d.pattern];
    return (pattern[instrument] ??= Array(16).fill(false));
  }
}
