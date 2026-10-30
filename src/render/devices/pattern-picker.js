// Pattern picker: all 32 patterns of one machine (banks A-D down, 1-8 across)
// as small previews, in place of the instrument. Bass lines show as piano
// rolls, drum patterns as lane grids. Click one to play it (while playing it
// waits for the end of the current pattern, like the selectors). Shift-click
// adds patterns to a chain the machine plays in turn (pattern mode; state.js),
// shown in the header with the one playing lit. The rail stays beside it, so
// another machine is one click away.
import { heldSteps, HIT } from '../../state.js';
import { hits } from '../../ui/hits.js';
import { click } from '../../ui/handlers.js';
import { button, panel, px, rgba, rrect, text, textWidth, vgrad } from '../primitives.js';
import { C } from '../theme.js';
import { R808, R909 } from './drum-machine.js';

const HEADER_H = 20;
const BANK_W = 14;
const GAP = 4;
const BANKS = 'ABCD';
const KITS = { r808: R808, r909: R909 };
const NAMES = { bass1: 'BASS LINE 1', bass2: 'BASS LINE 2', r808: 'DRUM 08', r909: 'DRUM 09' };
// The 303's range: C an octave down to C two up.
const LOW = -12;
const HIGH = 24;
const COPY = {
  title: (id) => `PATTERNS \u00B7 ${NAMES[id]}`,
  playHint: 'CLICK OR \u2190 \u2192 \u2191 \u2193 TO PLAY \u00B7 SHIFT-CLICK TO CHAIN PATTERNS \u00B7 WHILE PLAYING, A CHANGE WAITS FOR THE END OF THE PATTERN',
  brushHint: 'CLICK THE PATTERN TO PAINT WITH',
  chain: 'CHAIN',
  songMode: '\u00B7 PLAYS IN PATTERN MODE',
  clearChain: 'CLEAR CHAIN',
  close: 'CLOSE',
  empty: 'EMPTY',
};
const LABEL = { size: 6, weight: 800, spacing: 0.3 };

export class PatternPicker {
  constructor(state, app, x, y, w, h, id) {
    Object.assign(this, { state, app, x, y, w, h, id });
  }

