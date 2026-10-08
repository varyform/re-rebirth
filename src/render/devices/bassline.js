import { hits } from '../../ui/hits.js';
import { click, paintSteps, scrubSteps, toggle } from '../../ui/handlers.js';
import { drawPatternTools, Knob, PatternSelector } from '../controls.js';
import { brushed, button, circle, icon, keyboardKeys, led, line, miniKeyboard, MONO, panel, rrect, screws, text, textWidth, vgrad, waveIcon } from '../primitives.js';
import { C, KNOB, SELECTOR } from '../theme.js';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'];

const KNOBS = [
  ['tuning', 'TUNING', 0.5],
  ['cutoff', 'CUT OFF FREQ', 0.35],
  ['resonance', 'RESONANCE', 0.78],
  ['envmod', 'ENV MOD', 0.55],
  ['decay', 'DECAY', 0.4],
  ['accent', 'ACCENT', 0.7],
  ['volume', 'VOLUME', 0.8],
];

const HEADER_H = 18;
const SEQ_Y = 98;
const GRID_X = 338;
const STEP_W = 26;
const ROW = { note: 111, oct: 127, acc: 138, slide: 149, pad: 157 };
const KEYBOARD = [18, 108, 168, 58];
const EDIT_BUTTONS = [
  ['DOWN', 198, 110, (s) => s.octave < 0, (s) => (s.octave = s.octave < 0 ? 0 : -1)],
  ['UP', 252, 110, (s) => s.octave > 0, (s) => (s.octave = s.octave > 0 ? 0 : 1)],
  ['ACCENT', 198, 140, (s) => s.accent, (s) => (s.accent = !s.accent)],
  ['SLIDE', 252, 140, (s) => s.slide, (s) => (s.slide = !s.slide)],
];
const NEXT_OCTAVE = { 0: 1, 1: -1, '-1': 0 };

export class Bassline {
  constructor(state, app, x, y, w, h, { id, number }) {
    Object.assign(this, { state, app, x, y, w, h, id, number });
    const P = (k) => `${id}.${k}`;
    this.waveParam = P('waveform');
    this.onParam = P('on');
    state.define(this.waveParam, 0);
    state.define(this.onParam, 1);
    this.knobs = KNOBS.map(([k, label, def], i) => {
      state.define(P(k), def);
      return new Knob({ x: 102 + i * 60, y: 62, r: 15, param: P(k), label, labelPos: 'above', style: KNOB.bass, labelColor: C.bassInk, labelSize: 6.5 });
    });
    this.selector = new PatternSelector({ id, x: 516, y: 32, w: 236, theme: SELECTOR.bass, state });
  }

  draw(ctx) {
    const { w, h, state } = this;
    panel(ctx, 0, 0, w, h, C.bassPanel);
    brushed(ctx, 0, HEADER_H, w, SEQ_Y - HEADER_H, 0.9);
    this.drawHeader(ctx);

    ctx.fillStyle = vgrad(ctx, SEQ_Y, h, C.bassSeq);
    ctx.fillRect(0, SEQ_Y, w, h - SEQ_Y);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, SEQ_Y, w, 1);

