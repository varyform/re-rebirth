// Web MIDI input: hardware knobs, faders, keys and pads (Chrome, Edge, Firefox;
// Safari has no Web MIDI).
//
// A layout says which hardware control plays which role (knob 1-8, slider
// 1-4, the big knob, the mod strip, pads, transport). SET UP MY CONTROLLER
// (see SETUP_STEPS) records it by asking for each control in turn; until then
// a guess at an Arturia MiniLab 3's factory program stands in. Roles then
// follow the instrument on screen. MIDI learn binds a single control to a
// single knob on top. Knob moves go through state.set like mouse moves, so
// they're recorded the same way, several at once if you turn several.
import { R808, R909 } from './render/devices/drum-machine.js';
import { shownDevices } from './render/focus-view.js';
import { BASS_IDS, DRUM_IDS } from './state.js';
import { stepInstrument, stepPattern } from './ui/shortcuts.js';
import { LiveBass } from './ui/live-bass.js';
import { enterNote, stepTarget } from './ui/step-keys.js';

const STORE = 're-rebirth.midi';
const ENABLED = 're-rebirth.midi.enabled';
const PROFILE = 're-rebirth.midi.layout';
// v2: the first version forced MiniLab knobs to relative, which was wrong for
// absolute ones; what it stored is ignored.
const KINDS = 're-rebirth.midi.kinds.v2';
const COPY = {
  learn: 'MIDI LEARN: CLICK A KNOB, THEN MOVE A CONTROL \u00B7 DOUBLE-CLICK FORGETS \u00B7 ESC ENDS',
  bound: (cc, param) => `CC ${cc} \u2192 ${param.replace(/\./g, ' ')}`,
  forgot: (param) => `${param.replace(/\./g, ' ')}: BACK TO DEFAULT`,
  connected: (names) => `MIDI: ${names.join(', ') || 'NO DEVICE YET'}`,
  denied: 'MIDI ACCESS WAS NOT ALLOWED',
  reset: 'MIDI RESET: GUESSED MINILAB 3 LAYOUT, NO LEARNED KNOBS',
  saved: 'CONTROLLER SET UP',
  monitor: (ch, cc, v) => `CH ${ch + 1} \u00B7 CC ${cc} \u00B7 ${v}`,
  moved: (param, v) => `${paramName(param)} \u00B7 ${Math.round(v * 127)}`,
};

// Keys: "channel:cc" for controllers, "n:channel:note" for notes.
const ccKey = (ch, cc) => `${ch}:${cc}`;
const noteKey = (ch, note) => `n:${ch}:${note}`;

// A guess at a MiniLab 3's factory program, used until the controller is set up.
const GUESSED = {
  knobs: [74, 71, 76, 77, 93, 18, 19, 16].map((cc) => ccKey(0, cc)),
  faders: [82, 83, 85, 17].map((cc) => ccKey(0, cc)),
  mod: ccKey(0, 1),
  encoder: null,
  encoderPush: null,
  encoderShift: null,
  shift: null,
  pads: { channel: 9, note: 36 },
  transport: { loop: null, stop: null, play: null, rec: null },
};
const PAD_COUNT = 16;

// SET UP MY CONTROLLER, in the order it asks. kind: 'turn' (a knob, slider or
// strip: several messages, not just 0/127), 'press' (a button or pad: a note
// or a controller press), 'note' (a pad). Optional steps can be skipped when
// the control sends nothing.
export const SETUP_STEPS = [
  ...Array.from({ length: 8 }, (_, i) => ({ role: 'knobs', index: i, kind: 'turn', prompt: `TURN KNOB ${i + 1}` })),
  ...Array.from({ length: 4 }, (_, i) => ({ role: 'faders', index: i, kind: 'turn', prompt: `MOVE SLIDER ${i + 1}` })),
  { role: 'encoder', kind: 'turn', prompt: 'TURN THE BIG KNOB BY THE SCREEN' },
  { role: 'encoderPush', kind: 'press', prompt: 'CLICK THE BIG KNOB', optional: true },
  { role: 'shift', kind: 'press', prompt: 'PRESS SHIFT', optional: true },
  { role: 'encoderShift', kind: 'turn', prompt: 'HOLD SHIFT, TURN THE BIG KNOB', optional: true },
  { role: 'mod', kind: 'turn', prompt: 'SLIDE ALONG THE MOD STRIP', optional: true },
  { role: 'pads', kind: 'note', prompt: 'HIT PAD 1', optional: true },
  { role: 'transport', name: 'loop', kind: 'press', prompt: 'HOLD SHIFT, PRESS PAD 4 (LOOP)', optional: true },
  { role: 'transport', name: 'stop', kind: 'press', prompt: 'HOLD SHIFT, PRESS PAD 5 (STOP)', optional: true },
  { role: 'transport', name: 'play', kind: 'press', prompt: 'HOLD SHIFT, PRESS PAD 6 (PLAY)', optional: true },
  { role: 'transport', name: 'rec', kind: 'press', prompt: 'HOLD SHIFT, PRESS PAD 7 (RECORD)', optional: true },
];

