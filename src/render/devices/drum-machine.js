import { HIT } from '../../state.js';
import { hits } from '../../ui/hits.js';
import { click, paintSteps, toggle } from '../../ui/handlers.js';
import { drawPatternTools, Knob, PatternSelector } from '../controls.js';
import { brushed, button, led, line, panel, rrect, screws, shade, text, textWidth, vgrad } from '../primitives.js';
import { C, KNOB, SELECTOR } from '../theme.js';

const HEADER_H = 18;
const STEP_X = 214;
const MAX_STEP_BTN_W = 46;
const SELECTOR_H = 52;

// Vertical positions for a panel of height h (minimum 188): extra height is shared
// by the knob section (rows spread apart) and the step section (rows spread,
// buttons a little taller).
function layout(h) {
  const extra = Math.max(0, h - 188);
  const bottomY = 118 + (extra * 100) / 170;
  const kv = (bottomY - HEADER_H) / 100;
  const bottomH = h - bottomY;
  const bv = bottomH / 70;
  const at = (offset) => bottomY + offset * bv;
  return {
    bottomY,
    knobTop: (top) => HEADER_H + (top - HEADER_H) * kv,
    knobRowH: (rowH) => rowH * kv,
    trackNameY: at(7),
    stepLedY: at(16),
    stepBtnY: at(23),
    stepBtnH: Math.min(34, 22 * bv),
    stepNumY: at(52),
    groupLineY: at(59),
    selectorY: bottomY + (bottomH - SELECTOR_H) / 2 + 2,
  };
}
const GROUP_LABEL = { size: 6.3, weight: 800, spacing: 0.3 };
// All-lanes grid: a screen right of the pattern selector, the knobs of the
// selected instrument in the free space above the selector.
const GRID_X = 204;
const GRID_LABEL_W = 20;
const SIDE_X0 = 18;
const SIDE_X1 = 196;
const GRID_HINT = {
  r808: 'CLICK A LANE NAME TO HEAR IT',
  r909: 'LANE NAME: LISTEN \u00B7 SHIFT-CLICK: ACCENT / FLAM',
};

export class DrumMachine {
  constructor(state, app, x, y, w, h, cfg) {
    Object.assign(this, { state, app, x, y, w, h, cfg, id: cfg.id });
    this.V = layout(h);
    this.knobs = [];
    state.define(`${cfg.id}.on`, 1);
    this.groups = this.layoutGroups();
    this.lanes = Object.keys(cfg.trackNames);
    this.gridKnobs = this.layoutGridKnobs();
    this.selector = new PatternSelector({ id: cfg.id, x: 20, y: this.V.selectorY, w: 176, theme: cfg.selector, state });
  }

  // Spreads instrument groups across the panel; each group is a small knob grid.
  layoutGroups() {
    const { cfg, w, state } = this;
    const L = cfg.layout;
    const pad = 4;
    const widths = cfg.groups.map((g) => Math.min(L.cols, g.knobs.length) * L.cellW + pad * 2);
    const total = widths.reduce((a, b) => a + b, 0);
    const gap = (w - 36 - total) / (cfg.groups.length - 1);
    let gx = 18;
    return cfg.groups.map((g, gi) => {
      const cols = Math.min(L.cols, g.knobs.length);
      g.knobs.forEach(([key, label, def], i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const inRow = Math.min(cols, g.knobs.length - row * cols);
        const param = `${cfg.id}.${g.id}.${key}`;
        state.define(param, def);
        this.knobs.push(
          new Knob({
            x: gx + pad + ((cols - inRow) * L.cellW) / 2 + (col + 0.5) * L.cellW,
            y: this.V.knobTop(L.top) + row * this.V.knobRowH(L.rowH),
            r: L.r,
            param,
            label,
            style: cfg.knob,
            labelColor: cfg.theme.ink,
            labelSize: 5.6,
            ticks: 9,
          }),
        );
      });
      const out = { ...g, x: gx, w: widths[gi] };
      gx += widths[gi] + gap;
      return out;
    });
  }

