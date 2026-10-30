// Writer for ReBirth 2.0.1 song files (.rbs): the reverse of rbs.js, from the
// same format description (docs/RBS42.txt) and laid out like real 2.0.1 files
// (where they differ from the description, rbs.js notes it; the writer follows
// the files: 712-byte USRI, 909 patterns at 31, 909 mixer ids 24-27).
//
// What a ReBirth song can't hold is left out: the bass lines' volume knobs,
// the delay return, solo, and song events for those.
import { COMP_TARGETS, PCF_TARGETS } from '../channels.js';
import { BASS_IDS, PATTERN_COUNT, STEPS } from '../state.js';
import { STANDARD_MOD } from './rbs.js';
import { TICKS_PER_BAR, TRACK_IDS } from './song.js';

const T = TICKS_PER_BAR;
const GLOB_TICKS_PER_BAR = 768;
const VERSION = [0x5b, 0x54, 0x5b, 0x54, 0xbc, 0x04, 0x02, 0x00, 0x00]; // 2.0.1
const COPYRIGHT = '(c)1997 Propellerhead Software, all rights reserved';
const DELAY_STEPS = 32;
const PCF_WAVES = 56;
const CHANNEL_IDS = ['bass1', 'bass2', 'r808', 'r909'];
const BASS_KNOBS = ['tuning', 'cutoff', 'resonance', 'envmod', 'decay', 'accent'];
const R808_KNOBS = [
  'ac.level', 'bd.level', 'bd.tone', 'bd.decay', 'sd.level', 'sd.tone', 'sd.snappy',
  'lt.level', 'lt.tuning', 'lt.alt', 'mt.level', 'mt.tuning', 'mt.alt', 'ht.level', 'ht.tuning', 'ht.alt',
  'rs.level', 'rs.alt', 'cp.level', 'cp.alt', 'cb.level', 'cy.level', 'cy.tone', 'cy.decay', 'oh.level', 'oh.decay', 'ch.level',
];
const R909_KNOBS = [
  'ac.level', 'bd.level', 'bd.tune', 'bd.attack', 'bd.decay', 'sd.level', 'sd.tune', 'sd.tone', 'sd.snappy',
  'lt.level', 'lt.tune', 'lt.decay', 'mt.level', 'mt.tune', 'mt.decay', 'ht.level', 'ht.tune', 'ht.decay',
  'rs.level', 'cp.level', 'hh.level', 'hh.chDecay', 'hh.ohDecay', 'cy.crLevel', 'cy.crTune', 'cy.rdLevel', 'cy.rdTune', 'ac.flam',
];
const DRUMS = {
  r808: { knobs: R808_KNOBS, tracks: ['ac', 'bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp', 'cb', 'cy', 'oh', 'ch'], maxHit: 1 },
  r909: { knobs: R909_KNOBS, tracks: ['ac', 'bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp', 'ch', 'oh', 'cr', 'rd'], maxHit: 3 },
};
const FX = [
  ['fx.delay', ['on', 'steps', 'triplet', 'feedback', 'pan']],
  ['fx.dist', ['on', 'amount', 'shape']],
  ['fx.pcf', ['on', 'freq', 'reso', 'amount', 'wave', 'decay', 'mode']],
  ['fx.comp', ['on', 'amount', 'threshold']],
];

// Our 0..1 values as ReBirth's bytes.
const byte = (v) => Math.max(0, Math.min(127, Math.round((v ?? 0) * 127)));
const index = (v, n) => Math.max(0, Math.min(n - 1, Math.round((v ?? 0) * (n - 1))));
const flag = (v) => ((v ?? 0) >= 0.5 ? 1 : 0);
// The 808's voice switches: stored 0 selects the alternate voice (see rbs.js).
const drumByte = (key, v) => (key.endsWith('.alt') ? 1 - flag(v) : byte(v));
// Delay step mode: stored 0 counts eighth-note triplets (see rbs.js).
const delayByte = (key, v) => {
  if (key === 'fx.delay.steps') return index(v, DELAY_STEPS) + 1;
  if (key === 'fx.delay.triplet') return 1 - flag(v);
  if (key === 'fx.delay.on') return flag(v);
  return byte(v);
};
const fxByte = (key, v) => {
  if (key.startsWith('fx.delay.')) return delayByte(key, v);
  if (key.endsWith('.on') || key === 'fx.pcf.mode') return flag(v);
  if (key === 'fx.pcf.wave') return index(v, PCF_WAVES);
  return byte(v);
};

