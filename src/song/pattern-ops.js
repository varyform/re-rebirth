// Pattern editing operations shared by the bass and drum panels.
import { BASS_IDS, emptyBassPattern, emptyDrumPattern, HIT, STEPS } from '../state.js';

const clipboard = { bass: null, drum: null };
const kind = (id) => (BASS_IDS.includes(id) ? 'bass' : 'drum');
const clone = (p) => structuredClone(p);

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
  const dev = state.device(id);
  dev.patterns[state.patternIndex(id)] = pattern;
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