  // One row of knobs per instrument group, shown while the grid replaces the knob section.
  layoutGridKnobs() {
    const { cfg } = this;
    const y = HEADER_H + (this.V.bottomY - HEADER_H) * 0.55;
    return Object.fromEntries(
      cfg.groups.map((g) => {
        const n = g.knobs.length;
        const cell = Math.min(44, (SIDE_X1 - SIDE_X0) / n);
        const x0 = SIDE_X0 + (SIDE_X1 - SIDE_X0 - cell * n) / 2;
        const knobs = g.knobs.map(
          ([key, label], i) =>
            new Knob({ x: x0 + (i + 0.5) * cell, y, r: cfg.layout.r, param: `${cfg.id}.${g.id}.${key}`, label, style: cfg.knob, labelColor: cfg.theme.ink, labelSize: 5.6, ticks: 9 }),
        );
        return [g.id, knobs];
      }),
    );
  }

  draw(ctx) {
    const { w, h, cfg, state } = this;
    const t = cfg.theme;
    const BOTTOM_Y = this.V.bottomY;

    panel(ctx, 0, 0, w, h, t.panel);
    if (t.brushed) brushed(ctx, 0, HEADER_H, w, BOTTOM_Y - HEADER_H, t.brushed);
    ctx.fillStyle = vgrad(ctx, BOTTOM_Y, h, t.bottom);
    ctx.fillRect(0, BOTTOM_Y, w, h - BOTTOM_Y);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, BOTTOM_Y, w, 1);