// What the knobs do, by the instrument on screen. The first six play the
// instrument; 7 and 8 are the same everywhere: its delay send, distortion.
const BASS_KNOBS = ['cutoff', 'resonance', 'envmod', 'decay', 'accent', 'tuning'];
const SHARED_KNOBS = [(id) => `mixer.${id}.delay`, () => 'fx.dist.amount'];
const CHANNEL_LEVELS = ['bass1', 'bass2', 'r808', 'r909'].map((id) => `mixer.${id}.level`);
// Most played first, so the first pad bank covers a beat.
const PAD_LANES = {
  r808: ['bd', 'sd', 'ch', 'oh', 'cp', 'rs', 'lt', 'ht', 'mt', 'cy', 'cb'],
  r909: ['bd', 'sd', 'ch', 'oh', 'cp', 'rs', 'lt', 'ht', 'mt', 'cr', 'rd'],
};
const KITS = { r808: R808, r909: R909 };
const ACCENT_VELOCITY = 100;
const MIDDLE_C = 48; // C3: the 303's middle octave
const GRAB = 2 / 127; // soft takeover: how close an absolute control must come

// "mixer.bass1.delay" -> "BASS 1 DELAY SEND", "fx.dist.amount" -> "DISTORTION AMOUNT".
const NAMES = { bass1: 'BASS 1', bass2: 'BASS 2', r808: 'DRUM 08', r909: 'DRUM 09', delay: 'DELAY', dist: 'DISTORTION' };
function paramName(param) {
  const parts = param.split('.').filter((p) => p !== 'mixer' && p !== 'fx');
  if (param.startsWith('mixer.') && parts[1] === 'delay') parts[1] = 'delay send';
  return parts.map((p) => NAMES[p] ?? p.replace(/([a-z])([A-Z])/g, '$1 $2')).join(' ').toUpperCase();
}

// One relative step, whichever of the usual encodings the controller uses:
// binary offset (64 + n / 64 - n), two's complement (n / 128 - n) or sign bit
// (n / 64 + n). Ups look alike (1..n or 65..n) but downs don't: offset goes
// below 64 (63..), two's complement to the top (127..), sign bit to 65...
// The one overlap, 65..80 (offset up or sign-bit down), is told apart by what
// else the control has sent.
function relativeDelta(c, v) {
  if (v >= 1 && v <= 15) c.sawLow = true;
  if (v >= 49 && v <= 63) c.sawMid = true;
  if (v < 48) return v;
  if (v <= 64) return v - 64;
  if (v <= 80) return c.sawLow && !c.sawMid ? 64 - v : v - 64;
  return v - 128;
}

const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: kept for this visit.
  }
};

export class Midi {
  // onChange: after any state change from MIDI; notify(text): a short message.
  constructor(state, engine, { clock, onChange, notify }) {
    Object.assign(this, { state, engine, clock, onChange, notify });
    this.access = null;
    // "channel:cc" -> param. "@.cutoff" means that knob of whichever instrument
    // is shown (a binding learned on BASS 1 drives BASS 2 when it's up).
    this.bindings = new Map(load(STORE, []));
    this.controls = new Map(); // key -> { kind, last, param, grabbed, ... }
    // What each control turned out to be (endless or not, its encoding), kept
    // between visits.
    this.kinds = new Map(load(KINDS, []));
    this.held = new Map(); // buttons sending controllers: pressed or not
    this.live = new LiveBass(state, engine, clock);
    this.setProfile(load(PROFILE, null));
    state.ui.midi = navigator.requestMIDIAccess ? 'off' : 'unavailable';
    // Connected before: permission is remembered, so reconnect without asking.
    if (this.supported && localStorage.getItem(ENABLED)) this.connect({ quiet: true });
  }

