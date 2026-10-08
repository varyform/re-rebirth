// A starter song so the rack isn't empty on first load.

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Tokens: note name, optional ^ (high C), +/- octave, flags a=accent s=slide; "." is a rest.
function bassLine(src) {
  return src.trim().split(/\s+/).map((tok) => {
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
}

const hits = (src) => [...src].map((c) => c === 'x');

function drumPattern(tracks) {
  return Object.fromEntries(Object.entries(tracks).map(([k, v]) => [k, hits(v)]));
}

export function loadDemo(state) {
  state.bass.bass1.patterns[0] = bassLine('C . C+a D# C G-s G- A#a C . C+s C F#a . G A#s');
  state.bass.bass1.selectedStep = 2;
  state.bass.bass2.patterns[0] = bassLine('C-a . . C- . . D#-a . C- . G-s A#- . C-a . .');
  state.bass.bass2.selectedStep = 6;

  state.drums.r808.patterns[0] = drumPattern({
    bd: 'x.....x...x..x..',
    sd: '....x.......x...',
    ch: 'x.x.x.x.x.xxx.x.',
    oh: '..............x.',
    cb: '...x.......x....',
    cp: '............x...',
    ac: '....x.......x...',
  });
  state.drums.r808.selected = 'ch';

  state.drums.r909.patterns[0] = drumPattern({
    bd: 'x...x...x...x...',
    cp: '....x.......x...',
    sd: '.......x.x....x.',
    ch: 'x...x...x...x...',
    oh: '..x...x...x...x.',
    rd: 'x.x.x.x.x.x.x.x.',
    ac: 'x...x...x...x...',
  });
  state.drums.r909.selected = 'bd';

  state.fx.pcf = [1, 0.2, 0.6, 0.2, 0.9, 0.3, 0.5, 0.1, 1, 0.2, 0.7, 0.3, 0.8, 0.4, 0.6, 0.2];
}