    this.drawHeader(ctx);
    if (state.ui.grid[cfg.id]) {
      this.drawGrid(ctx);
    } else {
      this.drawGroups(ctx);
      for (const k of this.knobs) k.draw(ctx, state);
      this.drawSteps(ctx);
    }
    this.selector.draw(ctx);
    screws(ctx, w, h);
  }

  drawHeader(ctx) {
    const { w, cfg, state } = this;
    const t = cfg.theme;
    ctx.fillStyle = vgrad(ctx, 0, HEADER_H, t.header);
    ctx.fillRect(0, 0, w, HEADER_H);
    const titleOpts = { size: 10, weight: 900, italic: true, align: 'left', color: C.inkLight };
    text(ctx, cfg.title, 18, 9.5, titleOpts);
    let x = 18 + textWidth(ctx, cfg.title, titleOpts) + 8;
    for (const color of t.stripes) {
      ctx.fillStyle = color;
      ctx.fillRect(x, 6, 10, 6);
      x += 12;
    }
    const onParam = `${cfg.id}.on`;
    led(ctx, x + 6, 9, 2.3, state.on01(onParam), C.ledGreen);
    text(ctx, 'ON', x + 12, 9.5, { size: 6, align: 'left', color: C.inkMuted });
    hits.rect(ctx, x + 1, 2, 26, 14, toggle(state, onParam));
    text(ctx, cfg.subtitle, x + 34, 9.5, { size: 6, align: 'left', color: C.inkMuted, spacing: 1.2 });
    const left = drawPatternTools(ctx, { state, id: cfg.id, right: w - 10, led: t.led });

    // Grid toggle: every lane of the pattern at once instead of the knobs.
    const on = state.ui.grid[cfg.id];
    const bw = 48;
    const bx = left - 8 - bw;
    const key = `${cfg.id}.grid`;
    const off = button(ctx, bx, 3, bw, 12, { face: on ? C.btnPressed : C.btnDark, pressed: on || hits.isPressed(key) });
    led(ctx, bx + 6, 9 + off, 1.8, on, t.led);
    text(ctx, 'ALL LANES', bx + 11, 9.5 + off, { size: 5.5, weight: 800, align: 'left', color: C.inkLight, spacing: 0.4 });
    hits.rect(ctx, bx, 3, bw, 12, click(() => (state.ui.grid[cfg.id] = !on), key));
  }

  drawGrid(ctx) {
    const { w, h, cfg, state } = this;
    const t = cfg.theme;
    const dev = state.drums[cfg.id];
    const pattern = state.pattern(cfg.id);
    const sy = HEADER_H + 4;
    const sw = w - 14 - GRID_X;
    const sh = h - 6 - sy;
    rrect(ctx, GRID_X, sy, sw, sh, 2.5);
    ctx.fillStyle = vgrad(ctx, sy, sy + sh, C.screen);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    const x0 = GRID_X + GRID_LABEL_W + 6;
    const y0 = sy + 3;
    const stepW = (GRID_X + sw - 4 - x0) / 16;
    const laneH = (sh - 6) / this.lanes.length;
    const playhead = state.transport.playing ? (state.transport.positions[cfg.id] ?? -1) : -1;

    if (playhead >= 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(x0 + playhead * stepW, y0, stepW, laneH * this.lanes.length);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) line(ctx, Math.round(x0 + g * 4 * stepW) + 0.5, y0, Math.round(x0 + g * 4 * stepW) + 0.5, y0 + laneH * this.lanes.length);

    this.lanes.forEach((track, r) => {
      const y = y0 + r * laneH;
      const steps = pattern.tracks[track];
      const selected = dev.selected === track;
      if (selected) {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(GRID_X + 2, y, sw - 4, laneH);
      }
      text(ctx, track.toUpperCase(), GRID_X + 6, y + laneH / 2 + 0.5, { size: Math.min(6.5, laneH * 0.55), weight: 800, align: 'left', color: selected ? t.led : C.inkMuted, spacing: 0.4 });
      const listen = () => {
        dev.selected = track;
        this.app.engine.auditionDrum(cfg.id, track);
      };
      hits.rect(ctx, GRID_X, y, GRID_LABEL_W + 4, laneH, click(listen));
      for (let i = 0; i < 16; i++) {
        const hit = steps?.[i] ?? HIT.off;
        const cx = x0 + i * stepW + 1;
        const cw = stepW - 2;
        const ch = laneH - 2;
        if (i >= pattern.length) ctx.globalAlpha = 0.3;
        rrect(ctx, cx, y + 1, cw, ch, 1.5);
        ctx.fillStyle = hit ? this.cellColor(track, i) : C.cellOff;
        ctx.fill();
        if (hit === HIT.accent) {
          ctx.fillStyle = C.ledYellow;
          ctx.fillRect(cx + 1.5, y + 2, cw - 3, Math.max(1.5, ch * 0.22));
        } else if (hit === HIT.flam) {
          ctx.fillStyle = C.inkLight;
          for (const dx of [0.3, 0.6]) ctx.fillRect(cx + cw * dx - 0.8, y + 2, 1.6, ch - 2);
        }
        ctx.globalAlpha = 1;
      }
    });
    hits.rect(ctx, x0, y0, 16 * stepW, laneH * this.lanes.length, this.gridHandler(pattern, x0, y0, stepW, laneH));
    this.drawGridSide(ctx);
  }

  cellColor(track, i) {
    const t = this.cfg.theme;
    if (track === 'ac') return C.inkLight;
    return this.cfg.id === 'r808' ? t.stepFaces[Math.floor(i / 4)] : t.selBg;
  }

  // The selected lane's instrument: name and knobs, so it stays playable.
  drawGridSide(ctx) {
    const { cfg, state } = this;
    const t = cfg.theme;
    const dev = state.drums[cfg.id];
    const group = cfg.groups.find((g) => g.tracks.includes(dev.selected)) ?? cfg.groups[0];
    const name = cfg.trackNames[dev.selected] ?? group.label;
    const cx = (SIDE_X0 + SIDE_X1) / 2;
    const tw = textWidth(ctx, name, GROUP_LABEL) + 10;
    rrect(ctx, cx - tw / 2, 22, tw, 10, 2);
    ctx.fillStyle = t.selBg;
    ctx.fill();
    text(ctx, name, cx, 27.5, { ...GROUP_LABEL, color: t.selInk });
    for (const k of this.gridKnobs[group.id]) k.draw(ctx, state);
    text(ctx, GRID_HINT[cfg.id], cx, this.V.bottomY - 7, { size: 5, weight: 700, color: t.ink, spacing: 0.4 });
  }

  // Click a cell to flip it and drag to paint that value across the grid;
  // painting "on" keeps existing accents and flams. Shift-click on the 909
  // cycles on → accent → flam → off.
  gridHandler(pattern, x0, y0, stepW, laneH) {
    const { state, cfg, lanes } = this;
    const dev = state.drums[cfg.id];
    const cell = (p) => {
      const i = Math.floor((p.x - x0) / stepW);
      const r = Math.floor((p.y - y0) / laneH);
      return i >= 0 && i < 16 && r >= 0 && r < lanes.length ? { i, r } : null;
    };
    const steps = (r) => state.drumTrack(cfg.id, lanes[r], pattern);
    return {
      cursor: 'pointer',
      down: (ev) => {
        const c = cell(ev.p);
        if (!c) return null;
        dev.selected = lanes[c.r];
        const s = steps(c.r);
        if (cfg.id === 'r909' && ev.fine) {
          s[c.i] = (s[c.i] + 1) % 4;
          return {};
        }
        const on = !(s[c.i] > 0);
        const paint = (track, i) => (track[i] = on ? track[i] || HIT.on : HIT.off);
        paint(s, c.i);
        let last = c;
        return {
          move: (ev) => {
            const n = cell(ev.p);
            if (!n || (n.i === last.i && n.r === last.r)) return;
            const track = steps(n.r);
            if (n.r === last.r) {
              const dir = Math.sign(n.i - last.i);
              for (let k = last.i + dir; k !== n.i + dir; k += dir) paint(track, k);
            } else {
              paint(track, n.i);
            }
            last = n;
          },
        };
      },
    };
  }

  drawGroups(ctx) {
    const { cfg, state } = this;
    const t = cfg.theme;
    const dev = state.drums[cfg.id];
    const selected = dev.selected;
    const BOTTOM_Y = this.V.bottomY;
    this.groups.forEach((g, i) => {
      const cx = g.x + g.w / 2;
      // Groups with two voices (hi-hat, cymbal) alternate between them on repeat clicks.
      const pick = () => {
        const at = g.tracks.indexOf(dev.selected);
        dev.selected = g.tracks[(at + 1) % g.tracks.length];
        this.app.engine.auditionDrum(cfg.id, dev.selected);
      };
      hits.rect(ctx, g.x, 21, g.w, 12, click(pick));
      if (g.tracks.includes(selected)) {
        const tw = textWidth(ctx, g.label, GROUP_LABEL) + 8;
        rrect(ctx, cx - tw / 2, 22, tw, 10, 2);
        ctx.fillStyle = t.selBg;
        ctx.fill();
        text(ctx, g.label, cx, 27.5, { ...GROUP_LABEL, color: t.selInk });
      } else {
        text(ctx, g.label, cx, 27.5, { ...GROUP_LABEL, color: t.ink });
      }
      const next = this.groups[i + 1];
      if (!next) return;
      const sx = Math.round((g.x + g.w + next.x) / 2) + 0.5;
      ctx.lineWidth = 1;
      ctx.strokeStyle = t.sep;
      line(ctx, sx, 22, sx, BOTTOM_Y - 6);
    });
  }

  drawSteps(ctx) {
    const { w, cfg, state } = this;
    const t = cfg.theme;
    const dev = state.drums[cfg.id];
    const pattern = state.pattern(cfg.id);
    const track = state.drumTrack(cfg.id, dev.selected);
    const stepW = (w - 18 - STEP_X) / 16;
    const bw = Math.min(MAX_STEP_BTN_W, stepW - 6);
    const { trackNameY: TRACK_NAME_Y, stepLedY: STEP_LED_Y, stepBtnY: STEP_BTN_Y, stepBtnH: STEP_BTN_H, stepNumY: STEP_NUM_Y, groupLineY: GROUP_LINE_Y } = this.V;
    const playhead = state.transport.playing ? (state.transport.positions[cfg.id] ?? -1) : -1;
    const hint = cfg.id === 'r909' ? '   SHIFT-CLICK: ON / ACCENT / FLAM' : '';

    text(ctx, `\u25B8 ${cfg.trackNames[dev.selected]}${hint}`, STEP_X + 3, TRACK_NAME_Y, { size: 6.5, weight: 800, align: 'left', color: t.bottomInk, spacing: 0.6 });

    for (let i = 0; i < 16; i++) {
      const cx = STEP_X + i * stepW + stepW / 2;
      const group = Math.floor(i / 4);
      const playing = playhead === i;
      const hit = track[i];
      if (i >= pattern.length) ctx.globalAlpha = 0.3;
      led(ctx, cx, STEP_LED_Y, 2.8, hit > 0 || playing, playing && !hit ? C.inkLight : t.led);
      // Second small LED marks the 909's per-step accent (yellow) or flam.
      if (hit === HIT.accent) led(ctx, cx + 7, STEP_LED_Y, 1.8, true, C.ledYellow);
      if (hit === HIT.flam) led(ctx, cx + 7, STEP_LED_Y, 1.8, true, t.led);
      const face = t.stepFaces[group];
      const off = button(ctx, cx - bw / 2, STEP_BTN_Y, bw, STEP_BTN_H, { face: [shade(face, 0.22), face, shade(face, -0.18)], pressed: playing, radius: 2.5 });
      if (playing) {
        rrect(ctx, cx - bw / 2, STEP_BTN_Y + off, bw, STEP_BTN_H, 2.5);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();
      }
      text(ctx, String(i + 1), cx, STEP_NUM_Y, { size: 6.5, weight: 800, color: t.bottomInk });
      ctx.globalAlpha = 1;
    }

    hits.rect(ctx, STEP_X, STEP_LED_Y - 7, 16 * stepW, STEP_BTN_Y + STEP_BTN_H - STEP_LED_Y + 7, this.stepHandler(track, stepW));

    ctx.lineWidth = 1.2;
    for (let g = 0; g < 4; g++) {
      const x0 = STEP_X + g * 4 * stepW + 3;
      const x1 = STEP_X + (g * 4 + 4) * stepW - 3;
      ctx.strokeStyle = t.groupLine[g % t.groupLine.length];
      line(ctx, x0, GROUP_LINE_Y, x1, GROUP_LINE_Y);
    }
  }

  // Click/drag paints hits on/off; on the 909, shift-click cycles on → accent → flam → off.
  stepHandler(track, stepW) {
    const is909 = this.cfg.id === 'r909';
    const paint = paintSteps({ x0: STEP_X, stepW, get: (i) => track[i] > 0, set: (i, v) => (track[i] = v ? HIT.on : HIT.off) });
    return {
      ...paint,
      down: (ev) => {
        if (!is909 || !ev.fine) return paint.down(ev);
        const i = Math.floor((ev.p.x - STEP_X) / stepW);
        if (i >= 0 && i < track.length) track[i] = (track[i] + 1) % 4;
        return {};
      },
    };
  }
}

