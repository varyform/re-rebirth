// Compact transport for the focus stages, one row: stage tabs, play controls,
// tempo and position on the left; MIDI and full screen on the right. (Which
// instrument is shown is picked on the rail, see rail.js.)
import { hits } from '../../ui/hits.js';
import { click, tempoDrag } from '../../ui/handlers.js';
import { button, icon, lcd, led, line, panel, sevenSeg, sevenSegWidth, shapeWidth, text, textWidth } from '../primitives.js';
import { openExport } from '../export.js';
import { C } from '../theme.js';

export const STAGE_BAR_H = 30;
// Narrowest bar that fits every button: a stacked bass line's width, so the
// bar never widens the PATTERNS reference layout.
export const STAGE_BAR_MIN_W = 580;
export const STAGES = [
  ['rack', 'RACK'],
  ['patterns', 'PATTERNS'],
  ['arrange', 'ARRANGE'],
  ['automate', 'AUTOMATE'],
  ['mix', 'MIX'],
];
const COPY = {
  export: 'EXPORT',
  midi: 'MIDI',
  learn: 'LEARN',
  keys: (oct) => `A\u2013K NOTES \u00B7 Z X OCTAVE ${oct > 0 ? '+' : ''}${oct} \u00B7 \u21E7 ACCENT \u00B7 TAB SLIDE \u00B7 \u232B REST \u00B7 SLIDE + REST HOLDS (\u2040)`,
  liveRec: (on) => (on ? ' \u00B7 \u25CF RECORDING MIDI KEYS (R)' : ' \u00B7 R RECORDS MIDI KEYS'),
};
const TAB = { size: 6.5, weight: 800, spacing: 0.3 };
const ROW = { y: 5, h: 20 };
const GROUP_GAP = 8;
const MIDI_LED = { off: null, waiting: C.ledYellow, on: C.ledGreen, denied: C.ledRed };

export class StageBar {
  constructor(state, app, x, y, w) {
    Object.assign(this, { state, app, x, y, w, h: STAGE_BAR_H });
  }

  draw(ctx) {
    const { w, h, state } = this;
    panel(ctx, 0, 0, w, h, C.transport);

    let x = 8;
    for (const [stage, label] of STAGES) {
      x += tab(ctx, x, ROW, label, state.ui.stage === stage, () => (state.ui.stage = stage), `stage.${stage}`) + 3;
    }
    this.drawTransport(ctx, x + GROUP_GAP - 3);

    let rx = w - 8;
    rx -= this.drawFullscreen(ctx, rx) + 3;
    rx -= this.drawMidi(ctx, rx) + 3;
    tab(ctx, rx, ROW, COPY.export, false, () => openExport(state), 'stage.export', 'right');
  }

  // Connects MIDI, then opens the MIDI window (set up, learn, reset); while
  // learning it reads LEARN, and a click ends it. The LED shows the
  // connection. Not drawn where the browser has no Web MIDI.
  drawMidi(ctx, rx) {
    const { state, app } = this;
    if (state.ui.midi === 'unavailable') return -3;
    const learning = !!state.ui.midiLearn;
    const bw = textWidth(ctx, COPY.learn, TAB) + 18;
    const x = rx - bw;
    const key = 'stage.midi';
    const held = learning || hits.isPressed(key);
    const off = button(ctx, x, ROW.y, bw, ROW.h, { face: held ? C.btnPressed : C.btnDark, pressed: held });
    const color = MIDI_LED[state.ui.midi];
    led(ctx, x + 6, ROW.y + ROW.h / 2 + off, 1.8, !!color, color ?? C.ledGreen);
    text(ctx, learning ? COPY.learn : COPY.midi, x + 11 + (bw - 11) / 2, ROW.y + ROW.h / 2 + 0.5 + off, { ...TAB, color: learning ? C.ledYellow : C.inkLight });
    hits.rect(ctx, x, ROW.y, bw, ROW.h, click(() => app.midi.press(), key));
    return bw;
  }