  get supported() {
    return !!navigator.requestMIDIAccess;
  }

  // The layout in use (null = the guess) and the key -> role lookup.
  setProfile(profile) {
    this.custom = !!profile;
    this.profile = profile ?? GUESSED;
    const roles = new Map();
    const p = this.profile;
    p.knobs.forEach((k, i) => k && roles.set(k, ['knobs', i]));
    p.faders.forEach((k, i) => k && roles.set(k, ['faders', i]));
    for (const role of ['mod', 'encoder', 'encoderPush', 'encoderShift', 'shift']) if (p[role]) roles.set(p[role], [role]);
    for (const [name, k] of Object.entries(p.transport)) if (k) roles.set(k, ['transport', name]);
    this.roles = roles;
  }

  async connect({ quiet = false } = {}) {
    if (!this.supported || this.access) return;
    try {
      this.access = await navigator.requestMIDIAccess();
    } catch {
      this.state.ui.midi = 'denied';
      if (!quiet) this.notify(COPY.denied);
      this.onChange();
      return;
    }
    localStorage.setItem(ENABLED, '1');
    this.access.onstatechange = () => this.attach();
    this.attach();
    if (!quiet) this.notify(COPY.connected(this.inputNames));
  }

  attach() {
    const inputs = [...this.access.inputs.values()].filter((i) => i.state === 'connected');
    for (const input of inputs) input.onmidimessage = (e) => this.message(e.data);
    this.state.ui.midi = inputs.length ? 'on' : 'waiting';
    this.inputNames = inputs.map((i) => i.name);
    this.onChange();
  }

  // The bar's MIDI button: connect first, end learn mode, else the MIDI window.
  async press() {
    const { ui } = this.state;
    if (ui.midi === 'off' || ui.midi === 'denied') {
      await this.connect();
      if (this.access) ui.midiWindow = { mode: 'menu' };
      this.onChange();
      return;
    }
    if (ui.midiLearn) ui.midiLearn = null;
    else ui.midiWindow = ui.midiWindow ? null : { mode: 'menu' };
  }

  // MIDI learn: click a knob on screen, then move a hardware control.
  toggleLearn() {
    const { ui } = this.state;
    if (ui.midiLearn) {
      ui.midiLearn = null;
      return;
    }
    ui.midiLearn = { param: null, mapped: this.mappedParams(), forget: (param) => this.unbind(param) };
    this.notify(COPY.learn);
  }

  // A learned parameter of the shown instrument is stored relative to it.
  generic(param) {
    const [id] = shownDevices(this.state);
    return param.startsWith(`${id}.`) ? `@${param.slice(id.length)}` : param;
  }

  // A stored binding as a parameter of the instrument on screen, or null when
  // that instrument has no such control (a bass knob while a drum is up).
  resolve(binding) {
    if (!binding?.startsWith('@')) return binding ?? null;
    const [id] = shownDevices(this.state);
    const param = `${id}${binding.slice(1)}`;
    return this.state.defaults.has(param) ? param : null;
  }

  mappedParams() {
    return new Set([...this.bindings.values()].map((b) => this.resolve(b)).filter(Boolean));
  }

  // Back to the guessed layout, no learned knobs, nothing known about the controls.
  reset() {
    this.bindings.clear();
    this.kinds.clear();
    this.controls.clear();
    localStorage.removeItem(PROFILE);
    this.setProfile(null);
    this.save();
    this.saveKinds();
    this.notify(COPY.reset);
  }

  unbind(param) {
    const generic = this.generic(param);
    for (const [k, v] of this.bindings) if (v === param || v === generic) this.bindings.delete(k);
    this.save();
    this.notify(COPY.forgot(param));
  }

  save() {
    store(STORE, [...this.bindings]);
    if (this.state.ui.midiLearn) this.state.ui.midiLearn.mapped = this.mappedParams();
  }

  saveKinds() {
    store(KINDS, [...this.kinds]);
  }

  message([status, a, b = 0]) {
    const type = status & 0xf0;
    const channel = status & 0x0f;
    if (type === 0xb0) this.cc(channel, a, b);
    else if (type === 0x90 && b > 0) this.noteOn(channel, a, b);
    else if (type === 0x80 || type === 0x90) this.live.noteOff(a);
    else return;
    this.onChange();
  }

