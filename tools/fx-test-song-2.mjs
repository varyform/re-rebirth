#!/usr/bin/env node
// Writes the second ReBirth effects test song: the pattern filter (round 1 routed
// it to the silent Bass Line 2), compressor timing and transients, the master
// fader, and the order of the channel effects. Same source and layout as
// tools/fx-test-song.mjs: Bass Line 1 alone, one setting per bar.
//
//   node tools/fx-test-song-2.mjs [out.rbs]   (default tmp/fx-test-2.rbs)
//
// Sections, 120 BPM, 2 s per bar:
//   dry:    dark and bright drones; with the master at 80 instead of round 1's
//           100 they give the master fader's law
//   fader:  channel fader steps 32/64/96/127 per quarter bar, no effects
//   pcf:    static (amount 0) frequency and resonance in both modes; the
//           envelope's decay and amount; amount on top of frequency; then all
//           56 waves (one per bar: the per-step shape)
//   comp:   heavy settings with mid-bar fader jumps (attack / release); a note on
//           every step instead of the drone (how it treats transients)
//   order:  pairs of channel effects on Bass Line 1
import { writeFileSync } from 'node:fs';
import { BP, bright, buildSong, comp, dark, dist, LP, PATTERNS, pcf } from './test-song.mjs';

const out = process.argv[2] ?? 'tmp/fx-test-2.rbs';
const FIVE = [0, 32, 64, 96, 127];
const LEVEL_STEPS = [8, 16, 24].map((t, i) => [t, 'mixer.bass1.level', [64, 96, 127][i]]);
const stepped = { 'mixer.bass1.level': 32 };
const UP = [[16, 'mixer.bass1.level', 127]];
const DOWN = [[16, 'mixer.bass1.level', 40]];
const jumps = (set) => [
  { set: { ...bright, ...set, 'mixer.bass1.level': 40 }, events: UP },
  { set: { ...bright, ...set, 'mixer.bass1.level': 127 }, events: DOWN },
];
const pulses = { ...bright, 'bass1.pattern': PATTERNS.pulses };
// Pattern filter envelope: from the bottom, so the sweep shows clearly.
const sweep = (more) => ({ ...bright, ...pcf(LP, 0, 64, { 'pcf.amount': 127, ...more }) });

const sections = [
  ['dry: dark, bright (master 80)', [{ set: dark }, { set: bright }]],
  ['fader: steps 32/64/96/127 per quarter bar, bright', [{ set: { ...bright, ...stepped }, events: LEVEL_STEPS }]],
  ['pcf lowpass static: freq 0..127, reso 64', FIVE.map((f) => ({ set: { ...bright, ...pcf(LP, f, 64) } }))],
  ['pcf bandpass static: freq 0..127, reso 64', FIVE.map((f) => ({ set: { ...bright, ...pcf(BP, f, 64) } }))],
  ['pcf lowpass static: freq 64, reso 0/32/96/127', [0, 32, 96, 127].map((r) => ({ set: { ...bright, ...pcf(LP, 64, r) } }))],
  ['pcf bandpass static: freq 64, reso 0/32/96/127', [0, 32, 96, 127].map((r) => ({ set: { ...bright, ...pcf(BP, 64, r) } }))],
  ['pcf lowpass wave 0, freq 0, amount 127: decay 0..127', FIVE.map((d) => ({ set: sweep({ 'pcf.decay': d }) }))],
  ['pcf lowpass wave 0, freq 0, decay 64: amount 32/64/96', [32, 64, 96].map((a) => ({ set: sweep({ 'pcf.amount': a }) }))],
  ['pcf lowpass wave 0, decay 64, amount 127: freq 64', [{ set: sweep({ 'pcf.freq': 64 }) }]],
  ['pcf bandpass wave 0, freq 0, decay 64, amount 127', [{ set: { ...sweep({}), 'pcf.mode': BP } }]],
  ['pcf waves 0..55: lowpass, freq 0, reso 64, amount 127, decay 64', Array.from({ length: 56 }, (_, w) => ({ set: sweep({ 'pcf.wave': w }) }))],
  ['comp master: amount 127, threshold 0, fader 40 -> 127, 127 -> 40', jumps(comp(127, 0))],
  ['comp master: amount 127, threshold 32, fader 40 -> 127, 127 -> 40', jumps(comp(127, 32))],
  ['comp: off / master threshold 32 / master threshold 0 (amount 127), a note every step', [{ set: pulses }, { set: { ...pulses, ...comp(127, 32) } }, { set: { ...pulses, ...comp(127, 0) } }]],
  ['order: dist (amount 96, shape 127) + pcf lowpass (freq 64, reso 127), dark', [{ set: { ...dark, ...dist(96, 127), ...pcf(LP, 64, 127) } }]],
  ['order: dist (amount 96, shape 127) + comp on bass line 1 (amount 127, threshold 32), dark', [{ set: { ...dark, ...dist(96, 127), ...comp(127, 32, 2) } }]],
  ['order: comp on bass line 1 (amount 127, threshold 32) + pcf lowpass (freq 64, reso 127), bright', [{ set: { ...bright, ...comp(127, 32, 2), ...pcf(LP, 64, 127) } }]],
];

const LEVEL = 80; // headroom: ReBirth's exports clip at full levels
const song = buildSong({ title: 'Re-Rebirth fx test 2', sections, level: LEVEL, masterLevel: 80 });
writeFileSync(out, song.bytes);
console.log(`${out}: ${song.bars} bars at 120 BPM (${Math.round((song.bars * 2) / 60)} min)\n${song.summary}`);
