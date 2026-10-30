// ARRANGE: the song as one row per machine, bars across. Each row shows which
// pattern plays when, with a thin lane under it for the machine's ON switch.
// Paint bars with the row's brush pattern, drag on the ON lane to switch a
// machine off and on, and work on the A-B range: duplicate, delete, insert.
import { songBars, TICKS_PER_BAR } from '../../song/song.js';
import { deleteBars, duplicateBars, insertBars, onAt, paintOn, paintPattern, patternAt, setLength } from '../../song/arrange-ops.js';
import { hits } from '../../ui/hits.js';
import { click } from '../../ui/handlers.js';
import { line, MONO, panel, restoreLineScale, rgba, rrect, setLineScale, text, textWidth, vgrad } from '../primitives.js';
import { C } from '../theme.js';
import { tab } from './stage-bar.js';

const T = TICKS_PER_BAR;
const BANKS = 'ABCD';
const PAD = 6;
// The toolbar is laid out in chrome units, like AUTOMATE's timeline, so its
// buttons come out the same size on screen (see `chromeK`).
const TOOLS = { y: 5, h: 18 };
const TOOLS_BAND = 28; // chrome units from the top to the ruler
const RULER_H = 14;
const LABEL_W = 70;
const ON_H = 7;
const ROW_GAP = 4;
const SCROLL_H = 6;
const MIN_BARS = 4;
const ROWS = [
  ['bass1', 'BASS 1'],
  ['bass2', 'BASS 2'],
  ['r808', 'DRUM 08'],
  ['r909', 'DRUM 09'],
];
const COPY = {
  dup: 'DUPLICATE A\u2013B',
  del: 'DELETE A\u2013B',
  ins: 'INSERT 4 BARS AT A',
  undo: '\u21B6 UNDO',
  fit: 'FIT',
  brush: 'BRUSH',
  hint: 'DRAG TO PAINT \u00B7 SHIFT-CLICK PICKS A PATTERN \u00B7 THIN LANE: ON / OFF \u00B7 RULER: DRAG A\u2013B, END',
};
// The pattern a row paints with: chosen in the picker, else what plays now.
export const brushOf = (state, id) => state.ui.brush?.[id] ?? state.device(id).bank * 8 + state.device(id).pattern;

// The A-B range in bars, or null.
export const rangeBars = (song) => (song.loopEnd > song.loopStart ? [song.loopStart / T, song.loopEnd / T] : null);

const patternName = (i) => `${BANKS[Math.floor(i / 8)]}${(i % 8) + 1}`;

export class Arrange {
  // chromeK: device units per chrome unit (focus-view.js).
  constructor(state, app, x, y, w, h, { chromeK = 1 } = {}) {
    Object.assign(this, { state, app, x, y, w, h, chromeK });
    this.rulerY = TOOLS_BAND * chromeK;
    this.rowsY = this.rulerY + RULER_H + 4;
    state.ui.arrange ??= { from: 0, span: Math.max(songBars(state.song), 16) * T };
  }

  get view() {
    return this.state.ui.arrange;
  }

  edit(fn) {
    this.app.clock.edit(fn);
  }

  afterEdit() {
    this.app.clock.afterEdit();
  }

  brush(id) {
    return brushOf(this.state, id);
  }

  draw(ctx) {
    const { w, h, state } = this;
    const { song } = state;
    panel(ctx, 0, 0, w, h, C.transport);
    this.drawTools(ctx);

    const gx = PAD + LABEL_W;
    const gw = w - PAD - gx;
    const bars = Math.max(songBars(song), MIN_BARS);
    const view = this.view;
    view.span = Math.min(Math.max(view.span, MIN_BARS * T), Math.max(bars + 8, MIN_BARS) * T);
    view.from = Math.max(0, Math.min(view.from, (bars + 8) * T - view.span));
    const X = (tick) => gx + ((tick - view.from) * gw) / view.span;
    const barAt = (x) => Math.max(0, Math.floor((view.from + ((x - gx) * view.span) / gw) / T));

    this.drawRuler(ctx, gx, gw, X, barAt);
    this.wheelFn = this.wheel(gw, barAt);
    const rowsH = h - this.rowsY - SCROLL_H - 8;
    const rowH = (rowsH - ROW_GAP * (ROWS.length - 1)) / ROWS.length;
    ROWS.forEach(([id, name], r) => this.drawRow(ctx, id, name, this.rowsY + r * (rowH + ROW_GAP), rowH, gx, gw, X, barAt));
    this.drawPlayhead(ctx, X, gx, gw, this.rowsY, rowsH);
    this.drawScroll(ctx, gx, gw, h - SCROLL_H - 5, bars);
  }

