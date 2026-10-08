// Controls own their geometry (in device-local units) and a state binding, and
// register their own hit regions while drawing.
import { canPaste, clearPattern, copyPattern, pastePattern, randomizePattern, setLength } from '../song/pattern-ops.js';
import { hits } from '../ui/hits.js';
import { click, knobDrag } from '../ui/handlers.js';
import { button, icon, knob, lcd, led, sevenSeg, sevenSegWidth, text } from './primitives.js';
import { C } from './theme.js';

export class Knob {
  constructor(opts) {
    Object.assign(this, { r: 12, ticks: 11, labelPos: 'below', labelSize: 6, labelColor: C.inkMuted }, opts);
  }

  draw(ctx, state) {
    knob(ctx, this.x, this.y, this.r, state.get(this.param), this.style, { ticks: this.ticks });
    hits.circle(ctx, this.x, this.y, this.r + 4, knobDrag(state, this.param));
    if (!this.label) return;
    const ly = this.labelPos === 'above' ? this.y - this.r - 10 : this.y + this.r + 7.5;
    text(ctx, this.label, this.x, ly, { size: this.labelSize, color: this.labelColor });
  }
}

const BANKS = 'ABCD';
const CELL_GAP = 4;
const CELL_H = 15;

// Bank A–D + pattern 1–8 buttons with a small readout. ~52 units tall.
// While playing, picks are queued until the current pattern ends (blinking LED).
export class PatternSelector {
  constructor({ id, x, y, w, theme, state }) {
    Object.assign(this, { id, x, y, w, theme, state });
    this.cellW = (w - 7 * CELL_GAP) / 8;
  }

  cellX(i) {
    return this.x + i * (this.cellW + CELL_GAP);
  }

  drawCell(ctx, i, y, label, on, key, select) {
    const { cellW, theme } = this;
    const bx = this.cellX(i);
    const off = button(ctx, bx, y, cellW, CELL_H, { face: theme.face, pressed: hits.isPressed(key) });
    led(ctx, bx + 5, y + CELL_H / 2 + off, 2, on, theme.led);
    text(ctx, label, bx + cellW / 2 + 2.5, y + CELL_H / 2 + 0.5 + off, { size: 7, color: theme.text });
    hits.rect(ctx, bx, y, cellW, CELL_H, click(select, key));
  }

  draw(ctx) {
    const { id, x, y, w, theme, state } = this;
    const dev = state.device(id);
    const rowA = y + 8;
    const rowB = y + 36;
    const queued = dev.queued;
    const blink = state.transport.step % 4 < 2;
    const shown = queued ?? dev.bank * 8 + dev.pattern;
    const lit = (index) => index === dev.bank * 8 + dev.pattern || (queued === index && blink);

    text(ctx, 'BANK', x, y + 3, { size: 6, align: 'left', color: theme.ink, spacing: 0.5 });
    for (let b = 0; b < 4; b++) {
      const on = Math.floor(shown / 8) === b && (queued === null || blink || b === dev.bank);
      this.drawCell(ctx, b, rowA, BANKS[b], on, `${id}.bank.${b}`, () => state.pickPattern(id, b * 8 + (shown % 8)));
    }

    const lx = this.cellX(4);
    const lw = x + w - lx;
    lcd(ctx, lx, rowA, lw, CELL_H);
    const index = queued !== null && blink ? queued : dev.bank * 8 + dev.pattern;
    const label = `${BANKS[Math.floor(index / 8)]}${(index % 8) + 1}`;
    const dw = 6.5;
    sevenSeg(ctx, label, lx + (lw - sevenSegWidth(label, dw)) / 2, rowA + 2.5, dw, CELL_H - 5);

    text(ctx, 'PATTERN', x, y + 31, { size: 6, align: 'left', color: theme.ink, spacing: 0.5 });
    const bank = Math.floor(shown / 8);
    for (let i = 0; i < 8; i++) {
      const index = bank * 8 + i;
      this.drawCell(ctx, i, rowB, String(i + 1), lit(index), `${id}.pattern.${i}`, () => state.pickPattern(id, index));
    }
  }
}

const TOOL = { size: 5.5, weight: 800, spacing: 0.4 };
const TOOL_H = 12;

// Pattern length + edit operations + per-pattern shuffle, in a device header.
// Laid out right-to-left from `right`.
export function drawPatternTools(ctx, { state, id, right, led: ledColor }) {
  const pattern = state.pattern(id);
  const y = 3;
  let x = right;

  x -= 52;
  led(ctx, x + 5, 9, 2.3, pattern.shuffle, ledColor);
  text(ctx, 'SHUFFLE', x + 11, 9.5, { size: 6, align: 'left', color: C.inkMuted, spacing: 0.8 });
  hits.rect(ctx, x, 2, 52, 14, click(() => (pattern.shuffle = !pattern.shuffle)));

  const ops = [
    ['RANDOM', () => randomizePattern(state, id)],
    ['CLEAR', () => clearPattern(state, id)],
    ['PASTE', () => pastePattern(state, id), !canPaste(id)],
    ['COPY', () => copyPattern(state, id)],
  ];
  for (const [label, fn, disabled] of ops) {
    const bw = label.length * 4.4 + 8;
    x -= bw + 4;
    const key = `${id}.tool.${label}`;
    const off = button(ctx, x, y, bw, TOOL_H, { pressed: hits.isPressed(key) });
    text(ctx, label, x + bw / 2, y + TOOL_H / 2 + 0.5 + off, { ...TOOL, color: disabled ? C.inkMuted : C.inkLight });
    if (!disabled) hits.rect(ctx, x, y, bw, TOOL_H, click(fn, key));
  }

  // Length: ◂ nn ▸
  x -= 60;
  text(ctx, 'LEN', x, 9.5, { size: 6, align: 'left', color: C.inkMuted, spacing: 0.8 });
  const nudge = (dx, dir, delta) => {
    const key = `${id}.len.${dir}`;
    const off = button(ctx, x + dx, y, 10, TOOL_H, { pressed: hits.isPressed(key) });
    icon(ctx, dir, x + dx + 5, y + TOOL_H / 2 + off, 5, C.inkLight);
    hits.rect(ctx, x + dx, y, 10, TOOL_H, click(() => setLength(state, id, pattern.length + delta), key));
  };
  nudge(16, 'left', -1);
  lcd(ctx, x + 28, y, 14, TOOL_H);
  text(ctx, String(pattern.length), x + 35, y + TOOL_H / 2 + 0.5, { size: 7, weight: 800, color: C.lcdOn });
  nudge(44, 'right', 1);
}
