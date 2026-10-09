#!/usr/bin/env node
// Writes a ReBirth test song for measuring the effects: Bass Line 1 is the only
// source (a steady drone, or a single short note for the delay), one effect
// setting per bar. Export the whole song from ReBirth and compare with
// tools/render.mjs renders.
//
//   node tools/fx-test-song.mjs [out.rbs]   (default tmp/fx-test.rbs)
//
// Sources (C, 65.4 Hz, every step slid, env mod 0, decay 0): "dark" at cutoff 0
// (few harmonics: shows a distortion's transfer curve) and "bright" at cutoff 127
// (rich spectrum: shows a filter's response). Knob values are ReBirth's 0..127.
// Sections, 120 BPM, 2 s per bar:
//   dry:   both sources without effects
//   dist:  amount x shape sweeps on the dark source, two on the bright one, and
//          the channel fader at 40 / 127 (does the fader sit before or after it?)
//   comp:  on the master, the channel fader steps 32/64/96/127 every quarter bar
//          (static curve per amount / threshold), then mid-bar jumps 40 <-> 127
//          (attack / release), then on the channel (before or after the fader?)
//   pcf:   static (amount 0) frequency / resonance in both modes, envelope decay,
//          then all 56 waves (one per bar: the per-step shape)
//   delay: a single short note; steps, triplets, feedback, send level, pan
//   order: distortion together with the pattern filter / the compressor
import { writeFileSync } from 'node:fs';
import { BAR, writeRbs } from './rbs-writer.mjs';

const out = process.argv[2] ?? 'tmp/fx-test.rbs';
const STEPS = (fn) => Array.from({ length: 16 }, (_, i) => fn(i));

const PATTERNS = { drone: 0, note: 1, empty: 2 };
const patterns = [];
patterns[PATTERNS.drone] = { steps: STEPS(() => ({ note: 0, slide: true })) };
patterns[PATTERNS.note] = { steps: STEPS((i) => (i === 0 ? { note: 0 } : { rest: true })) };
patterns[PATTERNS.empty] = { steps: STEPS(() => ({ rest: true })) };

// Automatable settings: key -> [track, controller id] (docs/RBS42.txt).
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
  'mixer.pcf': ['mixer', 2], // 0 off, 2 bass line 1
  'mixer.bass1.level': ['mixer', 6],
  'mixer.bass1.pan': ['mixer', 7],
  'mixer.bass1.delay': ['mixer', 8],
  'mixer.bass1.dist': ['mixer', 9],
  'delay.on': ['delay', 0],
  'delay.steps': ['delay', 1],
  'delay.triplet': ['delay', 2],
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

const LEVEL = 80; // headroom: ReBirth's exports clip at full levels
const base = {
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
  'mixer.bass1.level': LEVEL,
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
};

const dark = { 'bass1.cutoff': 0 };
const bright = { 'bass1.cutoff': 127 };
const dist = (amount, shape) => ({ 'dist.on': 1, 'mixer.bass1.dist': 1, 'dist.amount': amount, 'dist.shape': shape });
const comp = (amount, threshold, device = 1) => ({ 'comp.on': 1, 'mixer.comp': device, 'comp.amount': amount, 'comp.threshold': threshold });
const pcf = (mode, freq, reso, more = {}) => ({ 'pcf.on': 1, 'mixer.pcf': 2, 'pcf.mode': mode, 'pcf.freq': freq, 'pcf.reso': reso, ...more });
const delay = (steps, feedback, more = {}) => ({ 'delay.on': 1, 'mixer.bass1.delay': 127, 'delay.steps': steps, 'delay.feedback': feedback, ...more });
const LP = 1;
const BP = 0;

// Fader steps inside a bar: [tick offset, key, value]
const LEVEL_STEPS = [8, 16, 24].map((t, i) => [t, 'mixer.bass1.level', [64, 96, 127][i]]);
const stepped = { 'mixer.bass1.level': 32 };
const UP = [[16, 'mixer.bass1.level', 127]];
const DOWN = [[16, 'mixer.bass1.level', 40]];
// A short note, then empty bars for the echoes.
const ping = (set, bars = 1) => [
  { set: { ...set, 'bass1.pattern': PATTERNS.note, 'bass1.cutoff': 64 } },
  ...Array.from({ length: bars - 1 }, () => ({ set: { ...set, 'bass1.pattern': PATTERNS.empty, 'bass1.cutoff': 64 } })),
];
const FIVE = [0, 32, 64, 96, 127];