  drawTools(ctx) {
    ctx.save();
    ctx.scale(this.chromeK, this.chromeK);
    const lines = setLineScale(ctx);
    this.drawToolsAt(ctx, this.w / this.chromeK);
    restoreLineScale(lines);
    ctx.restore();
  }

  drawToolsAt(ctx, w) {
    const { state, app } = this;
    const { song } = state;
    const range = rangeBars(song);
    let x = PAD;
    const act = (label, fn, key) => {
      const bw = tab(ctx, x, TOOLS, label, false, fn, key);
      if (!fn) {
        rrect(ctx, x, TOOLS.y, bw, TOOLS.h + 1, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fill();
      }
      x += bw + 4;
    };
    act(COPY.dup, range ? () => this.edit((s) => duplicateBars(s, ...range)) : null, 'arr.dup');
    act(COPY.del, range ? () => this.edit((s) => deleteBars(s, ...range)) : null, 'arr.del');
    act(COPY.ins, () => this.edit((s) => insertBars(s, range ? range[0] : Math.max(0, state.transport.bar - 1), 4)), 'arr.ins');
    x += 6;
    const canUndo = app.clock.player.canUndo();
    act(COPY.undo, canUndo ? () => app.clock.undoPass() : null, 'arr.undo');
    let rx = w - PAD;
    rx -= tab(ctx, rx, TOOLS, COPY.fit, false, () => Object.assign(this.view, { from: 0, span: Math.max(songBars(song), MIN_BARS) * T }), 'arr.fit', 'right') + 8;
    const hint = { size: 5.2, weight: 700, align: 'right', color: C.inkMuted, spacing: 0.2 };
    const fit = (rx - x - 6) / textWidth(ctx, COPY.hint, hint);
    if (fit > 0.6) text(ctx, COPY.hint, rx, TOOLS.y + TOOLS.h / 2 + 0.5, { ...hint, size: hint.size * Math.min(1, fit) });
  }

  // Bar numbers, the A-B range, the song's END. Drag A, B or END; drag
  // elsewhere for a new range; click to move the song position.
  drawRuler(ctx, gx, gw, X, barAt) {
    const { state, app } = this;
    const { song } = state;
    rrect(ctx, gx, this.rulerY, gw, RULER_H, 2);
    ctx.fillStyle = vgrad(ctx, this.rulerY, this.rulerY + RULER_H, C.lcdGreen);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx, this.rulerY, gw, RULER_H);
    ctx.clip();
    const view = this.view;
    const pxPerBar = (gw * T) / view.span;
    const step = [1, 2, 4, 8, 16, 32, 64].find((s) => s * pxPerBar >= 22) ?? 128;
    ctx.strokeStyle = C.lcdGreenDim;
    ctx.lineWidth = 1;
    for (let b = Math.floor(view.from / T / step) * step; b * T <= view.from + view.span; b += step) {
      const bx = Math.round(X(b * T)) + 0.5;
      line(ctx, bx, this.rulerY + RULER_H - 4, bx, this.rulerY + RULER_H);
      text(ctx, String(b + 1), bx + 2, this.rulerY + RULER_H / 2 - 1, { size: 6, weight: 700, family: MONO, align: 'left', color: C.lcdGreenMid });
    }
    const hasRange = song.loopEnd > song.loopStart;
    if (hasRange) {
      ctx.fillStyle = rgba(C.ledYellow, 0.22);
      ctx.fillRect(X(song.loopStart), this.rulerY, X(song.loopEnd) - X(song.loopStart), RULER_H);
    }
    ctx.restore();
    if (hasRange) {
      this.marker(ctx, X(song.loopStart), 'A', C.ledYellow);
      this.marker(ctx, X(song.loopEnd), 'B', C.ledYellow);
    }
    if (song.length) this.marker(ctx, X(song.length), 'END', C.ledRed);

    const near = (x, tick) => Math.abs(x - X(tick)) <= 5;
    const handler = {
      cursor: 'ew-resize',
      down: (ev) => {
        const x0 = ev.p.x;
        const grabEnd = song.length && near(x0, song.length);
        let grab = grabEnd ? 'END' : hasRange && near(x0, song.loopEnd) ? 'B' : hasRange && near(x0, song.loopStart) ? 'A' : null;
        let moved = false;
        let saved = false;
        const barLine = (x) => Math.round((view.from + ((x - gx) * view.span) / gw) / T);
        return {
          move: (ev) => {
            if (!grab) {
              if (Math.abs(ev.p.x - x0) < 3) return;
              song.loopStart = song.loopEnd = Math.max(0, barLine(x0)) * T;
              grab = ev.p.x < x0 ? 'A' : 'B';
            }
            moved = true;
            const b = Math.max(0, barLine(ev.p.x));
            if (grab === 'END') {
              if (!saved) (app.clock.player.checkpoint(), (saved = true));
              setLength(song, Math.max(1, b));
            } else if (grab === 'A') song.loopStart = Math.min(b, song.loopEnd / T - 1) * T;
            else song.loopEnd = Math.max(b, song.loopStart / T + 1) * T;
          },
          up: () => {
            if (!moved && !grab) app.clock.seekTo(barAt(x0) + 1);
          },
        };
      },
    };
    hits.rect(ctx, gx - 5, this.rulerY - 5, gw + 10, RULER_H + 5, handler);
  }

