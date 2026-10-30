// Keyboard shortcuts, one table for handling keys and for the "/" overlay, so
// what the overlay lists is exactly what the keys do. Groups apply in a
// context (stage, instrument, picker); the first group whose key matches wins,
// most specific first.
import { RAIL_STRIPS } from '../render/devices/rail.js';
import { brushOf, rangeBars } from '../render/devices/arrange.js';
import { R808, R909 } from '../render/devices/drum-machine.js';
import { openExport } from '../render/export.js';
import { openSongInfo } from '../render/song-info.js';
import { shownDevices } from '../render/focus-view.js';
import { deleteBars, duplicateBars, insertBars } from '../song/arrange-ops.js';
import { doublePattern, reversePattern, shiftPattern, transposePattern } from '../song/pattern-ops.js';
import { BASS_IDS, DRUM_IDS } from '../state.js';
import { toggleSolo } from '../channels.js';
import { STAGES } from '../render/devices/stage-bar.js';

const KITS = { r808: R808, r909: R909 };
// Home row plays drum lanes, in the grid's order (accent left out).
const LANE_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'];

const mod = (e) => e.metaKey || e.ctrlKey;
const plain = (e) => !mod(e) && !e.altKey;
const key = (code, { shift = null, withMod = false } = {}) => (e) =>
  e.code === code && (withMod ? mod(e) && !e.altKey : plain(e)) && (shift === null || e.shiftKey === shift);

const shown = (state) => shownDevices(state)[0];
const focus = (state) => state.ui.stage !== 'rack';
const bassShown = (state) => BASS_IDS.includes(shown(state));

// Steps the shown machine's pattern by `d` (8 = a bank), from the queued pick
// if any so repeated presses while playing keep stepping. In ARRANGE it moves
// the row's brush instead of what plays.
export function stepPattern(state, d) {
  const id = shown(state);
  const dev = state.device(id);
  if (state.ui.stage === 'arrange') {
    state.ui.brush[id] = (brushOf(state, id) + d + 32) % 32;
    return;
  }
  const from = dev.queued ?? dev.bank * 8 + dev.pattern;
  state.pickPattern(id, (from + d + 32) % 32);
}

export function stepInstrument(state, d) {
  const ids = RAIL_STRIPS.map(([id]) => id);
  state.ui.show = ids[(ids.indexOf(shown(state)) + d + ids.length) % ids.length];
}

function drumLanes(id) {
  return Object.keys(KITS[id].trackNames).filter((t) => t !== 'ac');
}

function stepLane(state, d) {
  const id = shown(state);
  const lanes = Object.keys(KITS[id].trackNames);
  const dev = state.drums[id];
  dev.selected = lanes[(lanes.indexOf(dev.selected) + d + lanes.length) % lanes.length];
}

