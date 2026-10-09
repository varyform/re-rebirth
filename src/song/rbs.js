// Reader for ReBirth 2.0 song files (.rbs), written from the published format
// notes. Produces the same session structure as our JSON saves (session.js).
//
// Layout: big-endian IFF. "CAT " RB40 { HEAD, GLOB, USRI, CAT DEVL {...}, CAT TRKL {...} }
// Track events: MIDI-style varint delta, controller id, value; 1 tick = 1/32 note.
import { COMP_TARGETS, PCF_TARGETS } from '../channels.js';
import { emptyBassPattern, emptyDrumPattern, PATTERN_COUNT, STEPS } from '../state.js';
import { TICKS_PER_BAR } from './song.js';

const GLOB_TICKS_PER_BAR = 768;
export const STANDARD_MOD = 'Standard ReBirth';
const BASS_KNOBS = ['tuning', 'cutoff', 'resonance', 'envmod', 'decay', 'accent']; // then waveform
const R808_KNOBS = [
  'ac.level', 'bd.level', 'bd.tone', 'bd.decay', 'sd.level', 'sd.tone', 'sd.snappy',
  'lt.level', 'lt.tuning', null, 'mt.level', 'mt.tuning', null, 'ht.level', 'ht.tuning', null,
  'rs.level', null, 'cp.level', null, 'cb.level', 'cy.level', 'cy.tone', 'cy.decay', 'oh.level', 'oh.decay', 'ch.level',
]; // nulls: alternate-voice selectors (conga/claves/maracas), not modelled
const R909_KNOBS = [
  'ac.level', 'bd.level', 'bd.tune', 'bd.attack', 'bd.decay', 'sd.level', 'sd.tune', 'sd.tone', 'sd.snappy',
  'lt.level', 'lt.tune', 'lt.decay', 'mt.level', 'mt.tune', 'mt.decay', 'ht.level', 'ht.tune', 'ht.decay',
  'rs.level', 'cp.level', 'hh.level', 'hh.chDecay', 'hh.ohDecay', 'cy.crLevel', 'cy.crTune', 'cy.rdLevel', 'cy.rdTune', 'ac.flam',
];
const R808_TRACKS = ['ac', 'bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp', 'cb', 'cy', 'oh', 'ch'];
const R909_TRACKS = ['ac', 'bd', 'sd', 'lt', 'mt', 'ht', 'rs', 'cp', 'ch', 'oh', 'cr', 'rd'];
const CHANNEL_IDS = ['bass1', 'bass2', 'r808', 'r909'];

const DELAY_STEPS = 32;
const PCF_WAVES = 56;

const knob = (v) => Math.min(1, v / 127);
const choice = (i, n) => Math.min(n - 1, Math.max(0, i)) / (n - 1);

class Reader {
  constructor(buffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
  }

  u8(o) {
    return this.bytes[o];
  }

  u32(o) {
    return this.view.getUint32(o);
  }

  str(o, len) {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(this.bytes[o + i]);
    return s;
  }

  zstr(o, max) {
    let end = o;
    while (end < o + max && this.bytes[end]) end++;
    return new TextDecoder('windows-1252').decode(this.bytes.subarray(o, end));
  }

  chunks(start, end) {
    const out = [];
    let o = start;
    while (o + 8 <= end) {
      const id = this.str(o, 4);
      const size = this.u32(o + 4);
      const body = o + 8;
      if (body + size > end) throw new Error(`Truncated "${id}" chunk`);
      if (id === 'CAT ') out.push({ id, type: this.str(body, 4), children: this.chunks(body + 4, body + size) });
      else out.push({ id, at: body, size });
      o = body + size + (size & 1);
    }
    return out;
  }
}

export function isRbs(buffer) {
  const r = new Reader(buffer);
  return buffer.byteLength > 12 && r.str(0, 4) === 'CAT ' && r.str(8, 4) === 'RB40';
}

