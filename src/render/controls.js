// Controls own their geometry (in device-local units) and a state binding,
// so the same objects can later be hit-tested for mouse interaction.
import { button, knob, lcd, led, sevenSeg, sevenSegWidth, text } from './primitives.js';
import { C } from './theme.js';

export class Knob {
  constructor(opts) {
    Object.assign(this, { r: 12, ticks: 11, labelPos: 'below', labelSize: 6, labelColor: C.inkMuted }, opts);
  }

  draw(ctx, state) {
    knob(ctx, this.x, this.y, this.r, state.get(this.param), this.style, { ticks: this.ticks });
    if (!this.label) return;
    const ly = this.labelPos === 'above' ? this.y - this.r - 10 : this.y + this.r + 7.5;
    text(ctx, this.label, this.x, ly, { size: this.labelSize, color: this.labelColor });
  }

  contains(px, py) {
    return Math.hypot(px - this.x, py - this.y) <= this.r + 3;
  }
}

const BANKS = 'ABCD';
const CELL_GAP = 4;
const CELL_H = 15;

// Bank A–D + pattern 1–8 buttons with a small readout. ~52 units tall.
export class PatternSelector {
  constructor({ x, y, w, theme, getDevice }) {
    Object.assign(this, { x, y, w, theme, getDevice });
    this.cellW = (w - 7 * CELL_GAP) / 8;
  }

  cellX(i) {
    return this.x + i * (this.cellW + CELL_GAP);
  }

  drawCell(ctx, i, y, label, on) {
    const { cellW, theme } = this;
    const bx = this.cellX(i);
    button(ctx, bx, y, cellW, CELL_H, { face: theme.face });
    led(ctx, bx + 5, y + CELL_H / 2, 2, on, theme.led);
    text(ctx, label, bx + cellW / 2 + 2.5, y + CELL_H / 2 + 0.5, { size: 7, color: theme.text });
  }

  draw(ctx) {
    const { x, y, w, theme } = this;
    const dev = this.getDevice();
    const rowA = y + 8;
    const rowB = y + 36;

    text(ctx, 'BANK', x, y + 3, { size: 6, align: 'left', color: theme.ink, spacing: 0.5 });
    for (let i = 0; i < 4; i++) this.drawCell(ctx, i, rowA, BANKS[i], dev.bank === i);

    const lx = this.cellX(4);
    const lw = x + w - lx;
    lcd(ctx, lx, rowA, lw, CELL_H);
    const label = `${BANKS[dev.bank]}${dev.pattern + 1}`;
    const dw = 6.5;
    sevenSeg(ctx, label, lx + (lw - sevenSegWidth(label, dw)) / 2, rowA + 2.5, dw, CELL_H - 5);

    text(ctx, 'PATTERN', x, y + 31, { size: 6, align: 'left', color: theme.ink, spacing: 0.5 });
    for (let i = 0; i < 8; i++) this.drawCell(ctx, i, rowB, String(i + 1), dev.pattern === i);
  }
}