// Windows-1252's 0x80-0x9f: the characters it puts where Latin-1 has controls.
const CP1252 = new Map(
  [...'\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178']
    .map((ch, i) => [ch, 0x80 + i])
    .filter(([ch]) => ch.codePointAt(0) > 0xff),
);

class Writer {
  constructor(size) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }

  u8(o, v) {
    this.bytes[o] = v;
  }

  u32(o, v) {
    this.view.setUint32(o, v);
  }

  // Zero-terminated, at most max - 1 characters, Windows-1252 like ReBirth's
  // own files (rbs.js decodes them that way); anything else becomes "?".
  zstr(o, max, s = '') {
    [...String(s)].slice(0, max - 1).forEach((ch, i) => {
      const c = ch.codePointAt(0);
      this.bytes[o + i] = CP1252.get(ch) ?? (c < 256 && (c < 0x80 || c > 0x9f) ? c : 0x3f);
    });
  }
}

// An IFF chunk: id, big-endian size, body, a pad byte when the size is odd.
function chunk(id, body) {
  const out = new Uint8Array(8 + body.length + (body.length & 1));
  for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, body.length);
  out.set(body, 8);
  return out;
}

const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const cat = (type, children) => chunk('CAT ', concat([new TextEncoder().encode(type), ...children]));

function head() {
  const w = new Writer(256);
  VERSION.forEach((b, i) => w.u8(i, b));
  w.zstr(9, 129, COPYRIGHT);
  return chunk('HEAD', w.bytes);
}

function glob(s) {
  const w = new Writer(512);
  w.u8(0, s.transport.mode === 'song' ? 1 : 0);
  w.u8(1, s.transport.loop ? 1 : 0);
  w.u32(2, Math.round(s.transport.tempo * 1000));
  const toGlob = (ticks) => Math.round((ticks / T) * GLOB_TICKS_PER_BAR);
  w.u32(6, toGlob(s.song.loopStart));
  w.u32(10, toGlob(s.song.loopEnd || s.song.length));
  w.u8(14, byte(s.params['song.shuffle'] ?? 0.5));
  w.zstr(15, 65, STANDARD_MOD);
  w.zstr(80, 201, 'ftp.propellerheads.se');
  w.zstr(281, 201, 'www.propellerheads.se');
  w.u8(482, (s.params['song.vintage'] ?? 0) >= 0.5 ? 1 : 0);
  return chunk('GLOB', w.bytes);
}

// 712 bytes like real files: title, text at 41 (401), web page at 442 (101),
// show-info-on-open at 543. Line breaks are 0x0d.
function usri(info) {
  const w = new Writer(712);
  w.zstr(0, 41, info.title);
  w.zstr(41, 401, (info.text ?? '').replace(/\r?\n/g, '\r'));
  w.zstr(442, 101, info.url);
  w.u8(543, info.text ? 1 : 0);
  return chunk('USRI', w.bytes);
}

// Compressor device: 0 off, 1 master, 2..5 channels; PCF: 0 off, 1..4 channels.
const compDevice = (routed, target) => (flag(routed) ? index(target, COMP_TARGETS.length) + 1 : 0);
const pcfDevice = (target) => index(target, PCF_TARGETS.length);

function mixr(P) {
  const w = new Writer(64);
  w.u8(0, byte(P['mixer.master.level']));
  w.u8(1, compDevice(P['fx.comp.routed'], P['fx.comp.target']));
  w.u8(2, pcfDevice(P['fx.pcf.target']));
  CHANNEL_IDS.forEach((id, k) => {
    const b = 16 + k * 12;
    w.u8(b, flag(P[`mixer.${id}.mute`]) ? 0 : 1);
    w.u8(b + 1, byte(P[`mixer.${id}.level`]));
    w.u8(b + 2, byte(P[`mixer.${id}.pan`] ?? 0.5));
    w.u8(b + 3, byte(P[`mixer.${id}.delay`]));
    w.u8(b + 4, flag(P[`mixer.${id}.dist`]));
  });
  return chunk('MIXR', w.bytes);
}