export function parseRbs(buffer, fileName = '') {
  const r = new Reader(buffer);
  if (!isRbs(buffer)) throw new Error('Not a ReBirth 2.0 song (expected an RB40 file)');
  const top = r.chunks(12, Math.min(buffer.byteLength, 8 + r.u32(4)));
  const find = (list, id, type) => list.find((c) => c.id === id && (!type || c.type === type));
  const glob = find(top, 'GLOB');
  const devl = find(top, 'CAT ', 'DEVL');
  const trkl = find(top, 'CAT ', 'TRKL');
  if (!glob || !devl) throw new Error('Song is missing its GLOB or DEVL section');
  // Mods swap in their own samples and graphics, which we can't reproduce.
  const mod = r.zstr(glob.at + 15, 65);
  if (mod !== STANDARD_MOD) throw new Error(`unsupported mod "${mod}"`);

  const session = {
    format: 're-rebirth',
    version: 1,
    info: { title: '', text: '', url: '', file: fileName },
    transport: {},
    params: {},
    bass: {},
    drums: {},
    song: { tracks: { mixer: [], bass1: [], bass2: [], r808: [], r909: [], fx: [] }, length: 0, loopStart: 0, loopEnd: 0 },
  };
  const P = session.params;

  // GLOB: mode, loop, tempo*1000, loop start/end (bar*768), shuffle
  const g = glob.at;
  const toTicks = (v) => Math.round((v / GLOB_TICKS_PER_BAR) * TICKS_PER_BAR);
  session.transport = { mode: r.u8(g) ? 'song' : 'pattern', loop: !!r.u8(g + 1), tempo: r.u32(g + 2) / 1000 };
  session.song.loopStart = toTicks(r.u32(g + 6));
  session.song.loopEnd = toTicks(r.u32(g + 10));
  P['song.shuffle'] = knob(r.u8(g + 14));

  const usri = find(top, 'USRI');
  if (usri) {
    session.info.title = r.zstr(usri.at, 41);
    session.info.text = r.zstr(usri.at + 41, 401);
    session.info.url = r.zstr(usri.at + 442, 101);
  }

  const dev = devl.children;
  const bassChunks = dev.filter((c) => c.id === '303 ');
  readMixer(r, find(dev, 'MIXR'), P);
  readEffects(r, dev, find, P);
  bassChunks.forEach((c, i) => (session.bass[`bass${i + 1}`] = readBass(r, c, `bass${i + 1}`, P)));
  const r808 = find(dev, '808 ');
  const r909 = find(dev, '909 ');
  if (r808) session.drums.r808 = readDrums(r, r808, 'r808', R808_KNOBS, R808_TRACKS, P);
  if (r909) session.drums.r909 = readDrums(r, r909, 'r909', R909_KNOBS, R909_TRACKS, P);

  // HEAD byte 6: 0 for the earliest 2.0 files; 1 and 2 (later 2.0 / 2.0.1) number the
  // mixer controllers differently. Verified on songs of each kind.
  const head = find(top, 'HEAD');
  const version = head ? r.u8(head.at + 6) : 0;
  if (trkl) readTracks(r, trkl.children.filter((c) => c.id === 'TRAK'), session.song, version);
  const song = session.song;
  const last = Math.max(0, ...Object.values(song.tracks).flatMap((t) => t.map((e) => e.tick)));
  song.length = Math.max(song.loopEnd, Math.ceil((last + 1) / TICKS_PER_BAR) * TICKS_PER_BAR);
  if (!song.loopEnd) song.loopEnd = song.length;
  return session;
}

