// Minimal writer for ReBirth 2.0.1 song files (.rbs), following Propellerhead's
// format description (docs/RBS42.txt) and the layout of real 2.0.1 files (USRI is
// 712 bytes there, not 512). Only what calibration test songs need: one song in
// song mode, standard sounds, device settings, patterns and automation tracks.
//
// Song description shape (all knob values 0..127, ticks are 1/32 notes):
//   { title, text, tempo, bars, masterLevel,
//     mixer: { bass1: { on, level, pan, delay, dist }, ... },   // also bass2, r808, r909
//     bass1: { on, pattern, knobs: { tune, cutoff, resonance, envmod, decay, accent }, waveform,
//              patterns: [{ length, steps: [{ note, octave, accent, slide, rest }] }] },  // also bass2
//     tracks: { mixer: [[tick, id, value]], bass1: [...], ... } }  // controller ids per the description
const BAR = 32;
const TRACK_ORDER = ['mixer', 'bass1', 'bass2', 'r808', 'r909', 'delay', 'dist', 'pcf', 'comp'];
const CHANNELS = ['bass1', 'bass2', 'r808', 'r909'];

const ascii = (s) => [...s].map((c) => c.charCodeAt(0) & 0xff);

function chunk(id, body) {
  const size = body.length;
  const out = [...ascii(id), (size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff, ...body];
  if (size & 1) out.push(0); // IFF pads odd chunks
  return out;
}
const cat = (type, children) => chunk('CAT ', [...ascii(type), ...children.flat()]);

function zstr(s, len) {
  const bytes = new Array(len).fill(0);
  ascii(s).slice(0, len - 1).forEach((b, i) => (bytes[i] = b));
  return bytes;
}
const u32 = (v) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];

// MIDI-file style variable-length delta.
function varint(v) {
  const bytes = [v & 0x7f];
  while ((v >>>= 7) > 0) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

function head() {
  const b = new Array(256).fill(0);
  [0x5b, 0x54, 0x5b, 0x54, 0xbc, 0x04, 0x02, 0x00, 0x00].forEach((v, i) => (b[i] = v));
  zstr('(c)1997 Propellerhead Software, all rights reserved', 129).forEach((v, i) => (b[9 + i] = v));
  return chunk('HEAD', b);
}

function glob(song) {
  const b = new Array(512).fill(0);
  b[0] = 1; // song mode
  b[1] = 0; // loop off
  u32(Math.round(song.tempo * 1000)).forEach((v, i) => (b[2 + i] = v));
  u32(0).forEach((v, i) => (b[6 + i] = v));
  u32(song.bars * 768).forEach((v, i) => (b[10 + i] = v));
  b[14] = 0; // shuffle
  zstr('Standard ReBirth', 65).forEach((v, i) => (b[15 + i] = v));
  zstr('ftp.propellerheads.se', 201).forEach((v, i) => (b[80 + i] = v));
  zstr('www.propellerheads.se', 201).forEach((v, i) => (b[281 + i] = v));
  b[482] = 0; // ReBirth 2.0 sound, not vintage
  return chunk('GLOB', b);
}

function usri(song) {
  const b = new Array(712).fill(0);
  zstr(song.title ?? '', 41).forEach((v, i) => (b[i] = v));
  zstr((song.text ?? '').replace(/\n/g, '\r'), 401).forEach((v, i) => (b[41 + i] = v));
  return chunk('USRI', b);
}

function mixr(song) {
  const b = new Array(64).fill(0);
  b[0] = song.masterLevel ?? 100;
  b[1] = 0; // compressor off
  b[2] = 0; // pattern filter off
  CHANNELS.forEach((id, k) => {
    const m = { on: 1, level: 100, pan: 64, delay: 0, dist: 0, ...song.mixer?.[id] };
    [m.on, m.level, m.pan, m.delay, m.dist].forEach((v, i) => (b[16 + 12 * k + i] = v));
  });
  return chunk('MIXR', b);
}

// Effects present but switched off.
const effects = () => [
  chunk('DELY', [0, 4, 0, 64, 64, 0, 0, 0]),
  chunk('PCF ', [0, 64, 64, 64, 0, 64, 1, 0, 0, 0, 0, 0]),
  chunk('DIST', [0, 64, 64, 0, 0, 0, 0, 0]),
  chunk('COMP', [0, 64, 64, 0, 0, 0, 0, 0]),
];

function bassPattern(p) {
  const steps = Array.from({ length: 16 }, (_, i) => p?.steps?.[i] ?? { rest: true });
  const bytes = [0, p?.length ?? 16];
  for (const s of steps) {
    const flags = (s.slide ? 0x01 : 0) | (s.accent ? 0x02 : 0) | (s.octave > 0 ? 0x04 : 0) | (s.octave < 0 ? 0x08 : 0) | (s.rest ? 0x10 : 0);
    bytes.push(s.rest ? 0 : s.note ?? 0, flags);
  }
  return bytes;
}

function bass(dev = {}) {
  const k = { tune: 64, cutoff: 64, resonance: 64, envmod: 64, decay: 64, accent: 64, ...dev.knobs };
  const b = [dev.on ? 1 : 0, dev.pattern ?? 0, k.tune, k.cutoff, k.resonance, k.envmod, k.decay, k.accent, dev.waveform ?? 0];
  for (let i = 0; i < 32; i++) b.push(...bassPattern(dev.patterns?.[i]));
  return chunk('303 ', b);
}

// Drum machines present but off, knobs centred, patterns empty.
function drums(id, knobs, reserved) {
  const b = [0, 0, ...new Array(knobs).fill(64), ...new Array(reserved).fill(0)];
  for (let i = 0; i < 32; i++) b.push(0, 16, ...new Array(16 * 12).fill(0));
  return chunk(id, b);
}

function trak(events) {
  // Every track needs an event at position 0.
  const sorted = [...events].sort((a, b) => a[0] - b[0]);
  if (!sorted.length || sorted[0][0] !== 0) throw new Error('track must start with an event at tick 0');
  const body = [...u32(sorted.length)];
  let last = 0;
  for (const [tick, id, value] of sorted) {
    if (tick > 31976) throw new Error(`event past the 999-bar limit: ${tick}`);
    body.push(...varint(tick - last), id, value);
    last = tick;
  }
  return chunk('TRAK', body);
}

export function writeRbs(song) {
  const devl = cat('DEVL', [mixr(song), ...effects(), bass(song.bass1), bass(song.bass2), drums('808 ', 27, 1), drums('909 ', 28, 1)]);
  const trkl = cat('TRKL', TRACK_ORDER.map((id) => trak(song.tracks?.[id] ?? [[0, 0, 0]])));
  return Uint8Array.from(cat('RB40', [head(), glob(song), usri(song), devl, trkl]));
}

export { BAR };