// One effect's chunk: its settings in controller order, padded to `size`.
function fxChunk(id, size, prefix, P) {
  const names = FX.find(([p]) => p === prefix)[1];
  const w = new Writer(size);
  names.forEach((n, j) => w.u8(j, fxByte(`${prefix}.${n}`, P[`${prefix}.${n}`])));
  // "Reserved" in the description, but 127 in every real file.
  if (id === 'COMP') w.u8(3, 127);
  return chunk(id, w.bytes);
}

const selected = (dev) => Math.min(PATTERN_COUNT - 1, dev.bank * 8 + dev.pattern);

// 303 step flags: bit0 slide, bit1 accent, bit2 up, bit3 down, bit4 pause.
// A tie is a pause after a slide, so the step before a tie gets its slide bit.
function bass(id, dev, P) {
  const w = new Writer(1097);
  w.u8(0, flag(P[`${id}.on`] ?? 1));
  w.u8(1, selected(dev));
  BASS_KNOBS.forEach((k, i) => w.u8(2 + i, byte(P[`${id}.${k}`])));
  w.u8(8, flag(P[`${id}.waveform`]));
  dev.patterns.forEach((pattern, p) => {
    const base = 9 + p * 34;
    w.u8(base, pattern.shuffle ? 1 : 0);
    w.u8(base + 1, pattern.length);
    const steps = pattern.steps;
    steps.forEach((s, i) => {
      const next = steps[(i + 1) % pattern.length];
      let f = 0;
      if (s.slide || (next?.tie && i < pattern.length)) f |= 1;
      if (s.accent) f |= 2;
      if (s.octave > 0) f |= 4;
      if (s.octave < 0) f |= 8;
      if (!s.gate || s.tie) f |= 0x10;
      w.u8(base + 2 + i * 2, Math.min(12, s.note));
      w.u8(base + 3 + i * 2, f);
    });
  });
  return chunk('303 ', w.bytes);
}

function drums(id, dev, P) {
  const { knobs, tracks, maxHit } = DRUMS[id];
  const head = 2 + knobs.length + 1;
  const w = new Writer(head + PATTERN_COUNT * (2 + STEPS * tracks.length));
  w.u8(0, flag(P[`${id}.on`] ?? 1));
  w.u8(1, selected(dev));
  knobs.forEach((k, i) => w.u8(2 + i, drumByte(k, P[`${id}.${k}`])));
  dev.patterns.forEach((pattern, p) => {
    const base = head + p * (2 + STEPS * tracks.length);
    w.u8(base, pattern.shuffle ? 1 : 0);
    w.u8(base + 1, pattern.length);
    tracks.forEach((t, k) => {
      const steps = pattern.tracks[t];
      if (!steps) return;
      for (let s = 0; s < STEPS; s++) w.u8(base + 2 + s * tracks.length + k, Math.min(maxHit, steps[s] ?? 0));
    });
  });
  return chunk(`${id.slice(1)} `, w.bytes);
}

// Song events, regrouped by ReBirth's tracks: where an event lives in our
// song (in-app recording puts routing on the fx track, imports on the mixer
// one) doesn't matter, its key does. Returns [rbsTrack, controller, byte].
function controllerFor(key, value) {
  for (const id of BASS_IDS) {
    if (!key.startsWith(`${id}.`)) continue;
    const k = key.slice(id.length + 1);
    if (k === 'on') return [1 + BASS_IDS.indexOf(id), 0, flag(value)];
    if (k === 'waveform') return [1 + BASS_IDS.indexOf(id), 8, flag(value)];
    const i = BASS_KNOBS.indexOf(k);
    return i >= 0 ? [1 + BASS_IDS.indexOf(id), 2 + i, byte(value)] : null;
  }
  for (const [n, id] of [[3, 'r808'], [4, 'r909']]) {
    if (!key.startsWith(`${id}.`)) continue;
    const k = key.slice(id.length + 1);
    if (k === 'on') return [n, 0, flag(value)];
    const i = DRUMS[id].knobs.indexOf(k);
    return i >= 0 ? [n, 2 + i, drumByte(k, value)] : null;
  }
  const m = /^mixer\.(\w+)\.(level|pan|delay|dist)$/.exec(key);
  if (m) {
    const k = CHANNEL_IDS.indexOf(m[1]);
    if (k < 0) return null;
    const n = ['level', 'pan', 'delay', 'dist'].indexOf(m[2]);
    return [0, 6 + 6 * k + n, n === 3 ? flag(value) : byte(value)];
  }
  if (key === 'fx.pcf.target') return [0, 2, pcfDevice(value)];
  for (const [i, [prefix, names]] of FX.entries()) {
    if (!key.startsWith(`${prefix}.`)) continue;
    const c = names.indexOf(key.slice(prefix.length + 1));
    return c >= 0 ? [5 + i, c, fxByte(key, value)] : null;
  }
  return null;
}