function readMixer(r, c, P) {
  if (!c) return;
  const o = c.at;
  P['mixer.master.level'] = knob(r.u8(o));
  // Routing: device ids in the header (0 off, 1 master, 2..5 channels), or
  // per-channel flags right after the distortion switch.
  let comp = r.u8(o + 1);
  let pcf = r.u8(o + 2);
  CHANNEL_IDS.forEach((id, k) => {
    const b = o + 16 + k * 12;
    P[`mixer.${id}.mute`] = r.u8(b) ? 0 : 1;
    P[`mixer.${id}.level`] = knob(r.u8(b + 1));
    P[`mixer.${id}.pan`] = knob(r.u8(b + 2));
    P[`mixer.${id}.delay`] = knob(r.u8(b + 3));
    P[`mixer.${id}.dist`] = r.u8(b + 4) ? 1 : 0;
    if (r.u8(b + 5)) pcf = k + 2;
    if (r.u8(b + 6)) comp = k + 2;
  });
  P['fx.comp.target'] = choice(Math.min(Math.max(comp - 1, 0), COMP_TARGETS.length - 1), COMP_TARGETS.length);
  P['fx.pcf.target'] = choice(pcf >= 2 ? pcf - 1 : 0, PCF_TARGETS.length);
}

function readEffects(r, dev, find, P) {
  const dly = find(dev, 'DELY');
  if (dly) {
    const o = dly.at;
    P['fx.delay.on'] = r.u8(o) ? 1 : 0;
    P['fx.delay.steps'] = choice(r.u8(o + 1) - 1, DELAY_STEPS);
    P['fx.delay.triplet'] = r.u8(o + 2) ? 1 : 0;
    P['fx.delay.feedback'] = knob(r.u8(o + 3));
    P['fx.delay.pan'] = knob(r.u8(o + 4));
  }
  const pcf = find(dev, 'PCF ');
  if (pcf) {
    const o = pcf.at;
    P['fx.pcf.on'] = r.u8(o) ? 1 : 0;
    P['fx.pcf.freq'] = knob(r.u8(o + 1));
    P['fx.pcf.reso'] = knob(r.u8(o + 2));
    P['fx.pcf.amount'] = knob(r.u8(o + 3));
    P['fx.pcf.wave'] = choice(r.u8(o + 4), PCF_WAVES);
    P['fx.pcf.decay'] = knob(r.u8(o + 5));
    P['fx.pcf.mode'] = r.u8(o + 6) ? 1 : 0;
  }
  const dist = find(dev, 'DIST');
  if (dist) {
    P['fx.dist.on'] = r.u8(dist.at) ? 1 : 0;
    P['fx.dist.amount'] = knob(r.u8(dist.at + 1));
    P['fx.dist.shape'] = knob(r.u8(dist.at + 2));
  }
  const comp = find(dev, 'COMP');
  if (comp) {
    P['fx.comp.on'] = r.u8(comp.at) ? 1 : 0;
    P['fx.comp.amount'] = knob(r.u8(comp.at + 1));
    P['fx.comp.threshold'] = knob(r.u8(comp.at + 2));
  }
}

// 303 step flags: bit0 slide, bit1 accent, bit2 up, bit3 down, bit4 pause.
// A pause right after a slide is a tie: the slid note sustains through it.
// Fitted per step against a ReBirth recording (bit 4 almost always follows a slide).
function readBass(r, c, id, P) {
  const o = c.at;
  P[`${id}.on`] = r.u8(o) ? 1 : 0;
  BASS_KNOBS.forEach((k, i) => (P[`${id}.${k}`] = knob(r.u8(o + 2 + i))));
  P[`${id}.waveform`] = r.u8(o + 8) ? 1 : 0;
  const patterns = Array.from({ length: PATTERN_COUNT }, (_, p) => {
    const base = o + 9 + p * 34;
    const pattern = emptyBassPattern();
    pattern.shuffle = !!r.u8(base);
    pattern.length = clampLength(r.u8(base + 1));
    const flags = Array.from({ length: STEPS }, (_, s) => r.u8(base + 3 + s * 2));
    pattern.steps = flags.map((f, s) => {
      const note = Math.min(12, r.u8(base + 2 + s * 2));
      const prevSlide = !!(flags[(s + pattern.length - 1) % pattern.length] & 1);
      const tie = !!(f & 0x10) && prevSlide;
      return { note, octave: f & 4 ? 1 : f & 8 ? -1 : 0, accent: !!(f & 2), slide: !!(f & 1), gate: !(f & 0x10) || tie, tie };
    });
    return pattern;
  });
  const index = Math.min(PATTERN_COUNT - 1, r.u8(o + 1));
  return { bank: Math.floor(index / 8), pattern: index % 8, patterns };
}