const TRACKS_808 = {
  bd: 'BASS DRUM', sd: 'SNARE DRUM', lt: 'LOW TOM', mt: 'MID TOM', ht: 'HI TOM', rs: 'RIM SHOT',
  cp: 'HAND CLAP', cb: 'COW BELL', cy: 'CYMBAL', oh: 'OPEN HIHAT', ch: 'CLOSED HIHAT', ac: 'ACCENT',
};

export const R808 = {
  id: 'r808',
  title: 'DRUM 08',
  subtitle: 'ANALOG RHYTHM MACHINE',
  knob: KNOB.r808,
  selector: SELECTOR.r808,
  trackNames: TRACKS_808,
  theme: {
    panel: ['#34322f', '#1f1e1c'],
    bottom: ['#1d1c1b', '#121211'],
    header: ['#151515', '#0a0a0a'],
    stripes: C.r808Steps,
    ink: '#ece5d3',
    bottomInk: '#ece5d3',
    selBg: '#ece5d3',
    selInk: '#1a1a1a',
    sep: 'rgba(236,229,211,0.14)',
    led: C.ledRed,
    stepFaces: C.r808Steps,
    groupLine: C.r808Steps,
    brushed: 0.15,
  },
  layout: { cols: 1, cellW: 50, rowH: 26, r: 8.5, top: 45 },
  groups: [
    { id: 'bd', label: 'BASS DRUM', tracks: ['bd'], knobs: [['level', 'LEVEL', 0.8], ['tone', 'TONE', 0.5], ['decay', 'DECAY', 0.6]] },
    { id: 'sd', label: 'SNARE DRUM', tracks: ['sd'], knobs: [['level', 'LEVEL', 0.7], ['tone', 'TONE', 0.5], ['snappy', 'SNAPPY', 0.6]] },
    { id: 'lt', label: 'LOW TOM', tracks: ['lt'], knobs: [['level', 'LEVEL', 0.6], ['tuning', 'TUNING', 0.5]] },
    { id: 'mt', label: 'MID TOM', tracks: ['mt'], knobs: [['level', 'LEVEL', 0.6], ['tuning', 'TUNING', 0.5]] },
    { id: 'ht', label: 'HI TOM', tracks: ['ht'], knobs: [['level', 'LEVEL', 0.6], ['tuning', 'TUNING', 0.5]] },
    { id: 'rs', label: 'RIM SHOT', tracks: ['rs'], knobs: [['level', 'LEVEL', 0.6]] },
    { id: 'cp', label: 'HAND CLAP', tracks: ['cp'], knobs: [['level', 'LEVEL', 0.7]] },
    { id: 'cb', label: 'COW BELL', tracks: ['cb'], knobs: [['level', 'LEVEL', 0.5]] },
    { id: 'cy', label: 'CYMBAL', tracks: ['cy'], knobs: [['level', 'LEVEL', 0.5], ['tone', 'TONE', 0.5], ['decay', 'DECAY', 0.6]] },
    { id: 'oh', label: 'OPEN HAT', tracks: ['oh'], knobs: [['level', 'LEVEL', 0.6], ['decay', 'DECAY', 0.4]] },
    { id: 'ch', label: 'CLSD HAT', tracks: ['ch'], knobs: [['level', 'LEVEL', 0.7]] },
    { id: 'ac', label: 'ACCENT', tracks: ['ac'], knobs: [['level', 'LEVEL', 0.6]] },
  ],
};

