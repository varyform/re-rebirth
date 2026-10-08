// A starter song so the rack isn't empty on first load.
import { emptyBassPattern, emptyDrumPattern } from './state.js';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Tokens: note name, optional ^ (high C), +/- octave, flags a=accent s=slide; "." is a rest.
function bassLine(src) {
  const pattern = emptyBassPattern();
  pattern.steps = src.trim().split(/\s+/).map((tok) => {
    if (tok === '.') return { note: 0, octave: 0, accent: false, slide: false, gate: false };
    const m = /^([A-G]#?)(\^?)([+-]?)([as]*)$/.exec(tok);
    if (!m) throw new Error(`Bad bass token: ${tok}`);
    return {
      note: NOTES.indexOf(m[1]) + (m[2] ? 12 : 0),
      octave: m[3] === '+' ? 1 : m[3] === '-' ? -1 : 0,
      accent: m[4].includes('a'),
      slide: m[4].includes('s'),
      gate: true,
    };
  });
  return pattern;
}

// "x" = normal hit, "o" = soft hit.
function drumPattern(tracks, hit = 2) {
  const pattern = emptyDrumPattern();
  for (const [k, v] of Object.entries(tracks)) pattern.tracks[k] = [...v].map((c) => (c === 'x' ? hit : c === 'o' ? 1 : 0));
  return pattern;
}

export function loadDemo(state) {
  state.info.title = 'Demo';
  state.transport.tempo = 125;
  state.bass.bass1.patterns[0] = bassLine('C . C+a D# C G-s G- A#a C . C+s C F#a . G A#s');
  state.bass.bass1.selectedStep = 2;
  state.bass.bass2.patterns[0] = bassLine('C-a . . C- . . D#-a . C- . G-s A#- . C-a . .');
  state.bass.bass2.selectedStep = 6;

  state.drums.r808.patterns[0] = drumPattern(
    {
      bd: 'x.....x...x..x..',
      sd: '....x.......x...',
      ch: 'x.x.x.x.x.xxx.x.',
      oh: '..............x.',
      cb: '...x.......x....',
      cp: '............x...',
      ac: '....x.......x...',
    },
    1,
  );
  state.drums.r808.selected = 'ch';

  state.drums.r909.patterns[0] = drumPattern({
    bd: 'x...x...x...x...',
    cp: '....x.......x...',
    sd: '.......o.o....x.',
    ch: 'x...x...x...x...',
    oh: '..x...x...x...x.',
    rd: 'x.x.x.x.x.x.x.x.',
    ac: 'x...x...x...x...',
  });
  state.drums.r909.selected = 'bd';

  state.set('fx.pcf.target', 0);
}