function readDrums(r, c, id, knobs, tracks, P) {
  const o = c.at;
  P[`${id}.on`] = r.u8(o) ? 1 : 0;
  knobs.forEach((key, i) => key && (P[`${id}.${key}`] = knob(r.u8(o + 2 + i))));
  const head = 2 + knobs.length + 1;
  const stride = 2 + STEPS * tracks.length;
  const patterns = Array.from({ length: PATTERN_COUNT }, (_, p) => {
    const base = o + head + p * stride;
    const pattern = emptyDrumPattern();
    pattern.shuffle = !!r.u8(base);
    pattern.length = clampLength(r.u8(base + 1));
    tracks.forEach((t, k) => {
      const steps = Array.from({ length: STEPS }, (_, s) => Math.min(3, r.u8(base + 2 + s * tracks.length + k)));
      if (steps.some(Boolean)) pattern.tracks[t] = steps;
    });
    return pattern;
  });
  const index = Math.min(PATTERN_COUNT - 1, r.u8(o + 1));
  return { bank: Math.floor(index / 8), pattern: index % 8, patterns };
}

const clampLength = (n) => Math.min(STEPS, Math.max(1, n || STEPS));

function readEvents(r, c) {
  const end = c.at + c.size;
  const count = r.u32(c.at);
  const events = [];
  let o = c.at + 4;
  let tick = 0;
  for (let i = 0; i < count && o < end; i++) {
    let delta = 0;
    let b;
    do {
      b = r.u8(o++);
      delta = (delta << 7) | (b & 0x7f);
    } while (b & 0x80 && o < end);
    tick += delta;
    events.push({ tick, id: r.u8(o), value: r.u8(o + 1) });
    o += 2;
  }
  return events;
}

// Controller ids per track, mapped to our session keys.
const deviceKey = (id, knobs) => (cid, v) => {
  if (cid === 0) return [`${id}.on`, v ? 1 : 0];
  if (cid === 1) return ['pattern', Math.min(PATTERN_COUNT - 1, v)];
  const k = knobs[cid - 2];
  return k ? [`${id}.${k}`, knob(v)] : null;
};
const bassKey = (id) => (cid, v) => (cid === 8 ? [`${id}.waveform`, v ? 1 : 0] : deviceKey(id, BASS_KNOBS)(cid, v));
const FX_KEYS = [
  ['fx.delay', ['on', 'steps', 'triplet', 'feedback', 'pan']],
  ['fx.dist', ['on', 'amount', 'shape']],
  ['fx.pcf', ['on', 'freq', 'reso', 'amount', 'wave', 'decay', 'mode']],
  ['fx.comp', ['on', 'amount', 'threshold']],
];
const fxValue = (key, v) => {
  if (key.endsWith('.on') || key.endsWith('.triplet') || key === 'fx.pcf.mode') return v ? 1 : 0;
  if (key === 'fx.delay.steps') return choice(v - 1, DELAY_STEPS);
  if (key === 'fx.pcf.wave') return choice(v, PCF_WAVES);
  return knob(v);
};

function readTracks(r, traks, song, version) {
  const [mixer, b1, b2, r808, r909, ...fx] = traks.map((c) => readEvents(r, c));
  const convert = (events, map) =>
    (events ?? []).flatMap(({ tick, id, value }) => {
      const kv = map(id, value);
      return kv ? [{ tick, key: kv[0], value: kv[1] }] : [];
    });
  song.tracks.bass1 = convert(b1, bassKey('bass1'));
  song.tracks.bass2 = convert(b2, bassKey('bass2'));
  song.tracks.r808 = convert(r808, deviceKey('r808', R808_KNOBS));
  song.tracks.r909 = convert(r909, deviceKey('r909', R909_KNOBS));
  song.tracks.fx = fx
    .flatMap((events, i) => {
      const [prefix, names] = FX_KEYS[i] ?? [];
      return convert(events, (cid, v) => (names?.[cid] ? [`${prefix}.${names[cid]}`, fxValue(`${prefix}.${names[cid]}`, v)] : null));
    })
    .sort((a, b) => a.tick - b.tick);
  song.tracks.mixer = version >= 1 ? convertMixer201(mixer ?? []) : convertMixer(mixer ?? []);
}