  marker(ctx, x, label, color) {
    const w = label.length > 1 ? textWidth(ctx, label, { size: 5.5, weight: 900 }) + 6 : 10;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x) - 0.5, this.rulerY, 1.5, RULER_H);
    rrect(ctx, x - w / 2, this.rulerY - 5, w, 9, 1.5);
    ctx.fill();
    text(ctx, label, x, this.rulerY - 0.5, { size: label.length > 1 ? 5.5 : 6.5, weight: 900, color: C.bassInk });
  }

  drawRow(ctx, id, name, y, h, gx, gw, X, barAt) {
    const { state } = this;
    const { song } = state;
    const shown = state.ui.show === id;
    const color = C.lanes[id];
    const laneH = h - ON_H - 2;
    // Label: name and brush (click: this machine's patterns, to pick a brush).
    rrect(ctx, PAD, y, LABEL_W - 6, h, 2);
    ctx.fillStyle = shown ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(PAD + 4, y + 5, 3, h - 10);
    text(ctx, name, PAD + 12, y + h * 0.3, { size: 6.5, weight: 900, align: 'left', color: shown ? C.inkLight : C.inkMuted, spacing: 0.5 });
    text(ctx, COPY.brush, PAD + 12, y + h * 0.68, { size: 5, weight: 700, align: 'left', color: C.inkMuted, spacing: 0.4 });
    text(ctx, patternName(this.brush(id)), PAD + 40, y + h * 0.68 + 0.5, { size: 7.5, weight: 800, family: MONO, align: 'left', color: C.ledYellow });
    hits.rect(ctx, PAD, y, LABEL_W - 6, h, click(() => Object.assign(state.ui, { show: id, picker: !(state.ui.picker && shown) }), `arr.label.${id}`));

    // Pattern blocks: a run of bars playing the same pattern, labelled.
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx, y, gw, h);
    ctx.clip();
    ctx.fillStyle = vgrad(ctx, y, y + laneH, C.screen);
    ctx.fillRect(gx, y, gw, laneH);
    const view = this.view;
    const first = Math.floor(view.from / T);
    const last = Math.ceil((view.from + view.span) / T);
    const end = songBars(song);
    for (let b = first; b < Math.min(last, end);) {
      const p = patternAt(song, id, b);
      let e = b + 1;
      while (e < Math.min(last, end) && patternAt(song, id, e) === p) e++;
      if (p !== undefined) {
        const x0 = X(b * T);
        const x1 = X(e * T);
        rrect(ctx, x0 + 0.5, y + 1, x1 - x0 - 1, laneH - 2, 2);
        ctx.fillStyle = rgba(color, onAt(song, id, b) ? 0.45 : 0.15);
        ctx.fill();
        const label = patternName(p);
        if (x1 - x0 > textWidth(ctx, label, { size: 7, weight: 800, family: MONO }) + 6) {
          text(ctx, label, x0 + 4, y + laneH / 2 + 0.5, { size: Math.min(8, laneH * 0.5), weight: 800, family: MONO, align: 'left', color: C.inkLight });
        }
      }
      b = e;
    }
    // Bar lines when there's room for them.
    if ((gw * T) / view.span >= 6) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      for (let b = first; b <= last; b++) line(ctx, Math.round(X(b * T)) + 0.5, y, Math.round(X(b * T)) + 0.5, y + laneH);
    }
    // ON lane.
    const oy = y + laneH + 2;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(gx, oy, gw, ON_H);
    for (let b = first; b < Math.min(last, end); b++) {
      if (!onAt(song, id, b)) continue;
      ctx.fillStyle = rgba(C.ledGreen, 0.7);
      ctx.fillRect(X(b * T) + 0.5, oy + 1.5, X((b + 1) * T) - X(b * T) - 1, ON_H - 3);
    }
    if (end) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(X(end * T), y, gx + gw - X(end * T), h);
    }
    ctx.restore();

    hits.rect(ctx, gx, y, gw, laneH, this.paintHandler(id, barAt, false));
    hits.rect(ctx, gx, oy - 1, gw, ON_H + 2, this.paintHandler(id, barAt, true));
  }

  // Drag across bars: the pattern lane takes the brush pattern, the ON lane
  // the opposite of the bar first clicked. Shift-click picks up a pattern.
  paintHandler(id, barAt, onLane) {
    const { state } = this;
    const { song } = state;
    return {
      cursor: 'crosshair',
      wheel: this.wheelFn,
      down: (ev) => {
        const b0 = barAt(ev.p.x);
        if (!onLane && ev.fine) {
          const p = patternAt(song, id, b0);
          if (p !== undefined) state.ui.brush[id] = p;
          return {};
        }
        this.app.clock.player.checkpoint();
        const value = onLane ? !onAt(song, id, b0) : this.brush(id);
        let lo = b0;
        let hi = b0;
        const apply = () => {
          if (onLane) paintOn(song, id, lo, hi + 1, value);
          else paintPattern(song, id, lo, hi + 1, value);
          this.afterEdit();
        };
        apply();
        return {
          move: (ev) => {
            const b = barAt(ev.p.x);
            if (b >= lo && b <= hi) return;
            lo = Math.min(lo, b);
            hi = Math.max(hi, b);
            apply();
          },
        };
      },
    };
  }

  drawPlayhead(ctx, X, gx, gw, y, h) {
    const t = this.state.transport;
    const tick = (t.bar - 1) * T + Math.max(0, t.step) * 2;
    const px = X(tick);
    if (px < gx || px > gx + gw) return;
    ctx.strokeStyle = rgba(C.ledGreen, 0.9);
    ctx.lineWidth = 1;
    line(ctx, Math.round(px) + 0.5, this.rulerY, Math.round(px) + 0.5, y + h);
  }

  // Where the view sits in the song; drag to scroll.
  drawScroll(ctx, gx, gw, y, bars) {
    const view = this.view;
    const total = (bars + 8) * T;
    const x0 = gx + (view.from / total) * gw;
    const tw = Math.max(12, (view.span / total) * gw);
    rrect(ctx, gx, y, gw, SCROLL_H, SCROLL_H / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();
    rrect(ctx, x0, y, tw, SCROLL_H, SCROLL_H / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
    hits.rect(ctx, gx, y - 3, gw, SCROLL_H + 6, {
      cursor: 'grab',
      down: () => ({ move: (ev) => (view.from += ((ev.p.x - ev.prev.x) * total) / gw) }),
    });
  }

  // Scroll pans, pinch / ctrl+scroll zooms around the pointer.
  wheel(gw, barAt) {
    const view = this.view;
    return (ev) => {
      if (ev.zoom) {
        const anchor = barAt(ev.p.x) * T;
        const span = view.span * Math.exp(ev.dy * 0.01);
        view.from = anchor - ((anchor - view.from) * span) / view.span;
        view.span = span;
        return;
      }
      view.from += ((ev.dx || ev.dy) * view.span) / gw;
    };
  }
}