    this.drawWaveSwitch(ctx, 46, 58);
    for (const k of this.knobs) k.draw(ctx, state);
    this.selector.draw(ctx);
    this.drawSequencer(ctx);
    screws(ctx, w, h);
  }

  drawHeader(ctx) {
    const { w, number, state } = this;
    ctx.fillStyle = vgrad(ctx, 0, HEADER_H, C.bassHeader);
    ctx.fillRect(0, 0, w, HEADER_H);
    const title = 'BASS LINE';
    const titleOpts = { size: 10, weight: 900, italic: true, align: 'left', color: C.inkLight };
    text(ctx, title, 18, 9.5, titleOpts);
    const tx = 18 + textWidth(ctx, title, titleOpts) + 6;
    rrect(ctx, tx, 3.5, 13, 11, 2);
    ctx.fillStyle = C.bassAccent;
    ctx.fill();
    text(ctx, String(number), tx + 6.5, 9.5, { size: 8, weight: 900, color: C.bassInk });
    led(ctx, tx + 24, 9, 2.3, state.on01(this.onParam), C.ledGreen);
    text(ctx, 'ON', tx + 30, 9.5, { size: 6, align: 'left', color: C.inkMuted });
    hits.rect(ctx, tx + 19, 2, 26, 14, toggle(state, this.onParam));
    text(ctx, 'ANALOG BASS SYNTHESIZER', tx + 52, 9.5, { size: 6, align: 'left', color: C.inkMuted, spacing: 1.2 });
    drawPatternTools(ctx, { state, id: this.id, right: w - 10, led: C.ledRed });
  }

  drawWaveSwitch(ctx, cx, cy) {
    const square = this.state.get(this.waveParam) >= 0.5;
    text(ctx, 'WAVEFORM', cx, 34, { size: 6.5, color: C.bassInk });
    rrect(ctx, cx - 17, cy - 7.5, 34, 15, 7.5);
    ctx.fillStyle = vgrad(ctx, cy - 7.5, cy + 7.5, ['#0b0b0c', '#2a2b2e']);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 0.7;
    line(ctx, cx - 12, cy + 8, cx + 12, cy + 8);

    const lx = square ? cx + 8.5 : cx - 8.5;
    const g = ctx.createRadialGradient(lx - 2, cy - 2.5, 0.5, lx, cy, 6.5);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#8a8e94');
    circle(ctx, lx, cy, 6);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();

    waveIcon(ctx, 'saw', cx - 10, cy + 17, 4, square ? 'rgba(27,27,30,0.45)' : C.bassInk);
    waveIcon(ctx, 'square', cx + 10, cy + 17, 4, square ? C.bassInk : 'rgba(27,27,30,0.45)');
    hits.rect(ctx, cx - 20, cy - 9, 40, 30, toggle(this.state, this.waveParam));
  }

  drawSequencer(ctx) {
    const { state, id } = this;
    const dev = state.bass[id];
    const pattern = state.pattern(id);
    const steps = pattern.steps;
    const sel = steps[dev.selectedStep];
    const audition = () => this.app.engine.auditionBass(id, sel);

    // Keys enter a note on the selected step; black keys register last so they win.
    miniKeyboard(ctx, ...KEYBOARD, { active: sel.gate ? sel.note : -1 });
    for (const k of keyboardKeys(...KEYBOARD)) {
      hits.rect(ctx, k.x, k.y, k.w, k.h, click(() => {
        Object.assign(sel, { note: k.note, gate: true, tie: false });
        audition();
      }));
    }

    for (const [label, bx, by, isOn, apply] of EDIT_BUTTONS) {
      const key = `${id}.edit.${label}`;
      const off = button(ctx, bx, by, 48, 22, { face: C.bassPad, pressed: hits.isPressed(key) });
      led(ctx, bx + 8, by + 11 + off, 2.4, isOn(sel), label === 'SLIDE' ? C.ledGreen : C.ledOrange);
      text(ctx, label, bx + 28, by + 11.5 + off, { size: 6.5, weight: 800, color: C.inkLight });
      hits.rect(ctx, bx, by, 48, 22, click(() => apply(sel), key));
    }

    const labelOpts = { size: 5.5, align: 'left', color: C.inkMuted, spacing: 0.4 };
    text(ctx, 'NOTE', 309, ROW.note, labelOpts);
    text(ctx, 'OCT', 309, ROW.oct, labelOpts);
    text(ctx, 'ACC', 309, ROW.acc, labelOpts);
    text(ctx, 'SLIDE', 309, ROW.slide, labelOpts);
    text(ctx, 'STEP', 309, ROW.pad + 7, labelOpts);

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) {
      const gx = GRID_X + g * 4 * STEP_W;
      line(ctx, gx, 103, gx, 172);
    }

    const t = state.transport;
    const playhead = t.playing ? (t.positions[id] ?? -1) : -1;
    steps.forEach((s, i) => {
      const cx = GRID_X + i * STEP_W + STEP_W / 2;
      // Steps past the pattern length don't play: dim them.
      if (i >= pattern.length) ctx.globalAlpha = 0.3;
      if (i === dev.selectedStep) {
        rrect(ctx, cx - 12.5, 101.5, 25, 73, 2.5);
        ctx.fillStyle = 'rgba(255,106,26,0.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,106,26,0.7)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      rrect(ctx, cx - 11, 104, 22, 14, 1.5);
      ctx.fillStyle = C.bassCell;
      ctx.fill();
      const noteColor = !s.gate ? C.bassNoteOff : s.accent ? C.bassNoteAccent : C.bassNote;
      const label = !s.gate ? '\u2013' : s.tie ? '\u2040' : NOTE_NAMES[s.note]; // ⁀ = tie
      text(ctx, label, cx, ROW.note + 0.5, { size: 7.5, weight: 700, family: MONO, color: noteColor });

      if (s.octave) icon(ctx, s.octave > 0 ? 'up' : 'down', cx, ROW.oct, 7, s.gate ? C.bassNote : C.bassNoteOff);
      else {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(cx - 2.5, ROW.oct - 0.5, 5, 1);
      }
      led(ctx, cx, ROW.acc, 2.5, s.accent, C.ledOrange);
      led(ctx, cx, ROW.slide, 2.5, s.slide, C.ledGreen);

      const playing = playhead === i;
      const off = button(ctx, cx - 11, ROW.pad, 22, 14, { face: playing ? C.bassPadOn : C.bassPad, pressed: playing });
      text(ctx, String(i + 1), cx, ROW.pad + 7.5 + off, { size: 6.5, weight: 800, color: playing ? C.bassInk : C.inkLight });
      ctx.globalAlpha = 1;
    });

    this.registerGrid(ctx, steps, dev);
  }

  // Note row toggles note/rest, OCT cycles up/down/none, ACC/SLIDE paint, pads select.
  registerGrid(ctx, pattern, dev) {
    const row = { x0: GRID_X, stepW: STEP_W };
    const width = 16 * STEP_W;
    const select = (i) => (dev.selectedStep = i);
    const selectAndHear = (i) => {
      if (dev.selectedStep === i) return;
      select(i);
      if (pattern[i].gate) this.app.engine.auditionBass(this.id, pattern[i]);
    };
    const flag = (name) => ({ ...row, get: (i) => pattern[i][name], set: (i, v) => (pattern[i][name] = v) });
    const gate = { ...row, get: (i) => pattern[i].gate && !pattern[i].tie, set: (i, v) => Object.assign(pattern[i], { gate: v, tie: false }) };
    hits.rect(ctx, GRID_X, 103, width, 16, paintSteps({ ...gate, after: select }));
    hits.rect(
      ctx,
      GRID_X,
      ROW.oct - 6,
      width,
      12,
      click((ev) => {
        const i = Math.floor((ev.p.x - GRID_X) / STEP_W);
        if (pattern[i]) pattern[i].octave = NEXT_OCTAVE[pattern[i].octave];
      }),
    );
    hits.rect(ctx, GRID_X, ROW.acc - 5.5, width, 11, paintSteps(flag('accent')));
    hits.rect(ctx, GRID_X, ROW.slide - 5.5, width, 11, paintSteps(flag('slide')));
    hits.rect(ctx, GRID_X, ROW.pad, width, 15, scrubSteps({ ...row, pick: selectAndHear }));
  }
}