const sections = [
  ['dry: dark, bright', [{ set: dark }, { set: bright }]],
  ['dist: amount 0..127, shape 0 (1.5 mode), dark', FIVE.map((a) => ({ set: { ...dark, ...dist(a, 0) } }))],
  ['dist: amount 0..127, shape 127, dark', FIVE.map((a) => ({ set: { ...dark, ...dist(a, 127) } }))],
  ['dist: shape 1/32/64/96, amount 64, dark', [1, 32, 64, 96].map((s) => ({ set: { ...dark, ...dist(64, s) } }))],
  ['dist: amount 64, shape 0 / 127, bright', [0, 127].map((s) => ({ set: { ...bright, ...dist(64, s) } }))],
  ['dist: amount 64 shape 64, fader 40 / 127, dark', [40, 127].map((l) => ({ set: { ...dark, ...dist(64, 64), 'mixer.bass1.level': l } }))],
  ['comp: off, fader steps 32/64/96/127 per quarter bar, bright', [{ set: { ...bright, ...stepped }, events: LEVEL_STEPS }]],
  ['comp master: threshold 0..127, amount 127, fader steps', FIVE.map((t) => ({ set: { ...bright, ...stepped, ...comp(127, t) }, events: LEVEL_STEPS }))],
  ['comp master: amount 0/32/64/96, threshold 64, fader steps', [0, 32, 64, 96].map((a) => ({ set: { ...bright, ...stepped, ...comp(a, 64) }, events: LEVEL_STEPS }))],
  ['comp: off, fader 40 -> 127 mid-bar, 127 -> 40 mid-bar', [{ set: { ...bright, 'mixer.bass1.level': 40 }, events: UP }, { set: { ...bright, 'mixer.bass1.level': 127 }, events: DOWN }]],
  ['comp master: amount 127 threshold 127, fader 40 -> 127, 127 -> 40', [{ set: { ...bright, ...comp(127, 127), 'mixer.bass1.level': 40 }, events: UP }, { set: { ...bright, ...comp(127, 127), 'mixer.bass1.level': 127 }, events: DOWN }]],
  ['comp on bass line 1: amount 127 threshold 96, fader steps', [{ set: { ...bright, ...stepped, ...comp(127, 96, 2) }, events: LEVEL_STEPS }]],
  ['pcf lowpass static: freq 0..127, reso 64, bright', FIVE.map((f) => ({ set: { ...bright, ...pcf(LP, f, 64) } }))],
  ['pcf bandpass static: freq 0..127, reso 64, bright', FIVE.map((f) => ({ set: { ...bright, ...pcf(BP, f, 64) } }))],
  ['pcf lowpass static: freq 64, reso 0 / 127', [0, 127].map((r) => ({ set: { ...bright, ...pcf(LP, 64, r) } }))],
  ['pcf bandpass static: freq 64, reso 0 / 127', [0, 127].map((r) => ({ set: { ...bright, ...pcf(BP, 64, r) } }))],
  ['pcf lowpass wave 0, freq 0, reso 64, amount 127: decay 0 / 64 / 127', [0, 64, 127].map((d) => ({ set: { ...bright, ...pcf(LP, 0, 64, { 'pcf.amount': 127, 'pcf.decay': d }) } }))],
  ['pcf lowpass wave 0, amount 64, decay 64', [{ set: { ...bright, ...pcf(LP, 0, 64, { 'pcf.amount': 64 }) } }]],
  ['pcf waves 0..55: lowpass, freq 0, reso 64, amount 127, decay 64', Array.from({ length: 56 }, (_, w) => ({ set: { ...bright, ...pcf(LP, 0, 64, { 'pcf.amount': 127, 'pcf.wave': w }) } }))],
  ['delay: steps 3, feedback 0', ping(delay(3, 0))],
  ['delay: steps 3, feedback 64 (2 bars)', ping(delay(3, 64), 2)],
  ['delay: steps 3, feedback 96 (2 bars)', ping(delay(3, 96), 2)],

  ['delay: steps 4 triplets, feedback 0', ping(delay(4, 0, { 'delay.triplet': 1 }))],
  ['delay: steps 8, feedback 0 (2 bars)', ping(delay(8, 0), 2)],
  ['delay: steps 3, feedback 0, send 64', ping(delay(3, 0, { 'mixer.bass1.delay': 64 }))],
  ['delay: steps 3, feedback 64, delay pan 0 (2 bars)', ping(delay(3, 64, { 'delay.pan': 0 }), 2)],
  // Last: at full feedback the echoes may never die out.
  ['delay: steps 3, feedback 127 (3 bars)', ping(delay(3, 127), 3)],
  ['order: dist (amount 96, shape 127) + pcf lowpass (freq 64, reso 127), dark', [{ set: { ...dark, ...dist(96, 127), ...pcf(LP, 64, 127) } }]],
  ['order: dist (amount 96, shape 127) + comp on bass line 1 (amount 127, threshold 96), dark', [{ set: { ...dark, ...dist(96, 127), ...comp(127, 96, 2) } }]],
];

// Build the automation: every setting at bar 1, then only what changes.
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
for (const [title, bars] of sections) {
  lines.push(`  bar ${String(bar + 1).padStart(3)}: ${title}`);
  for (const b of bars) {
    const state = { ...base, ...b.set };
    for (const [key, value] of Object.entries(state)) emit(bar * BAR, key, value);
    for (const [offset, key, value] of b.events ?? []) emit(bar * BAR + offset, key, value);
    bar++;
  }
}
tracks.bass1.push([bar * BAR, 0, 0]); // switch off: one silent bar for tails, and the song's end

const song = {
  title: 'Re-Rebirth fx test',
  text: `Bass Line 1 through the effects, one setting per bar (${bar} bars at 120 BPM). Export the whole song for calibration.`,
  tempo: 120,
  bars: bar + 1,
  masterLevel: 100,
  mixer: { bass1: { level: LEVEL }, bass2: { on: 0 }, r808: { on: 0 }, r909: { on: 0 } },
  bass1: { on: 1, pattern: 0, knobs: { tune: 64, cutoff: 0, resonance: 0, envmod: 0, decay: 0, accent: 0 }, waveform: 0, patterns },
  bass2: { on: 0 },
  tracks: { ...tracks, bass2: [[0, 0, 0]] },
};

writeFileSync(out, writeRbs(song));
console.log(`${out}: ${bar + 1} bars at 120 BPM (${Math.round(((bar + 1) * 2) / 60)} min)\n${lines.join('\n')}`);
