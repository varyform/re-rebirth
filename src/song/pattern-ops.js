// Pattern editing operations shared by the bass and drum panels, the PATTERNS
// stage and its keys. Every operation that rewrites a pattern announces the
// pattern as it was ('patternEdit'), so UNDO (sequencer/clock.js) can bring it back.
import { BASS_IDS, emptyBassPattern, emptyDrumPattern, HIT, STEPS } from '../state.js';

const clipboard = { bass: null, drum: null };
const kind = (id) => (BASS_IDS.includes(id) ? 'bass' : 'drum');
const clone = (p) => structuredClone(p);

// Runs `fn(pattern)` on a copy of the shown pattern and puts the result in its
// place, if `fn` doesn't return false.
function editPattern(state, id, fn) {
  const dev = state.device(id);
  const index = state.patternIndex(id);
  const before = dev.patterns[index];
  const next = clone(before);
  if (fn(next) === false) return false;
  dev.patterns[index] = next;
  state.emit('patternEdit', { id, index, before });
  return true;
}

export function copyPattern(state, id) {
  clipboard[kind(id)] = clone(state.pattern(id));
}

export function canPaste(id) {
  return clipboard[kind(id)] !== null;
}

export function pastePattern(state, id) {
  const src = clipboard[kind(id)];
  if (!src) return;
  replacePattern(state, id, clone(src));
}

export function clearPattern(state, id) {
  const fresh = kind(id) === 'bass' ? emptyBassPattern() : emptyDrumPattern();
  const current = state.pattern(id);
  fresh.length = current.length;
  fresh.shuffle = current.shuffle;
  replacePattern(state, id, fresh);
}

export function setLength(state, id, length) {
  state.pattern(id).length = Math.min(STEPS, Math.max(1, length));
}

function replacePattern(state, id, pattern) {
  editPattern(state, id, (p) => Object.assign(p, pattern));
}

// The step lists of a pattern, each `length` long: a bass line has one, a drum
// pattern one per lane. Operations work within the length, leaving the steps
// past it alone.
function lanes(p) {
  return p.steps ? [p.steps] : Object.values(p.tracks);
}

// Moves every step by `d` (1: right), wrapping around the pattern's length.
export function shiftPattern(state, id, d) {
  return editPattern(state, id, (p) => {
    const n = p.length;
    for (const steps of lanes(p)) {
      const head = steps.slice(0, n);
      for (let i = 0; i < n; i++) steps[(i + d + n * 4) % n] = head[i];
    }
  });
}

// Plays the pattern backwards. A bass note held by ties is reversed as a whole (the
// note still comes first), and a slide, which belongs to the gap between two notes,
// stays with that gap: the slide out of each note becomes the slide out of the note
// that now comes before it.
export function reversePattern(state, id) {
  return editPattern(state, id, (p) => {
    const n = p.length;
    if (!p.steps) {
      for (const steps of lanes(p)) steps.splice(0, n, ...steps.slice(0, n).reverse());
      return;
    }
    // Spans: a step and the ties that hold it.
    const spans = [];
    p.steps.slice(0, n).forEach((s, i) => (s.tie && i > 0 ? spans.at(-1).push(s) : spans.push([s])));
    const slideOut = spans.map((span) => span.at(-1).slide);
    const k = spans.length;
    spans.forEach((span, i) => (span.at(-1).slide = slideOut[(i - 1 + k) % k]));
    p.steps.splice(0, n, ...spans.reverse().flat());
  });
}

// Repeats steps 1..length after themselves and doubles the length (up to 16), so
// the copy can be varied.
export function doublePattern(state, id) {
  return editPattern(state, id, (p) => {
    const n = p.length;
    if (n * 2 > STEPS) return false;
    for (const steps of lanes(p)) for (let i = 0; i < n; i++) steps[n + i] = clone(steps[i]);
    p.length = n * 2;
  });
}

// A bass line's notes up or down by `d` semitones (12: an octave). Refused if a
// played note would leave the 303's three octaves; rests follow where they can.
const LOWEST = -12;
const HIGHEST = 24;
const pitchOf = (s) => s.note + s.octave * 12;
function setPitch(s, v) {
  const octave = v >= HIGHEST ? 1 : Math.floor(v / 12);
  Object.assign(s, { octave, note: v - octave * 12 });
}
export function transposePattern(state, id, d) {
  if (kind(id) !== 'bass') return false;
  return editPattern(state, id, (p) => {
    const played = p.steps.slice(0, p.length).filter((s) => s.gate);
    if (played.some((s) => pitchOf(s) + d < LOWEST || pitchOf(s) + d > HIGHEST)) return false;
    for (const s of p.steps) setPitch(s, Math.min(HIGHEST, Math.max(LOWEST, pitchOf(s) + d)));
  });
}

// Random generators aim for something playable rather than noise.
const MINOR_PENTATONIC = [0, 3, 5, 7, 10, 12];
const chance = (p) => Math.random() < p;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function randomizePattern(state, id) {
  const current = state.pattern(id);
  if (kind(id) === 'bass') {
    const p = emptyBassPattern();
    p.length = current.length;
    p.shuffle = current.shuffle;
    p.steps = p.steps.map((_, i) => ({
      note: pick(MINOR_PENTATONIC),
      octave: chance(0.15) ? 1 : chance(0.15) ? -1 : 0,
      accent: chance(0.25),
      slide: chance(0.2),
      gate: i % 4 === 0 || chance(0.6),
    }));
    replacePattern(state, id, p);
    return;
  }
  // Drums: per-instrument densities keep kick/snare/hats in their usual roles.
  const p = emptyDrumPattern();
  p.length = current.length;
  p.shuffle = current.shuffle;
  const hit = HIT.on;
  const density = { bd: [0.9, 0.1, 0.25, 0.1], sd: [0, 0.05, 0.1, 0.05], ch: [0.8, 0.4, 0.8, 0.4], oh: [0, 0, 0.35, 0], cp: [0, 0, 0, 0], ac: [0.4, 0, 0.1, 0] };
  for (const [track, [onBeat, e, and, a]] of Object.entries(density)) {
    p.tracks[track] = Array.from({ length: STEPS }, (_, i) => (chance([onBeat, e, and, a][i % 4]) ? hit : 0));
  }
  for (const i of [4, 12]) p.tracks[chance(0.5) ? 'sd' : 'cp'][i] = hit;
  replacePattern(state, id, p);
}
