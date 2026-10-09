// Shared pieces for effect test songs: Bass Line 1 is the only source, one
// setting per bar, every setting automated so each bar stands on its own.
// Knob values are ReBirth's 0..127.
import { BAR, writeRbs } from './rbs-writer.mjs';

const STEPS = (fn) => Array.from({ length: 16 }, (_, i) => fn(i));

export const PATTERNS = { drone: 0, note: 1, empty: 2, pulses: 3 };
const patterns = [];
patterns[PATTERNS.drone] = { steps: STEPS(() => ({ note: 0, slide: true })) }; // one held C, 65.4 Hz
patterns[PATTERNS.note] = { steps: STEPS((i) => (i === 0 ? { note: 0 } : { rest: true })) };
patterns[PATTERNS.empty] = { steps: STEPS(() => ({ rest: true })) };
patterns[PATTERNS.pulses] = { steps: STEPS(() => ({ note: 0 })) }; // a short note every step: transients

// Automatable settings: key -> [track, controller id] (docs/RBS42.txt, corrected
// where ReBirth's exports disagree with it).
const KEYS = {
  'bass1.pattern': ['bass1', 1],
  'bass1.tune': ['bass1', 2],
  'bass1.cutoff': ['bass1', 3],
  'bass1.resonance': ['bass1', 4],
  'bass1.envmod': ['bass1', 5],
  'bass1.decay': ['bass1', 6],
  'bass1.accent': ['bass1', 7],
  'bass1.waveform': ['bass1', 8],
  'mixer.comp': ['mixer', 1], // 0 off, 1 master, 2 bass line 1
  'mixer.pcf': ['mixer', 2], // 0 off, 1 bass line 1 (not 2 as documented)
  'mixer.bass1.level': ['mixer', 6],
  'mixer.bass1.pan': ['mixer', 7],
  'mixer.bass1.delay': ['mixer', 8],
  'mixer.bass1.dist': ['mixer', 9],
  'delay.on': ['delay', 0],
  'delay.steps': ['delay', 1],
  'delay.triplet': ['delay', 2], // 0 eighth-note triplets, 1 sixteenths (measured)
  'delay.feedback': ['delay', 3],
  'delay.pan': ['delay', 4],
  'dist.on': ['dist', 0],
  'dist.amount': ['dist', 1],
  'dist.shape': ['dist', 2],
  'pcf.on': ['pcf', 0],
  'pcf.freq': ['pcf', 1],
  'pcf.reso': ['pcf', 2],
  'pcf.amount': ['pcf', 3],
  'pcf.wave': ['pcf', 4],
  'pcf.decay': ['pcf', 5],
  'pcf.mode': ['pcf', 6], // 0 bandpass, 1 lowpass
  'comp.on': ['comp', 0],
  'comp.amount': ['comp', 1],
  'comp.threshold': ['comp', 2],
};

// Everything off, a dark drone (cutoff 0: few harmonics) at `level`.
export const base = (level) => ({
  'bass1.pattern': PATTERNS.drone,
  'bass1.tune': 64,
  'bass1.cutoff': 0,
  'bass1.resonance': 0,
  'bass1.envmod': 0,
  'bass1.decay': 0,
  'bass1.accent': 0,
  'bass1.waveform': 0,
  'mixer.comp': 0,
  'mixer.pcf': 0,
  'mixer.bass1.level': level,
  'mixer.bass1.pan': 64,
  'mixer.bass1.delay': 0,
  'mixer.bass1.dist': 0,
  'delay.on': 0,
  'delay.steps': 3,
  'delay.triplet': 0,
  'delay.feedback': 0,
  'delay.pan': 64,
  'dist.on': 0,
  'dist.amount': 64,
  'dist.shape': 64,
  'pcf.on': 0,
  'pcf.freq': 64,
  'pcf.reso': 64,
  'pcf.amount': 0,
  'pcf.wave': 0,
  'pcf.decay': 64,
  'pcf.mode': 1,
  'comp.on': 0,
  'comp.amount': 64,
  'comp.threshold': 64,
});

export const dark = { 'bass1.cutoff': 0 };
export const bright = { 'bass1.cutoff': 127 }; // rich spectrum: shows a filter's response
export const LP = 1;
export const BP = 0;
export const dist = (amount, shape) => ({ 'dist.on': 1, 'mixer.bass1.dist': 1, 'dist.amount': amount, 'dist.shape': shape });
export const comp = (amount, threshold, device = 1) => ({ 'comp.on': 1, 'mixer.comp': device, 'comp.amount': amount, 'comp.threshold': threshold });
export const pcf = (mode, freq, reso, more = {}) => ({ 'pcf.on': 1, 'mixer.pcf': 1, 'pcf.mode': mode, 'pcf.freq': freq, 'pcf.reso': reso, ...more });
export const delay = (steps, feedback, more = {}) => ({ 'delay.on': 1, 'mixer.bass1.delay': 127, 'delay.steps': steps, 'delay.feedback': feedback, ...more });
// A short note, then empty bars for the echoes.
export const ping = (set, bars = 1) => [
  { set: { ...set, 'bass1.pattern': PATTERNS.note, 'bass1.cutoff': 64 } },
  ...Array.from({ length: bars - 1 }, () => ({ set: { ...set, 'bass1.pattern': PATTERNS.empty, 'bass1.cutoff': 64 } })),
];

// sections: [[title, [{ set: {...}, events: [[tick offset, key, value]] }]]]
// Returns the .rbs bytes and a printable list of where each section starts.
export function buildSong({ title, sections, level, masterLevel }) {
  const tracks = { mixer: [], bass1: [[0, 0, 1]], delay: [], dist: [], pcf: [], comp: [] };
  const cur = {};
  const emit = (tick, key, value) => {
    if (cur[key] === value) return;
    cur[key] = value;
    const [track, id] = KEYS[key];
    tracks[track].push([tick, id, value]);
  };
  const lines = [];
  let bar = 0;
  for (const [name, bars] of sections) {
    lines.push(`  bar ${String(bar + 1).padStart(3)}: ${name}`);
    for (const b of bars) {
      for (const [key, value] of Object.entries({ ...base(level), ...b.set })) emit(bar * BAR, key, value);
      for (const [offset, key, value] of b.events ?? []) emit(bar * BAR + offset, key, value);
      bar++;
    }
  }
  tracks.bass1.push([bar * BAR, 0, 0]); // switch off: one silent bar for tails, and the song's end

  const bytes = writeRbs({
    title,
    text: `Bass Line 1 through the effects, one setting per bar (${bar} bars at 120 BPM). Export the whole song for calibration.`,
    tempo: 120,
    bars: bar + 1,
    masterLevel,
    mixer: { bass1: { level }, bass2: { on: 0 }, r808: { on: 0 }, r909: { on: 0 } },
    bass1: { on: 1, pattern: 0, knobs: { tune: 64, cutoff: 0, resonance: 0, envmod: 0, decay: 0, accent: 0 }, waveform: 0, patterns },
    bass2: { on: 0 },
    tracks: { ...tracks, bass2: [[0, 0, 0]] },
  });
  return { bytes, bars: bar + 1, summary: lines.join('\n') };
}