// Later ReBirth 2.0 / 2.0.1 mixer controllers: 1 compressor device, 2 PCF device
// (0 off, 1 master, 2..5 channels), then per channel k ids 6+6k+n:
// n=0 level, 1 pan, 2 delay send, 3 distortion on.
function convertMixer201(events) {
  const out = [];
  for (const { tick, id, value } of events) {
    if (id === 1) {
      out.push({ tick, key: 'fx.comp.routed', value: value ? 1 : 0 });
      if (value) out.push({ tick, key: 'fx.comp.target', value: choice(Math.min(value - 1, COMP_TARGETS.length - 1), COMP_TARGETS.length) });
    }
    if (id === 2) out.push({ tick, key: 'fx.pcf.target', value: choice(value >= 2 ? value - 1 : 0, PCF_TARGETS.length) });
    if (id < 6 || id >= 30) continue;
    const chId = CHANNEL_IDS[Math.floor((id - 6) / 6)];
    const n = (id - 6) % 6;
    if (n === 0) out.push({ tick, key: `mixer.${chId}.level`, value: knob(value) });
    if (n === 1) out.push({ tick, key: `mixer.${chId}.pan`, value: knob(value) });
    if (n === 2) out.push({ tick, key: `mixer.${chId}.delay`, value: knob(value) });
    if (n === 3) out.push({ tick, key: `mixer.${chId}.dist`, value: value ? 1 : 0 });
  }
  return out;
}

// ReBirth 2.0 mixer controllers: per channel k, id 5+8k+n: n=0 level, 1 pan, 2 delay send,
// 3 distortion on, 4 pattern filter on this channel, 5 compressor on this
// channel (none set = compressor on master). The routing flags become our
// single target params, resolved per tick.
function convertMixer(events) {
  const out = [];
  const flags = { pcf: [0, 0, 0, 0], comp: [0, 0, 0, 0] };
  let last = { pcf: null, comp: null };
  const flush = (tick) => {
    const pcfCh = flags.pcf.findIndex(Boolean);
    const compCh = flags.comp.findIndex(Boolean);
    const pcf = choice(pcfCh + 1, PCF_TARGETS.length);
    const comp = choice(compCh >= 0 ? compCh + 1 : 0, COMP_TARGETS.length); // 0 = master
    if (pcf !== last.pcf) out.push({ tick, key: 'fx.pcf.target', value: pcf });
    if (comp !== last.comp) out.push({ tick, key: 'fx.comp.target', value: comp });
    last = { pcf, comp };
  };
  for (let i = 0; i < events.length; i++) {
    const { tick, id, value } = events[i];
    if (id >= 5 && id < 37) {
      const ch = Math.floor((id - 5) / 8);
      const n = (id - 5) % 8;
      const chId = CHANNEL_IDS[ch];
      if (n === 0) out.push({ tick, key: `mixer.${chId}.level`, value: knob(value) });
      if (n === 1) out.push({ tick, key: `mixer.${chId}.pan`, value: knob(value) });
      if (n === 2) out.push({ tick, key: `mixer.${chId}.delay`, value: knob(value) });
      if (n === 3) out.push({ tick, key: `mixer.${chId}.dist`, value: value ? 1 : 0 });
      if (n === 4) flags.pcf[ch] = value ? 1 : 0;
      if (n === 5) flags.comp[ch] = value ? 1 : 0;
    }
    if (events[i + 1]?.tick !== tick) flush(tick);
  }
  return out;
}