  draw(ctx) {
    const { state, w, h, id } = this;
    panel(ctx, 0, 0, w, h, C.transport);
    const hint = state.ui.stage === 'arrange' ? COPY.brushHint : COPY.playHint;
    text(ctx, COPY.title(id), 10, HEADER_H / 2 + 1, { ...LABEL, size: 7.5, weight: 900, align: 'left', color: C.inkLight, spacing: 0.8 });
    const closeW = textWidth(ctx, COPY.close, LABEL) + 14;
    const key = 'picker.close';
    const off = button(ctx, w - 8 - closeW, 4, closeW, HEADER_H - 7, { pressed: hits.isPressed(key) });
    text(ctx, COPY.close, w - 8 - closeW / 2, 4 + (HEADER_H - 7) / 2 + 0.5 + off, { ...LABEL, color: C.inkLight });
    hits.rect(ctx, w - 8 - closeW, 4, closeW, HEADER_H - 7, click(() => (state.ui.picker = false), key));
    const titleW = textWidth(ctx, COPY.title(id), { ...LABEL, size: 7.5, weight: 900, spacing: 0.8 });
    const hintX = 10 + titleW + 12;
    let right = w - 8 - closeW - 10;
    const dev = state.device(id);
    // In ARRANGE it picks the row's brush (what gets painted), not what plays.
    const brushMode = state.ui.stage === 'arrange';
    const chained = !brushMode && dev.chain.length > 1;
    if (chained) {
      const cw = textWidth(ctx, COPY.clearChain, LABEL) + 14;
      const ckey = 'picker.chain.clear';
      const coff = button(ctx, right - cw, 4, cw, HEADER_H - 7, { pressed: hits.isPressed(ckey) });
      text(ctx, COPY.clearChain, right - cw / 2, 4 + (HEADER_H - 7) / 2 + 0.5 + coff, { ...LABEL, color: C.inkLight });
      hits.rect(ctx, right - cw, 4, cw, HEADER_H - 7, click(() => state.clearChain(id), ckey));
      right -= cw + 10;
      this.drawChain(ctx, hintX, right - hintX, dev);
    } else {
      const hintOpts = { size: 5.5, weight: 700, align: 'left', color: C.inkMuted, spacing: 0.2 };
      const fit = (right - hintX) / textWidth(ctx, hint, hintOpts);
      if (fit > 0.6) text(ctx, hint, hintX, HEADER_H / 2 + 1, { ...hintOpts, size: hintOpts.size * Math.min(1, fit) });
    }

    const gx = 6 + BANK_W;
    const gy = HEADER_H + 2;
    const cw = (w - gx - 6 - GAP * 7) / 8;
    const ch = (h - gy - 6 - GAP * 3) / 4;
    const brush = state.ui.brush?.[id] ?? dev.bank * 8 + dev.pattern;
    const current = brushMode ? brush : dev.bank * 8 + dev.pattern;
    const blink = state.transport.step % 4 < 2;
    const pick = (index, ev) => {
      if (!brushMode) return ev.fine ? state.chainPattern(id, index) : state.pickPattern(id, index);
      (state.ui.brush ??= {})[id] = index;
      state.ui.picker = false;
    };
    for (let b = 0; b < 4; b++) {
      const y = gy + b * (ch + GAP);
      text(ctx, BANKS[b], 6 + BANK_W / 2, y + ch / 2 + 0.5, { size: 9, weight: 900, color: C.inkMuted });
      for (let i = 0; i < 8; i++) {
        const index = b * 8 + i;
        const x = gx + i * (cw + GAP);
        const lit = index === current || (!brushMode && dev.queued === index && blink);
        this.drawCell(ctx, x, y, cw, ch, index, lit, !brushMode && index === current);
        if (chained) this.drawChainBadge(ctx, x + cw, y, dev, index);
        hits.rect(ctx, x, y, cw, ch, click((ev) => pick(index, ev), `picker.${index}`));
      }
    }
  }

  // "CHAIN  A1 → A3 → B2", the one playing lit, squeezed to fit `room`.
  drawChain(ctx, x, room, dev) {
    const label = { ...LABEL, size: 6.5, align: 'left' };
    const parts = dev.chain.map((i) => `${BANKS[Math.floor(i / 8)]}${(i % 8) + 1}`);
    const songMode = this.state.transport.mode === 'song';
    const all = `${COPY.chain}  ${parts.join(' \u2192 ')}${songMode ? `  ${COPY.songMode}` : ''}`;
    const k = Math.min(1, room / textWidth(ctx, all, label));
    const opts = { ...label, size: label.size * k };
    let cx = x;
    const put = (s, color) => {
      text(ctx, s, cx, HEADER_H / 2 + 1, { ...opts, color });
      cx += textWidth(ctx, s, opts);
    };
    put(`${COPY.chain}  `, C.inkMuted);
    parts.forEach((p, i) => {
      if (i) put(' \u2192 ', C.inkMuted);
      put(p, i === dev.chainPos ? C.ledYellow : C.inkLight);
    });
    if (songMode) put(`  ${COPY.songMode}`, C.inkMuted);
  }

  // Where a pattern comes in the chain (1-based, every time it does), in the
  // cell's top-right corner.
  drawChainBadge(ctx, right, y, dev, index) {
    const order = dev.chain.flatMap((p, i) => (p === index ? [i + 1] : []));
    if (!order.length) return;
    const s = order.join(' ');
    const opts = { ...LABEL, size: 5.5, align: 'right', color: C.ledOrange };
    text(ctx, s, right - 4, y + 6, opts);
  }

