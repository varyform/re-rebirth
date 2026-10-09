#!/usr/bin/env node
// Writes a ReBirth test song for measuring the bass line: only Bass Line 1 plays,
// effects off, one setting per bar so every bar can be measured on its own.
// Export the whole song from ReBirth and compare with tools/render.mjs renders.
//
//   node tools/bass-test-song.mjs [out.rbs]   (default tmp/bass-test.rbs)
//
// Sections (120 BPM, 2 s per bar); knob values are ReBirth's 0..127:
//   drone: a held low C (every step slid, one long note), env mod 0, so each bar
//          shows the filter's steady response at one cutoff / resonance
//   env:   one note per bar held for the whole bar, low cutoff, to watch the
//          filter envelope sweep down (decay, env mod, accent)
//   glide: octave slides up and down, for the slide time
//   gate:  single short notes, for the amplitude envelope and gate length
import { writeFileSync } from 'node:fs';
import { BAR, writeRbs } from './rbs-writer.mjs';

const out = process.argv[2] ?? 'tmp/bass-test.rbs';
const STEPS = (fn) => Array.from({ length: 16 }, (_, i) => fn(i));

// Patterns (index = ReBirth pattern A1 = 0, A2 = 1, ...)
const PATTERNS = {
  drone: 0, // C one octave down, all steps slid: one continuous note
  hold: 1, // one trigger per bar, held to the end of the bar
  holdAccent: 2, // the same with an accent
  glide: 3, // 8 steps low C, 8 steps an octave up, all slid
  gate: 4, // a single unslid note on step 1
};
const patterns = [];
patterns[PATTERNS.drone] = { steps: STEPS(() => ({ note: 0, octave: -1, slide: true })) };
patterns[PATTERNS.hold] = { steps: STEPS((i) => ({ note: 0, slide: i < 15 })) };
patterns[PATTERNS.holdAccent] = { steps: STEPS((i) => ({ note: 0, slide: i < 15, accent: i === 0 })) };
patterns[PATTERNS.glide] = { steps: STEPS((i) => ({ note: i < 8 ? 0 : 12, octave: -1, slide: true })) };
patterns[PATTERNS.gate] = { steps: STEPS((i) => (i === 0 ? { note: 0 } : { rest: true })) };

const STEPS9 = [0, 16, 32, 48, 64, 80, 96, 112, 127];
const FIVE = [0, 32, 64, 96, 127];
const base = { pattern: PATTERNS.drone, tune: 64, cutoff: 127, resonance: 0, envmod: 0, decay: 64, accent: 0, waveform: 0 };
const bars = [
  ...STEPS9.map((cutoff) => ({ section: 'drone saw reso 0', cutoff })),
  ...STEPS9.map((cutoff) => ({ section: 'drone saw reso 64', cutoff, resonance: 64 })),
  ...STEPS9.map((cutoff) => ({ section: 'drone saw reso 127', cutoff, resonance: 127 })),
  ...STEPS9.map((cutoff) => ({ section: 'drone square reso 0', cutoff, waveform: 1 })),
  ...FIVE.map((resonance) => ({ section: 'drone saw cutoff 64', cutoff: 64, resonance })),
  ...FIVE.map((decay) => ({ section: 'env decay (env mod 127)', pattern: PATTERNS.hold, cutoff: 16, resonance: 32, envmod: 127, decay })),
  ...FIVE.map((envmod) => ({ section: 'env mod (decay 64)', pattern: PATTERNS.hold, cutoff: 16, resonance: 32, envmod, decay: 64 })),
  ...[0, 64, 127].map((accent) => ({ section: 'accent', pattern: PATTERNS.holdAccent, cutoff: 16, resonance: 32, envmod: 64, decay: 64, accent })),
  ...[1, 2].map(() => ({ section: 'glide', pattern: PATTERNS.glide, cutoff: 127 })),
  ...[0, 127].map((decay) => ({ section: 'gate', pattern: PATTERNS.gate, cutoff: 127, decay })),
].map((b) => ({ ...base, ...b }));

// Bass Line 1 automation: every setting at bar 1, then only what changes.
const BASS_IDS = { pattern: 1, tune: 2, cutoff: 3, resonance: 4, envmod: 5, decay: 6, accent: 7, waveform: 8 };
const bass1 = [[0, 0, 1]];
let prev = {};
bars.forEach((b, i) => {
  for (const [key, id] of Object.entries(BASS_IDS)) {
    if (prev[key] !== b[key]) bass1.push([i * BAR, id, b[key]]);
  }
  prev = b;
});
const end = bars.length * BAR;
bass1.push([end, 0, 0]); // switch off: one silent bar for tails, and the song's end

// Mixer: compressor and filter unassigned; Bass Line 1 centred, no sends.
const LEVEL = 80; // headroom: ReBirth's exports clip at full levels
const mixer = [
  [0, 1, 0],
  [0, 2, 0],
  [0, 6, LEVEL],
  [0, 7, 64],
  [0, 8, 0],
  [0, 9, 0],
];

const song = {
  title: 'Re-Rebirth bass test',
  text: `Bass Line 1 alone, effects off, one setting per bar (${bars.length} bars at 120 BPM). Export the whole song for calibration.`,
  tempo: 120,
  bars: bars.length + 1,
  masterLevel: 100,
  mixer: { bass1: { level: LEVEL }, bass2: { on: 0 }, r808: { on: 0 }, r909: { on: 0 } },
  bass1: { on: 1, pattern: 0, knobs: { tune: 64, cutoff: 127, resonance: 0, envmod: 0, decay: 64, accent: 0 }, waveform: 0, patterns },
  bass2: { on: 0 },
  tracks: { mixer, bass1, bass2: [[0, 0, 0]] },
};

writeFileSync(out, writeRbs(song));
let section = '';
const sections = [];
bars.forEach((b, i) => {
  if (b.section !== section) sections.push(`  bar ${String(i + 1).padStart(2)}: ${(section = b.section)}`);
});
console.log(`${out}: ${bars.length + 1} bars at 120 BPM\n${sections.join('\n')}`);
