// Computer-keyboard step entry for the bass lines in PATTERNS: a piano row
// (A W S E D F T G Y H U J K = C..C) writes the selected step and moves on.
import { shownDevices } from '../render/focus-view.js';
import { BASS_IDS } from '../state.js';

const NOTE_KEYS = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12 };

// The bass line notes are written to: the one PATTERNS shows, if no window is open.
export function stepTarget(state) {
  const { ui } = state;
  if (ui.stage !== 'patterns' || ui.about || ui.library || ui.automation || ui.picker || ui.export || ui.help || ui.midiWindow) return null;
  const [id] = shownDevices(state);
  return BASS_IDS.includes(id) ? id : null;
}

// Writes a note (0..12 above C, octave -1..1) on the selected step, plays it,
// and moves the cursor on. Shared by the computer keyboard and MIDI keys.
export function enterNote(state, engine, id, { note, octave, accent }) {
  const dev = state.bass[id];
  const pattern = state.pattern(id);
  const step = pattern.steps[dev.selectedStep];
  Object.assign(step, { note, octave, gate: true, tie: false, accent, slide: false });
  engine.auditionBass(id, step);
  dev.selectedStep = (dev.selectedStep + 1) % pattern.length;
}

// Returns true when the key was a step-entry key (the caller re-renders and saves).
export function stepKey(e, state, engine) {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const id = stepTarget(state);
  if (!id) return false;
  const dev = state.bass[id];
  const pattern = state.pattern(id);
  const len = pattern.length;
  const move = (d) => (dev.selectedStep = (((dev.selectedStep + d) % len) + len) % len);
  const step = pattern.steps[dev.selectedStep];

  if (e.code in NOTE_KEYS) {
    if (!e.repeat) enterNote(state, engine, id, { note: NOTE_KEYS[e.code], octave: state.ui.octave, accent: e.shiftKey });
    return true;
  }
  switch (e.code) {
    case 'KeyZ':
    case 'KeyX':
      state.ui.octave = Math.min(1, Math.max(-1, state.ui.octave + (e.code === 'KeyX' ? 1 : -1)));
      return true;
    // Slide from the note just typed into the next one.
    case 'Tab': {
      const prev = pattern.steps[(dev.selectedStep - 1 + len) % len];
      prev.slide = !prev.slide;
      return true;
    }
    case 'Backspace':
    case 'Delete':
      Object.assign(step, { gate: false, tie: false, accent: false, slide: false });
      move(1);
      return true;
    // Shift + arrows shift the whole pattern (ui/shortcuts.js).
    case 'ArrowLeft':
      if (e.shiftKey) return false;
      move(-1);
      return true;
    case 'ArrowRight':
      if (e.shiftKey) return false;
      move(1);
      return true;
  }
  return false;
}