  get setup() {
    const w = this.state.ui.midiWindow;
    return w?.mode === 'setup' ? w : null;
  }

  cc(channel, cc, value) {
    const key = ccKey(channel, cc);
    if (this.setup) return this.capture('cc', key, value);
    const learn = this.state.ui.midiLearn;
    // While learning, show what arrives: tells which CC a control sends and how.
    if (learn) this.notify(COPY.monitor(channel, cc, value));
    if (learn?.param) {
      const generic = this.generic(learn.param);
      for (const [k, v] of this.bindings) if (v === generic) this.bindings.delete(k);
      this.bindings.set(key, generic);
      this.notify(COPY.bound(cc, learn.param));
      learn.param = null;
      this.save();
      if (this.controls.has(key)) this.controls.get(key).grabbed = false;
      return;
    }
    const role = this.roles.get(key);
    const bound = this.resolve(this.bindings.get(key));
    if (!bound && role && this.action(role, key, value)) return;
    const param = bound ?? this.roleParam(role);
    if (!param) return;
    const before = this.state.get(param);
    this.turn(key, param, value);
    const after = this.state.get(param);
    // Off screen (delay send, distortion, levels in the focus stages): say what moved.
    if (after !== before && !learn && !this.state.ui.drawnParams?.has(param)) this.notify(COPY.moved(param, after));
  }

  // Roles that do something instead of moving a knob: the big knob steps
  // patterns (with Shift, instruments) and its click opens the picker; the
  // transport buttons. Returns true if `role` was one of them.
  action([role, name], key, value) {
    const { state } = this;
    if (role === 'encoder' || role === 'encoderShift') {
      const d = this.stepOf(key, value);
      if (d && role === 'encoder') stepPattern(state, d);
      if (d && role === 'encoderShift') stepInstrument(state, d);
      return true;
    }
    if (role === 'shift') return true;
    if (role !== 'encoderPush' && role !== 'transport') return false;
    // A button sending controllers: act when it goes down, not on release.
    const down = value > 0;
    const was = this.held.get(key);
    this.held.set(key, down);
    if (down && !was) this.trigger(role, name);
    return true;
  }

  trigger(role, name) {
    const { state, clock } = this;
    if (role === 'encoderPush') {
      if (state.ui.stage !== 'rack') state.ui.picker = !state.ui.picker;
      return;
    }
    if (name === 'loop') clock.toggleLoop();
    if (name === 'stop') clock.stop();
    if (name === 'play') clock.toggle();
    if (name === 'rec') clock.setRec(!state.transport.rec);
  }

  // What a role controls: knobs follow the instrument on screen.
  roleParam(role) {
    if (!role) return null;
    const [kind, i] = role;
    if (kind === 'faders') return CHANNEL_LEVELS[i];
    const [id] = shownDevices(this.state);
    const bass = BASS_IDS.includes(id);
    // Mod strip: the classic acid move on a bass line, the delay feedback on drums.
    if (kind === 'mod') return bass ? `${id}.cutoff` : 'fx.delay.feedback';
    if (kind !== 'knobs') return null;
    if (i >= 6) return SHARED_KNOBS[i - 6](id);
    if (bass) return `${id}.${BASS_KNOBS[i]}`;
    // Drum machines: knobs 1-4 the selected instrument (as many as it has),
    // 5 the accent level, 6 the channel's pan.
    if (i === 4) return `${id}.ac.level`;
    if (i === 5) return `mixer.${id}.pan`;
    const cfg = KITS[id];
    const selected = this.state.drums[id].selected;
    const group = cfg.groups.find((g) => g.tracks.includes(selected)) ?? cfg.groups[0];
    const k = group.knobs[i];
    return k ? `${id}.${group.id}.${k[0]}` : null;
  }

  // Which hardware control drives which parameter right now, for the badges
  // on screen: knobs 1-8, sliders F1-F4, the mod strip, learned CCs.
  labels() {
    const out = new Map();
    const put = (key, label, role) => {
      if (!key) return;
      const param = this.resolve(this.bindings.get(key)) ?? this.roleParam(role);
      if (param && !out.has(param)) out.set(param, label);
    };
    const p = this.profile;
    p.knobs.forEach((k, i) => put(k, String(i + 1), ['knobs', i]));
    p.faders.forEach((k, i) => put(k, `F${i + 1}`, ['faders', i]));
    put(p.mod, 'MW', ['mod']);
    for (const [key, binding] of this.bindings) {
      const param = this.resolve(binding);
      if (param && !out.has(param)) out.set(param, `CC${key.split(':')[1]}`);
    }
    return out;
  }