  drawCell(ctx, x, y, w, h, index, lit, current) {
    const { state, id } = this;
    const pattern = state.device(id).patterns[index];
    rrect(ctx, x, y, w, h, 2);
    ctx.fillStyle = vgrad(ctx, y, y + h, C.screen);
    ctx.fill();
    if (lit) {
      ctx.strokeStyle = C.ledYellow;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    const label = `${BANKS[Math.floor(index / 8)]}${(index % 8) + 1}`;
    text(ctx, label, x + 4, y + 6, { ...LABEL, size: 5.5, align: 'left', color: lit ? C.ledYellow : C.inkMuted });

    // The roll sits under the label, steps across.
    const rx = x + 3;
    const ry = y + 11;
    const rw = w - 6;
    const rh = h - 14;
    const stepW = rw / 16;
    const t = state.transport;
    if (current && t.playing && t.step >= 0) {
      const pos = t.positions[id];
      if (pos != null) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(rx + pos * stepW, ry, stepW, rh);
      }
    }
    if (pattern.length < 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(rx + pattern.length * stepW, ry, (16 - pattern.length) * stepW, rh);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) {
      ctx.beginPath();
      ctx.moveTo(rx + g * 4 * stepW, ry);
      ctx.lineTo(rx + g * 4 * stepW, ry + rh);
      ctx.stroke();
    }
    const drawn = KITS[id] ? this.drawDrums(ctx, pattern, rx, ry, rw, rh) : this.drawBass(ctx, pattern, rx, ry, rw, rh);
    if (!drawn) text(ctx, COPY.empty, x + w / 2, ry + rh / 2, { ...LABEL, size: 5, color: rgba(C.inkMuted, 0.6) });
  }

  // Notes as bars at their pitch; ties extend the bar, slides join the next
  // note, accents are brighter. Returns false for an empty pattern.
  drawBass(ctx, pattern, x, y, w, h) {
    const steps = pattern.steps;
    const stepW = w / 16;
    const noteH = Math.max(px(1.5), h / (HIGH - LOW + 1));
    const Y = (p) => y + h - ((p - LOW) / (HIGH - LOW)) * (h - noteH) - noteH;
    let any = false;
    let prev = null; // { pitch, accent } of the note sounding
    const held = heldSteps(pattern);
    steps.forEach((s, i) => {
      if (!s.gate && !held[i]) {
        prev = null;
        return;
      }
      any = true;
      const tie = held[i] && prev;
      const pitch = tie ? prev.pitch : s.note + s.octave * 12;
      const accent = tie ? prev.accent : s.accent;
      // A held or sliding note runs into the next step without a gap.
      const joined = s.slide || held[i + 1];
      const start = x + i * stepW + (tie ? 0 : stepW * 0.1);
      const end = x + (i + 1) * stepW - (joined ? 0 : stepW * 0.1);
      ctx.fillStyle = accent ? C.bassNoteAccent : C.bassNote;
      ctx.fillRect(start, Y(pitch), end - start, noteH);
      const next = steps[i + 1];
      if (s.slide && next?.gate && !next.tie && !held[i + 1]) {
        ctx.strokeStyle = rgba(C.bassNote, 0.7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + (i + 1) * stepW, Y(pitch) + noteH / 2);
        ctx.lineTo(x + (i + 1) * stepW + stepW * 0.3, Y(next.note + next.octave * 12) + noteH / 2);
        ctx.stroke();
      }
      prev = { pitch, accent };
    });
    return any;
  }

  // One row per lane, as on the machine's grid; accents brighter.
  drawDrums(ctx, pattern, x, y, w, h) {
    const cfg = KITS[this.id];
    const lanes = Object.keys(cfg.trackNames);
    const stepW = w / 16;
    const laneH = h / lanes.length;
    let any = false;
    lanes.forEach((lane, r) => {
      const steps = pattern.tracks[lane];
      if (!steps) return;
      for (let i = 0; i < 16; i++) {
        const hit = steps[i];
        if (!hit) continue;
        any = true;
        const color = lane === 'ac' ? C.inkLight : this.id === 'r808' ? cfg.theme.stepFaces[Math.floor(i / 4)] : cfg.theme.selBg;
        ctx.fillStyle = hit === HIT.accent ? C.ledYellow : color;
        ctx.fillRect(x + i * stepW + stepW * 0.12, y + r * laneH + laneH * 0.12, stepW * 0.76, Math.max(px(1), laneH * 0.76));
      }
    });
    return any;
  }
}