const TRACKS_909 = {
  bd: 'BASS DRUM', sd: 'SNARE DRUM', lt: 'LOW TOM', mt: 'MID TOM', ht: 'HI TOM', rs: 'RIM SHOT', cp: 'HAND CLAP',
  ch: 'CLOSED HI-HAT', oh: 'OPEN HI-HAT', cr: 'CRASH CYMBAL', rd: 'RIDE CYMBAL', ac: 'ACCENT',
};

const STEP_909 = '#e9e9e5';

export const R909 = {
  id: 'r909',
  title: 'DRUM 09',
  subtitle: 'HYBRID RHYTHM MACHINE',
  knob: KNOB.r909,
  selector: SELECTOR.r909,
  trackNames: TRACKS_909,
  theme: {
    panel: ['#d6d7d2', '#acada8'],
    bottom: ['#3a3b3d', '#232426'],
    header: ['#2a2b2d', '#18191a'],
    stripes: ['#ef6a1d', '#ef6a1d', '#ef6a1d'],
    ink: '#1d1d1d',
    bottomInk: '#d0d1cc',
    selBg: '#ef6a1d',
    selInk: '#ffffff',
    sep: 'rgba(0,0,0,0.2)',
    led: C.ledOrange,
    stepFaces: [STEP_909, STEP_909, STEP_909, STEP_909],
    groupLine: ['#ef6a1d', '#8e8f8a'],
    brushed: 0.55,
  },
  layout: { cols: 2, cellW: 32, rowH: 36, r: 10, top: 50 },
  groups: [
    { id: 'bd', label: 'BASS DRUM', tracks: ['bd'], knobs: [['tune', 'TUNE', 0.5], ['level', 'LEVEL', 0.8], ['attack', 'ATTACK', 0.4], ['decay', 'DECAY', 0.6]] },
    { id: 'sd', label: 'SNARE DRUM', tracks: ['sd'], knobs: [['tune', 'TUNE', 0.5], ['tone', 'TONE', 0.5], ['snappy', 'SNAPPY', 0.6], ['level', 'LEVEL', 0.7]] },
    { id: 'lt', label: 'LOW TOM', tracks: ['lt'], knobs: [['tune', 'TUNE', 0.5], ['decay', 'DECAY', 0.5], ['level', 'LEVEL', 0.6]] },
    { id: 'mt', label: 'MID TOM', tracks: ['mt'], knobs: [['tune', 'TUNE', 0.5], ['decay', 'DECAY', 0.5], ['level', 'LEVEL', 0.6]] },
    { id: 'ht', label: 'HI TOM', tracks: ['ht'], knobs: [['tune', 'TUNE', 0.5], ['decay', 'DECAY', 0.5], ['level', 'LEVEL', 0.6]] },
    { id: 'rs', label: 'RIM', tracks: ['rs'], knobs: [['level', 'LEVEL', 0.6]] },
    { id: 'cp', label: 'CLAP', tracks: ['cp'], knobs: [['level', 'LEVEL', 0.7]] },
    { id: 'hh', label: 'HI-HAT', tracks: ['ch', 'oh'], knobs: [['level', 'LEVEL', 0.7], ['chDecay', 'CH DEC', 0.3], ['ohDecay', 'OH DEC', 0.5]] },
    { id: 'cy', label: 'CYMBAL', tracks: ['cr', 'rd'], knobs: [['crLevel', 'CRASH', 0.5], ['crTune', 'C TUNE', 0.5], ['rdLevel', 'RIDE', 0.5], ['rdTune', 'R TUNE', 0.5]] },
    { id: 'ac', label: 'ACCENT', tracks: ['ac'], knobs: [['level', 'LEVEL', 0.6], ['flam', 'FLAM', 0.3]] },
  ],
};
