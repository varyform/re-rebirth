#!/usr/bin/env node
// Lists "isolated" drum hits in a song: one voice playing with no other drum hit
// and no bass note for a window after it, so a full-mix recording can be
// measured per voice.
//
//   node tools/hits.mjs <song.rbs|session.json> [--window 3] > hits.json
//
// Output: [{ voice: "r909.bd", bar, step, time, hit, accent }] with `time` in
// seconds from bar 1 (shuffle not applied: the song's hits are measured as-is).
import { readFileSync } from 'node:fs';
import { isRbs, parseRbs } from '../src/song/rbs.js';
import { valueAt } from '../src/song/song.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const window = Number(args[args.indexOf('--window') + 1] || 3);
if (!file) {
  console.error('usage: node tools/hits.mjs <song> [--window steps]');
  process.exit(1);
}

const buf = readFileSync(file);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const s = isRbs(ab) ? parseRbs(ab) : JSON.parse(buf.toString());
const T = s.song.tracks;
const at = (track, key, tick) => valueAt(T[track], key, tick) ?? s.params[key];
const stepSec = 60 / s.transport.tempo / 4;
const bars = Math.ceil(s.song.length / 32);

// Per absolute step: which drum voices hit, and whether any bass sounds.
const audible = (id, tick) => at(id, `${id}.on`, tick) >= 0.5 && (at('mixer', `mixer.${id}.level`, tick) ?? 0) > 0.05 && !(s.params[`mixer.${id}.mute`] >= 0.5);
const steps = [];
for (let bar = 0; bar < bars; bar++) {
  for (let st = 0; st < 16; st++) {
    const tick = bar * 32 + st * 2;
    const row = { hits: [], bass: false };
    for (const id of ['r808', 'r909']) {
      if (!audible(id, tick)) continue;
      const pat = s.drums[id].patterns[valueAt(T[id], 'pattern', tick) ?? 0];
      if (st >= pat.length) continue;
      const accent = !!pat.tracks.ac?.[st];
      for (const [track, values] of Object.entries(pat.tracks)) {
        if (track !== 'ac' && values[st]) row.hits.push({ voice: `${id}.${track}`, hit: values[st], accent });
      }
    }
    for (const id of ['bass1', 'bass2']) {
      if (!audible(id, tick)) continue;
      const pat = s.bass[id].patterns[valueAt(T[id], 'pattern', tick) ?? 0];
      const step = pat.steps[st % pat.length];
      const prev = pat.steps[(st + pat.length - 1) % pat.length];
      if (step.gate || (prev.gate && prev.slide)) row.bass = true;
    }
    steps.push(row);
  }
}

const out = [];
steps.forEach((row, i) => {
  if (row.hits.length !== 1 || row.bass) return;
  for (let k = 1; k <= window; k++) {
    const next = steps[i + k];
    if (!next || next.hits.length || next.bass) return;
  }
  const prev = steps[i - 1];
  if (prev && prev.hits.length) return; // previous tail would overlap the attack
  const bar = Math.floor(i / 16) + 1;
  out.push({ ...row.hits[0], bar, step: (i % 16) + 1, time: i * stepSec });
});
console.log(JSON.stringify(out));
const counts = {};
for (const h of out) counts[h.voice] = (counts[h.voice] || 0) + 1;
console.error(Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' '));