function trackEvents(s) {
  const P = s.params;
  const out = Array.from({ length: 9 }, () => []);
  const all = TRACK_IDS.flatMap((id) => s.song.tracks[id].map((e) => ({ ...e, track: id }))).sort((a, b) => a.tick - b.tick);
  // The compressor's device byte combines two of our params, followed per tick.
  let routed = P['fx.comp.routed'];
  let target = P['fx.comp.target'];
  for (const e of all) {
    if (e.key === 'pattern') {
      const n = 1 + ['bass1', 'bass2', 'r808', 'r909'].indexOf(e.track);
      // Pattern changes have to sit on bar lines.
      if (n > 0) out[n].push({ tick: Math.floor(e.tick / T) * T, cid: 1, value: Math.min(PATTERN_COUNT - 1, e.value) });
      continue;
    }
    if (e.key === 'fx.comp.routed' || e.key === 'fx.comp.target') {
      if (e.key === 'fx.comp.routed') routed = e.value;
      else target = e.value;
      out[0].push({ tick: e.tick, cid: 1, value: compDevice(routed, target) });
      continue;
    }
    const c = controllerFor(e.key, e.value);
    if (c) out[c[0]].push({ tick: e.tick, cid: c[1], value: c[2] });
  }
  // Every track needs an event at position 0: a value already in force.
  const atZero = [
    { cid: 6, value: byte(P['mixer.bass1.level']) },
    ...['bass1', 'bass2', 'r808', 'r909'].map((id) => ({ cid: 0, value: flag(P[`${id}.on`] ?? 1) })),
    ...FX.map(([prefix]) => ({ cid: 0, value: flag(P[`${prefix}.on`] ?? 1) })),
  ];
  return out.map((events, i) => {
    events.sort((a, b) => a.tick - b.tick);
    // Several values for one controller at one position: the last one counts.
    const seen = new Set();
    const kept = events
      .reverse()
      .filter((e) => !seen.has(`${e.tick}:${e.cid}`) && seen.add(`${e.tick}:${e.cid}`))
      .reverse();
    if (!kept.length || kept[0].tick > 0) kept.unshift({ tick: 0, ...atZero[i] });
    return kept;
  });
}

function deltaBytes(value) {
  const out = [value & 0x7f];
  while ((value >>= 7) > 0) out.unshift((value & 0x7f) | 0x80);
  return out;
}

function trak(events) {
  const body = [0, 0, 0, 0]; // event count, filled in below
  let last = 0;
  for (const e of events) {
    body.push(...deltaBytes(e.tick - last), e.cid, e.value);
    last = e.tick;
  }
  const bytes = new Uint8Array(body);
  new DataView(bytes.buffer).setUint32(0, events.length);
  return chunk('TRAK', bytes);
}

// A serialized session (session.js) as the bytes of a .rbs file.
export function writeRbs(s) {
  const P = s.params;
  // The device list's order is fixed.
  const devl = cat('DEVL', [
    mixr(P),
    fxChunk('DELY', 8, 'fx.delay', P),
    fxChunk('PCF ', 12, 'fx.pcf', P),
    fxChunk('DIST', 8, 'fx.dist', P),
    fxChunk('COMP', 8, 'fx.comp', P),
    bass('bass1', s.bass.bass1, P),
    bass('bass2', s.bass.bass2, P),
    drums('r808', s.drums.r808, P),
    drums('r909', s.drums.r909, P),
  ]);
  const trkl = cat('TRKL', trackEvents(s).map(trak));
  return cat('RB40', [head(), glob(s), usri(s.info), devl, trkl]);
}

// What the song has that a .rbs can't hold, for a notice.
export function rbsLosses(s) {
  const lost = [];
  if (BASS_IDS.some((id) => Math.abs((s.params[`${id}.volume`] ?? 0.8) - 0.8) > 0.01)) lost.push('bass volume');
  if (Math.abs((s.params['mixer.delayReturn'] ?? 0.6) - 0.6) > 0.01) lost.push('delay return');
  return lost;
}