  control(key, param = null) {
    let c = this.controls.get(key);
    if (!c) {
      const known = this.kinds.get(key) ?? { kind: null, sawLow: false, sawMid: false };
      this.controls.set(key, (c = { ...known, last: null, param, grabbed: false, repeats: 0, steps: 0 }));
    }
    return c;
  }

  // Endless encoders in relative mode send steps, plain knobs, faders and
  // encoders in absolute mode send values (see classify). Absolute controls
  // take over softly: only once they reach the current value, so nothing jumps.
  turn(key, param, value) {
    const { state } = this;
    const c = this.control(key, param);
    if (c.param !== param) Object.assign(c, { param, grabbed: false });
    if (!c.kind) this.classify(key, c, value);
    const prev = c.last;
    c.last = value;
    if (c.kind === 'relative') {
      state.set(param, state.get(param) + relativeDelta(c, value) / 127);
      this.remember(key, c);
      return;
    }
    const target = value / 127;
    const now = state.get(param);
    if (!c.grabbed) {
      const crossed = prev !== null && (prev / 127 - now) * (target - now) <= 0;
      c.grabbed = crossed || Math.abs(target - now) <= GRAB;
    }
    if (c.grabbed) state.set(param, target);
  }

  // A step (-1, 0, +1) from an encoder used as a stepper, relative or absolute.
  stepOf(key, value) {
    const c = this.control(key);
    if (!c.kind) this.classify(key, c, value);
    const prev = c.last;
    c.last = value;
    if (c.kind === 'relative') {
      const d = relativeDelta(c, value);
      this.remember(key, c);
      return Math.sign(d);
    }
    if (prev === null || Math.abs(value - prev) > 32) return 0;
    return Math.sign(value - prev);
  }

  // Endless or ordinary, from what the control sends. Ordinary (absolute)
  // knobs move in small steps, 40 41 42 43; endless (relative) ones repeat a
  // step code, 1 1 1 or 65 65, and those codes sit near 0, 64 or 127. Until
  // it's clear the control counts as ordinary, which never jumps (soft takeover).
  classify(key, c, value) {
    if (c.last !== null) {
      const d = Math.abs(value - c.last);
      const code = value <= 15 || value >= 113 || Math.abs(value - 64) <= 15;
      if (d === 0 && code && value !== 0 && value !== 127) c.repeats++;
      else if (d > 0 && d <= 4) c.steps++;
    }
    if (c.repeats >= 3 && c.repeats > c.steps * 2) c.kind = 'relative';
    else if (c.steps >= 4 && c.steps > c.repeats * 2) c.kind = 'absolute';
    if (c.kind) this.remember(key, c);
  }

  // Keep what's been learned about a control once it changes.
  remember(key, c) {
    const kind = { kind: c.kind, sawLow: c.sawLow, sawMid: c.sawMid };
    const old = this.kinds.get(key);
    if (old && old.kind === kind.kind && old.sawLow === kind.sawLow && old.sawMid === kind.sawMid) return;
    this.kinds.set(key, kind);
    this.saveKinds();
  }

  // --- SET UP MY CONTROLLER ---

  startSetup() {
    const empty = { knobs: Array(8).fill(null), faders: Array(4).fill(null), mod: null, encoder: null, encoderPush: null, encoderShift: null, shift: null, pads: null, transport: { loop: null, stop: null, play: null, rec: null } };
    this.state.ui.midiWindow = { mode: 'setup', step: 0, draft: empty, pending: null };
  }

  // Every key the draft has given a role.
  usedKeys(draft) {
    const used = new Set([...draft.knobs, ...draft.faders, draft.mod, draft.encoder, draft.encoderPush, draft.encoderShift, draft.shift, ...Object.values(draft.transport)].filter(Boolean));
    if (draft.pads) for (let i = 0; i < PAD_COUNT; i++) used.add(noteKey(draft.pads.channel, draft.pads.note + i));
    return used;
  }

