// Session (de)serialisation: our own JSON format, also the target of the .rbs reader.
import { BASS_IDS, DRUM_IDS, emptyBassPattern, emptyBassStep, emptyDrumPattern, PATTERN_COUNT, STEPS } from '../state.js';
import { TRACK_IDS } from './song.js';

export const FORMAT = 're-rebirth';

export function serialize(state) {
  const device = (d) => ({ bank: d.bank, pattern: d.pattern, patterns: d.patterns });
  return {
    format: FORMAT,
    version: 1,
    info: state.info,
    transport: { tempo: state.transport.tempo, mode: state.transport.mode, loop: state.transport.loop },
    params: Object.fromEntries(state.params),
    bass: Object.fromEntries(BASS_IDS.map((id) => [id, device(state.bass[id])])),
    drums: Object.fromEntries(DRUM_IDS.map((id) => [id, device(state.drums[id])])),
    song: state.song,
  };
}

const num = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

function bassPattern(p) {
  const out = emptyBassPattern();
  if (!p) return out;
  out.length = num(p.length, 1, STEPS, STEPS);
  out.shuffle = !!p.shuffle;
  out.steps = Array.from({ length: STEPS }, (_, i) => {
    const s = p.steps?.[i] ?? emptyBassStep();
    return { note: num(s.note, 0, 12, 0), octave: num(s.octave, -1, 1, 0), accent: !!s.accent, slide: !!s.slide, gate: !!s.gate };
  });
  return out;
}

function drumPattern(p) {
  const out = emptyDrumPattern();
  if (!p) return out;
  out.length = num(p.length, 1, STEPS, STEPS);
  out.shuffle = !!p.shuffle;
  for (const [track, steps] of Object.entries(p.tracks ?? {})) {
    out.tracks[track] = Array.from({ length: STEPS }, (_, i) => num(Number(steps[i]), 0, 3, 0));
  }
  return out;
}

function device(target, src, makePattern) {
  if (!src) return;
  target.patterns = Array.from({ length: PATTERN_COUNT }, (_, i) => makePattern(src.patterns?.[i]));
  target.bank = num(src.bank, 0, 3, 0);
  target.pattern = num(src.pattern, 0, 7, 0);
}

export function applySession(state, s) {
  if (s?.format !== FORMAT) throw new Error('Not a Re-Rebirth session');
  state.clearSong();
  Object.assign(state.info, s.info ?? {});
  for (const [key, value] of Object.entries(s.params ?? {})) {
    if (Number.isFinite(value)) state.params.set(key, num(value, 0, 1, 0));
  }
  const t = s.transport ?? {};
  if (Number.isFinite(t.tempo)) state.setTempo(t.tempo);
  state.transport.mode = t.mode === 'song' ? 'song' : 'pattern';
  state.transport.loop = !!t.loop;
  for (const id of BASS_IDS) device(state.bass[id], s.bass?.[id], bassPattern);
  for (const id of DRUM_IDS) device(state.drums[id], s.drums?.[id], drumPattern);

  const song = s.song ?? {};
  for (const id of TRACK_IDS) {
    state.song.tracks[id] = (song.tracks?.[id] ?? [])
      .filter((e) => Number.isFinite(e.tick) && typeof e.key === 'string')
      .sort((a, b) => a.tick - b.tick);
  }
  state.song.length = num(song.length, 0, 1e7, 0);
  state.song.loopStart = num(song.loopStart, 0, 1e7, 0);
  state.song.loopEnd = num(song.loopEnd, 0, 1e7, state.song.length);
  state.emit('reset', {});
}