// Groups for the current context, most specific first. Items: { keys (as shown),
// label, test(e), run(e) }; items without `test` are listed only (handled
// elsewhere, like note entry in ui/step-keys.js).
export function shortcutGroups(state, app) {
  const { ui, transport: t } = state;
  const { clock } = app;
  const id = shown(state);
  const groups = [];

  if (focus(state) && ui.picker) {
    groups.push({
      title: ui.stage === 'arrange' ? 'PATTERN PICKER (BRUSH)' : 'PATTERN PICKER',
      items: [
        { keys: '\u2190 \u2192', label: 'Previous / next pattern', test: key('ArrowLeft'), run: () => stepPattern(state, -1) },
        { test: key('ArrowRight'), run: () => stepPattern(state, 1) },
        { keys: '\u2191 \u2193', label: 'Previous / next bank', test: key('ArrowUp'), run: () => stepPattern(state, -8) },
        { test: key('ArrowDown'), run: () => stepPattern(state, 8) },
        ...(ui.stage === 'arrange'
          ? []
          : [
            { keys: '\u21E7 CLICK', label: 'Add a pattern to the chain (played in turn, pattern mode)' },
            { keys: '\u232B', label: 'Clear the chain', test: (e) => plain(e) && (e.code === 'Backspace' || e.code === 'Delete'), run: () => state.clearChain(id) },
          ]),
        { keys: 'P  ESC', label: 'Close the picker', test: key('KeyP'), run: () => (ui.picker = false) },
      ],
    });
  }

  if (ui.stage === 'patterns' && !ui.picker && bassShown(state)) {
    groups.push({
      title: 'PATTERNS \u00B7 BASS LINE',
      items: [
        { keys: 'A W S E D F T G Y H U J K', label: 'Write a note (C to C), cursor moves on' },
        { keys: '\u21E7 + NOTE', label: 'Note with accent' },
        { keys: 'Z  X', label: 'Octave down / up' },
        { keys: 'TAB', label: 'Slide into the next note' },
        { keys: '\u232B', label: 'Rest' },
        { keys: '\u2190 \u2192', label: 'Move the cursor' },
        {
          keys: 'R',
          label: `Record MIDI keys into the pattern while it plays (now ${ui.liveRec ? 'ON' : 'OFF'})`,
          test: key('KeyR', { shift: false }),
          run: () => app.midi?.live.toggleRec(),
        },
      ],
    });
  }

  if (ui.stage === 'patterns' && !ui.picker && DRUM_IDS.includes(id)) {
    const lanes = drumLanes(id);
    groups.push({
      title: 'PATTERNS \u00B7 DRUMS',
      items: [
        { keys: 'A S D F G H J K L ; \u2019', label: `Play a lane (${lanes.map((l) => l.toUpperCase()).join(' ')}) and select it` },
        ...lanes.map((lane, i) => ({
          test: key(LANE_KEYS[i]),
          run: (e) => {
            if (e.repeat) return;
            state.drums[id].selected = lane;
            app.engine.hitDrum(id, lane, e.shiftKey ? 1 : 0);
          },
        })),
        ...lanes.map((lane, i) => ({
          test: key(LANE_KEYS[i], { shift: true }),
          run: (e) => {
            if (e.repeat) return;
            state.drums[id].selected = lane;
            app.engine.hitDrum(id, lane, 1);
          },
        })),
        { keys: '\u21E7 + LANE KEY', label: 'Play it accented' },
        { keys: '\u2190 \u2192', label: 'Select the previous / next lane', test: key('ArrowLeft', { shift: false }), run: () => stepLane(state, -1) },
        { test: key('ArrowRight', { shift: false }), run: () => stepLane(state, 1) },
      ],
    });
  }

  if (ui.stage === 'patterns' && !ui.picker) {
    groups.push({
      title: 'PATTERNS \u00B7 PATTERN TOOLS',
      items: [
        { keys: '\u21E7 \u2190 \u2192', label: 'Shift the pattern a step left / right', test: key('ArrowLeft', { shift: true }), run: () => shiftPattern(state, id, -1) },
        { test: key('ArrowRight', { shift: true }), run: () => shiftPattern(state, id, 1) },
        ...(bassShown(state)
          ? [
            { keys: '\u21E7 \u2191 \u2193', label: 'Transpose a semitone up / down', test: key('ArrowUp', { shift: true }), run: () => transposePattern(state, id, 1) },
            { test: key('ArrowDown', { shift: true }), run: () => transposePattern(state, id, -1) },
            { keys: '\u2318/CTRL \u21E7 \u2191 \u2193', label: 'Transpose an octave up / down', test: key('ArrowUp', { withMod: true, shift: true }), run: () => transposePattern(state, id, 12) },
            { test: key('ArrowDown', { withMod: true, shift: true }), run: () => transposePattern(state, id, -12) },
          ]
          : []),
        { keys: '\u21E7 R', label: 'Reverse the pattern', test: key('KeyR', { shift: true }), run: () => reversePattern(state, id) },
        { keys: '\u2318/CTRL D', label: 'Double the pattern (steps 1\u20138 repeated on 9\u201316)', test: key('KeyD', { withMod: true }), run: () => doublePattern(state, id) },
      ],
    });
  }

  if (ui.stage === 'arrange') {
    const edit = (fn) => () => clock.edit(fn);
    const range = rangeBars(state.song);
    groups.push({
      title: 'ARRANGE',
      items: [
        { keys: '\u2318/CTRL D', label: 'Duplicate A\u2013B', test: key('KeyD', { withMod: true }), run: () => range && clock.edit((s) => duplicateBars(s, ...range)) },
        { keys: '\u232B', label: 'Delete A\u2013B', test: (e) => plain(e) && (e.code === 'Backspace' || e.code === 'Delete'), run: () => range && clock.edit((s) => deleteBars(s, ...range)) },
        { keys: 'I', label: 'Insert 4 bars at A (or here)', test: key('KeyI'), run: edit((s) => insertBars(s, range ? range[0] : Math.max(0, t.bar - 1), 4)) },
      ],
    });
  }

  if (ui.stage === 'automate') {
    groups.push({
      title: 'AUTOMATE',
      items: [
        { keys: 'L', label: 'Loop A\u2013B on / off', test: key('KeyL'), run: () => clock.toggleLoop() },
        { keys: 'T', label: `Record mode: LATCH / TOUCH (now ${ui.recMode.toUpperCase()})`, test: key('KeyT'), run: () => (ui.recMode = ui.recMode === 'latch' ? 'touch' : 'latch') },
      ],
    });
  }

  if (focus(state) && !ui.picker) {
    const items = [
      { keys: '\u2191 \u2193', label: 'Previous / next instrument', test: key('ArrowUp'), run: () => stepInstrument(state, -1) },
      { test: key('ArrowDown'), run: () => stepInstrument(state, 1) },
      { keys: '[  ]', label: ui.stage === 'arrange' ? 'Previous / next brush pattern' : 'Previous / next pattern', test: key('BracketLeft'), run: () => stepPattern(state, -1) },
      { test: key('BracketRight'), run: () => stepPattern(state, 1) },
      { keys: 'P', label: 'Pattern picker', test: key('KeyP'), run: () => (ui.picker = true) },
      { keys: 'M', label: 'Instrument on / off', test: key('KeyM', { shift: false }), run: () => state.toggle(`${id}.on`) },
      { keys: '\u21E7 M', label: 'Solo: only this instrument on (again: the others back)', test: key('KeyM', { shift: true }), run: () => toggleSolo(state, id) },
    ];
    groups.push({ title: 'INSTRUMENT', items });
  }

  // Moving through the song, where there is one (not PATTERNS: it loops).
  const songStage = ui.stage !== 'patterns';
  const transport = [
    { keys: 'SPACE', label: 'Play / stop (stop twice: back to the start)', test: key('Space'), run: (e) => !e.repeat && clock.toggle() },
    ...(songStage
      ? [
        { keys: 'R', label: 'Record on / off', test: key('KeyR'), run: () => clock.setRec(!t.rec) },
        { keys: '\u2190 \u2192', label: 'Back / forward a bar (\u21E7: 4 bars)', test: key('ArrowLeft', { shift: false }), run: () => clock.seekBar(-1) },
        { test: key('ArrowRight', { shift: false }), run: () => clock.seekBar(1) },
        { test: key('ArrowLeft', { shift: true }), run: () => clock.seekBar(-4) },
        { test: key('ArrowRight', { shift: true }), run: () => clock.seekBar(4) },
        { keys: 'HOME', label: 'To the start', test: key('Home'), run: () => clock.seekTo(1) },
      ]
      : []),
    { keys: '\u2318/CTRL Z', label: 'Undo the last pass or edit', test: key('KeyZ', { withMod: true, shift: false }), run: () => clock.undoPass() },
  ];
  groups.push({ title: 'TRANSPORT', items: transport });

  const stageKeys = STAGES.map(([stage, label], i) => ({ test: key(`Digit${i + 1}`), run: () => Object.assign(ui, { stage, picker: false }), label }));
  groups.push({
    title: 'EVERYWHERE',
    items: [
      { keys: `1\u2013${STAGES.length}`, label: STAGES.map(([, label]) => label).join(' \u00B7 ') },
      ...stageKeys.map(({ test, run }) => ({ test, run })),
      // F types a note (bass line) or plays a lane (drums) in PATTERNS.
      ...(ui.stage === 'patterns' && !ui.picker
        ? []
        : [{ keys: 'F', label: 'Full screen on / off', test: key('KeyF'), run: (e) => !e.repeat && app.toggleFullscreen() }]),
      { keys: '\u2318/CTRL S', label: 'Save the song (ReBirth .rbs)', test: key('KeyS', { withMod: true, shift: false }), run: () => app.notify(app.files.saveRbs()) },
      { keys: '\u2318/CTRL \u21E7 S', label: 'Save as a Re-Rebirth session (.json, keeps everything)', test: key('KeyS', { withMod: true, shift: true }), run: () => app.files.save() },
      { keys: '\u2318/CTRL I', label: 'Song information', test: key('KeyI', { withMod: true }), run: () => openSongInfo(state) },
      { keys: '\u2318/CTRL O', label: 'Open a song', test: key('KeyO', { withMod: true }), run: () => app.files.pick() },
      { keys: '\u2318/CTRL E', label: 'Export WAV', test: key('KeyE', { withMod: true }), run: () => openExport(state) },
      { keys: 'ESC', label: 'Close a window, the picker, this list' },
      { keys: '/', label: 'This list', test: (e) => e.key === '/' || e.key === '?', run: () => (ui.help = !ui.help) },
    ],
  });
  return groups;
}

// Runs the shortcut for `e`, if any. Returns true when one ran.
export function runShortcut(e, state, app) {
  for (const group of shortcutGroups(state, app)) {
    for (const item of group.items) {
      if (!item.test?.(e)) continue;
      item.run(e);
      return true;
    }
  }
  return false;
}