  drawTransport(ctx, x) {
    const { state, app } = this;
    const t = state.transport;
    const { y, h } = ROW;
    const patterns = state.ui.stage === 'patterns';
    const buttons = [
      ['stop', () => app.clock.stop(), !t.playing, C.ledRed],
      ['play', () => app.clock.play(), t.playing, C.ledGreen],
      // REC records the song, which PATTERNS doesn't play (see main.js syncStageMode).
      ...(patterns ? [] : [['rec', () => app.clock.setRec(!t.rec), t.rec, C.ledRed]]),
    ];
    for (const [kind, fn, on, color] of buttons) {
      const key = `stage.${kind}`;
      const held = on || hits.isPressed(key);
      const off = button(ctx, x, y, 24, h, { face: held ? C.btnPressed : C.btnDark, pressed: held });
      icon(ctx, kind, x + 12, y + h / 2 + off, 9, kind === 'rec' || on ? color : C.inkLight);
      hits.rect(ctx, x, y, 24, h, click(fn, key));
      x += 27;
    }

    // Tempo: drag or scroll the readout (shift: 0.1 BPM), like the rack's.
    x += GROUP_GAP - 3;
    lcd(ctx, x, y, 46, h);
    const tempo = t.tempo.toFixed(1).padStart(5, ' ');
    sevenSeg(ctx, tempo, x + (46 - sevenSegWidth(tempo, 7.5)) / 2, y + 4, 7.5, h - 8);
    hits.rect(ctx, x, y, 46, h, tempoDrag(state));

    x += 50;
    lcd(ctx, x, y, 46, h);
    const pos = patterns ? this.patternPosition() : `${String(t.bar).padStart(3, '0')}.${String(Math.max(0, t.step) + 1).padStart(2, '0')}`;
    sevenSeg(ctx, pos, x + (46 - sevenSegWidth(pos, 6.5)) / 2, y + 4.5, 6.5, h - 9);
  }

  // PATTERNS loops patterns, so bars mean nothing there: the shown machine's
  // pattern and the step it's on ("B3 05"), or "--" while stopped.
  patternPosition() {
    const { state } = this;
    const t = state.transport;
    const id = state.ui.show;
    const dev = state.device(id);
    const index = dev.bank * 8 + dev.pattern;
    const pos = t.playing && t.step >= 0 ? t.positions[id] : null;
    const step = pos == null ? '--' : String(pos + 1).padStart(2, '0');
    return `${'ABCD'[Math.floor(index / 8)]}${(index % 8) + 1} ${step}`;
  }

  // Four corner brackets; returns the button width.
  drawFullscreen(ctx, rx) {
    const { y, h } = ROW;
    const bw = 24;
    const x = rx - bw;
    const key = 'stage.full';
    const off = button(ctx, x, y, bw, h, { pressed: hits.isPressed(key) });
    const [cx, cy, s, l] = [x + bw / 2, y + h / 2 + off, 5, 2.6];
    ctx.strokeStyle = C.inkLight;
    shapeWidth(ctx, 1.3); // an icon: scales with its shape
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const [px, py] = [cx + dx * s, cy + dy * s];
      line(ctx, px, py, px - dx * l, py);
      line(ctx, px, py, px, py - dy * l);
    }
    hits.rect(ctx, x, y, bw, h, click(() => this.app.toggleFullscreen(), key));
    return bw;
  }
}

// A labelled button on a { y, h } row; returns its width. align 'right' lays it
// out leftwards from x. Lit (yellow) when `on`; no `fn` means not clickable.
export function tab(ctx, x, row, label, on, fn, key, align = 'left', minW = 0) {
  const bw = Math.max(minW, textWidth(ctx, label, TAB) + 12);
  const bx = align === 'right' ? x - bw : x;
  const held = on || hits.isPressed(key);
  const off = button(ctx, bx, row.y, bw, row.h, { face: held ? C.btnPressed : C.btnDark, pressed: held });
  text(ctx, label, bx + bw / 2, row.y + row.h / 2 + 0.5 + off, { ...TAB, color: on ? C.ledYellow : C.inkLight });
  if (fn) hits.rect(ctx, bx, row.y, bw, row.h, click(fn, key));
  return bw;
}

export const keysHint = (state) => COPY.keys(state.ui.octave) + COPY.liveRec(!!state.ui.liveRec);
