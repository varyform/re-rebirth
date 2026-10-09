#!/usr/bin/env node
// Writes a ReBirth test song for measuring the effects (round 1): Bass Line 1 is
// the only source (a steady drone, or a single short note for the delay), one
// effect setting per bar. Export the whole song from ReBirth and compare with
// tools/render.mjs renders. Round 2 (tools/fx-test-song-2.mjs) covers the
// pattern filter, which this round's first export missed (wrong device id).
//
//   node tools/fx-test-song.mjs [out.rbs]   (default tmp/fx-test.rbs)
//
// Sources (C, 65.4 Hz, every step slid, env mod 0, decay 0): "dark" at cutoff 0
// (few harmonics: shows a distortion's transfer curve) and "bright" at cutoff 127.
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
import { BP, bright, buildSong, comp, dark, delay, dist, LP, pcf, ping } from './test-song.mjs';

const out = process.argv[2] ?? 'tmp/fx-test.rbs';
const FIVE = [0, 32, 64, 96, 127];
// Fader steps inside a bar: [tick offset, key, value]
const LEVEL_STEPS = [8, 16, 24].map((t, i) => [t, 'mixer.bass1.level', [64, 96, 127][i]]);
const stepped = { 'mixer.bass1.level': 32 };
const UP = [[16, 'mixer.bass1.level', 127]];
const DOWN = [[16, 'mixer.bass1.level', 40]];

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
  ['delay: steps 4 sixteenths, feedback 0', ping(delay(4, 0, { 'delay.triplet': 1 }))],
  ['delay: steps 8, feedback 0 (2 bars)', ping(delay(8, 0), 2)],
  ['delay: steps 3, feedback 0, send 64', ping(delay(3, 0, { 'mixer.bass1.delay': 64 }))],
  ['delay: steps 3, feedback 64, delay pan 0 (2 bars)', ping(delay(3, 64, { 'delay.pan': 0 }), 2)],
  // Last: at full feedback the echoes never die out.
  ['delay: steps 3, feedback 127 (3 bars)', ping(delay(3, 127), 3)],
  ['order: dist (amount 96, shape 127) + pcf lowpass (freq 64, reso 127), dark', [{ set: { ...dark, ...dist(96, 127), ...pcf(LP, 64, 127) } }]],
  ['order: dist (amount 96, shape 127) + comp on bass line 1 (amount 127, threshold 96), dark', [{ set: { ...dark, ...dist(96, 127), ...comp(127, 96, 2) } }]],
];

const LEVEL = 80; // headroom: ReBirth's exports clip at full levels
const song = buildSong({ title: 'Re-Rebirth fx test', sections, level: LEVEL, masterLevel: 100 });
writeFileSync(out, song.bytes);
console.log(`${out}: ${song.bars} bars at 120 BPM\n${song.summary}`);
