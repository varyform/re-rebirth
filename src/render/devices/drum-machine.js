import { Knob, PatternSelector } from '../controls.js';
import { brushed, button, led, line, panel, rrect, screws, shade, text, textWidth, vgrad } from '../primitives.js';
import { C, KNOB, SELECTOR } from '../theme.js';

const HEADER_H = 18;
const BOTTOM_Y = 124;
const STEP_X = 214;
const GROUP_LABEL = { size: 6.3, weight: 800, spacing: 0.3 };

export class DrumMachine {
  constructor(state, x, y, w, h, cfg) {
    Object.assign(this, { state, x, y, w, h, cfg, id: cfg.id });
    this.knobs = [];
    state.define(`${cfg.id}.shuffle`, 0);
    this.groups = this.layoutGroups();
    this.selector = new PatternSelector({ x: 20, y: 136, w: 176, theme: cfg.selector, getDevice: () => state.drums[cfg.id] });
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
            y: L.top + row * L.rowH,
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

  draw(ctx) {
    const { w, h, cfg, state } = this;
    const t = cfg.theme;

    panel(ctx, 0, 0, w, h, t.panel);
    if (t.brushed) brushed(ctx, 0, HEADER_H, w, BOTTOM_Y - HEADER_H, t.brushed);
    ctx.fillStyle = vgrad(ctx, BOTTOM_Y, h, t.bottom);
    ctx.fillRect(0, BOTTOM_Y, w, h - BOTTOM_Y);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, BOTTOM_Y, w, 1);

    this.drawHeader(ctx);
    this.drawGroups(ctx);
    for (const k of this.knobs) k.draw(ctx, state);
    this.selector.draw(ctx);
    this.drawSteps(ctx);
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
    text(ctx, cfg.subtitle, x + 6, 9.5, { size: 6, align: 'left', color: C.inkMuted, spacing: 1.2 });

    const shuffle = state.get(`${cfg.id}.shuffle`) >= 0.5;
    led(ctx, w - 62, 9, 2.3, shuffle, t.led);
    text(ctx, 'SHUFFLE', w - 56, 9.5, { size: 6, align: 'left', color: C.inkMuted, spacing: 0.8 });
  }

  drawGroups(ctx) {
    const { cfg, state } = this;
    const t = cfg.theme;
    const selected = state.drums[cfg.id].selected;
    this.groups.forEach((g, i) => {
      const cx = g.x + g.w / 2;
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
    const track = state.drumTrack(cfg.id, dev.selected);
    const stepW = (w - 18 - STEP_X) / 16;
    const bw = stepW - 6;

    text(ctx, `\u25B8 ${cfg.trackNames[dev.selected]}`, STEP_X + 3, 131, { size: 6.5, weight: 800, align: 'left', color: t.bottomInk, spacing: 0.6 });

    for (let i = 0; i < 16; i++) {
      const cx = STEP_X + i * stepW + stepW / 2;
      const group = Math.floor(i / 4);
      const playing = state.transport.step === i;
      led(ctx, cx, 141, 2.8, track[i] || playing, playing && !track[i] ? C.inkLight : t.led);
      const face = t.stepFaces[group];
      const off = button(ctx, cx - bw / 2, 149, bw, 26, { face: [shade(face, 0.22), face, shade(face, -0.18)], pressed: playing, radius: 2.5 });
      if (playing) {
        rrect(ctx, cx - bw / 2, 149 + off, bw, 26, 2.5);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();
      }
      text(ctx, String(i + 1), cx, 184, { size: 6.5, weight: 800, color: t.bottomInk });
    }

    ctx.lineWidth = 1.2;
    for (let g = 0; g < 4; g++) {
      const x0 = STEP_X + g * 4 * stepW + 3;
      const x1 = STEP_X + (g * 4 + 4) * stepW - 3;
      ctx.strokeStyle = t.groupLine[g % t.groupLine.length];
      line(ctx, x0, 192, x1, 192);
    }
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
  layout: { cols: 1, cellW: 50, rowH: 28, r: 8.5, top: 46 },
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
  layout: { cols: 2, cellW: 32, rowH: 40, r: 10, top: 52 },
  groups: [
    { id: 'bd', label: 'BASS DRUM', tracks: ['bd'], knobs: [['tune', 'TUNE', 0.5], ['level', 'LEVEL', 0.8], ['attack', 'ATTACK', 0.4], ['decay', 'DECAY', 0.6]] },
    { id: 'sd', label: 'SNARE DRUM', tracks: ['sd'], knobs: [['tune', 'TUNE', 0.5], ['tone', 'TONE', 0.5], ['snappy', 'SNAPPY', 0.6], ['level', 'LEVEL', 0.7]] },
    { id: 'lt', label: 'LOW TOM', tracks: ['lt'], knobs: [['tune', 'TUNE', 0.5], ['decay', 'DECAY', 0.5], ['level', 'LEVEL', 0.6]] },
    { id: 'mt', label: 'MID TOM', tracks: ['mt'], knobs: [['tune', 'TUNE', 0.5], ['decay', 'DECAY', 0.5], ['level', 'LEVEL', 0.6]] },
    { id: 'ht', label: 'HI TOM', tracks: ['ht'], knobs: [['tune', 'TUNE', 0.5], ['decay', 'DECAY', 0.5], ['level', 'LEVEL', 0.6]] },
    { id: 'rs', label: 'RIM', tracks: ['rs'], knobs: [['level', 'LEVEL', 0.6]] },
    { id: 'cp', label: 'CLAP', tracks: ['cp'], knobs: [['level', 'LEVEL', 0.7]] },
    { id: 'hh', label: 'HI-HAT', tracks: ['ch', 'oh'], knobs: [['chLevel', 'CH LVL', 0.7], ['chDecay', 'CH DEC', 0.3], ['ohLevel', 'OH LVL', 0.6], ['ohDecay', 'OH DEC', 0.5]] },
    { id: 'cy', label: 'CYMBAL', tracks: ['cr', 'rd'], knobs: [['crLevel', 'CRASH', 0.5], ['crTune', 'C TUNE', 0.5], ['rdLevel', 'RIDE', 0.5], ['rdTune', 'R TUNE', 0.5]] },
    { id: 'ac', label: 'ACCENT', tracks: ['ac'], knobs: [['level', 'LEVEL', 0.6]] },
  ],
};