  // An incoming message while setting up: it answers the current step if it
  // comes from a control that hasn't got a role yet and is the right kind.
  // Turns need a few messages from one control that aren't just 0 / 127, so
  // a button pressed by the way (Shift) isn't taken for a knob.
  capture(type, key, value) {
    const w = this.setup;
    const step = SETUP_STEPS[w.step];
    const used = this.usedKeys(w.draft);
    if (used.has(key)) {
      // Keep turning a knob already found: learn whether it's endless.
      if (type === 'cc') this.observe(key, value);
      return;
    }
    if (step.kind === 'note' && type !== 'note') return;
    if (step.kind === 'turn') {
      if (type !== 'cc') return;
      const p = w.pending?.key === key ? w.pending : (w.pending = { key, count: 0, moving: false });
      p.count++;
      if (value !== 0 && value !== 127) p.moving = true;
      this.observe(key, value);
      if (p.count < 3 || !p.moving) return;
    }
    if (step.kind === 'press' && type === 'cc' && value === 0) return;
    if (step.kind === 'note') {
      const [, ch, note] = key.split(':').map(Number);
      w.draft.pads = { channel: ch, note };
    } else if (step.role === 'transport') w.draft.transport[step.name] = key;
    else if (step.index !== undefined) w.draft[step.role][step.index] = key;
    else w.draft[step.role] = key;
    this.next();
  }

  // Classification while setting up, without moving anything.
  observe(key, value) {
    const c = this.control(key);
    if (!c.kind) this.classify(key, c, value);
    c.last = value;
  }

  next() {
    const w = this.setup;
    w.pending = null;
    w.step++;
    if (w.step >= SETUP_STEPS.length) this.finishSetup();
  }

  back() {
    const w = this.setup;
    if (!w || w.step === 0) return;
    w.step--;
    w.pending = null;
    const step = SETUP_STEPS[w.step];
    if (step.role === 'pads') w.draft.pads = null;
    else if (step.role === 'transport') w.draft.transport[step.name] = null;
    else if (step.index !== undefined) w.draft[step.role][step.index] = null;
    else w.draft[step.role] = null;
  }

  skip() {
    if (this.setup) this.next();
  }

  // Saves the layout. Learned single-knob bindings go: the layout replaces them.
  finishSetup() {
    const w = this.state.ui.midiWindow;
    store(PROFILE, w.draft);
    this.setProfile(w.draft);
    this.bindings.clear();
    this.save();
    this.controls.clear();
    this.held.clear();
    this.state.ui.midiWindow = { mode: 'done', draft: w.draft };
    this.notify(COPY.saved);
  }

  noteOn(channel, note, velocity) {
    const key = noteKey(channel, note);
    if (this.setup) return this.capture('note', key, velocity);
    const role = this.roles.get(key);
    if (role) {
      this.trigger(...role);
      return;
    }
    const pads = this.profile.pads;
    if (pads && channel === pads.channel && note >= pads.note && note < pads.note + PAD_COUNT) return this.pad(note - pads.note, velocity);
    const accent = velocity > ACCENT_VELOCITY;
    const [shown] = shownDevices(this.state);
    const id = stepTarget(this.state) ?? (BASS_IDS.includes(shown) ? shown : null);
    if (!id) return;
    // The 303 spans C an octave below to C two above; fold other notes in.
    let rel = note - MIDDLE_C;
    while (rel < -12) rel += 12;
    while (rel > 24) rel -= 12;
    const octave = rel === 24 ? 1 : Math.floor(rel / 12);
    const step = { note: rel - octave * 12, octave, accent };
    // Stopped in PATTERNS, keys write steps; otherwise they play the bass line
    // live (and record into the pattern when armed, see ui/live-bass.js).
    if (stepTarget(this.state) && !this.state.transport.playing) enterNote(this.state, this.engine, id, step);
    else this.live.noteOn(id, note, step);
  }

  // Pads play the drum machine on screen (Drum 09 when a bass line is), and
  // select the lane they hit.
  pad(index, velocity) {
    const [shown] = shownDevices(this.state);
    const id = DRUM_IDS.includes(shown) ? shown : 'r909';
    const lane = PAD_LANES[id][index];
    if (!lane) return;
    this.state.drums[id].selected = lane;
    this.engine.hitDrum(id, lane, velocity > ACCENT_VELOCITY ? 1 : 0);
  }
}
