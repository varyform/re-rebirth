import { DELAY_STEPS } from '../../audio/engine.js';
import { PCF_WAVE_COUNT, PCF_WAVES } from '../../audio/pcf-waves.js';
import { CHANNELS, COMP_TARGETS, PCF_TARGETS } from '../../channels.js';
import { hits } from '../../ui/hits.js';
import { click, knobDrag, toggle } from '../../ui/handlers.js';
import { Knob } from '../controls.js';
import { brushed, button, icon, lcd, led, ledBar, MONO, panel, rrect, sevenSeg, sevenSegWidth, shade, text, vgrad } from '../primitives.js';
import { C } from '../theme.js';
import { spectrumDisplay } from '../spectrum.js';
import { vuMeter } from '../vu-meter.js';
import { compHere, drawButton, drawFaderWithMeters, styleFor, toggleComp } from './channel-strip.js';

const MODULES = [
  { key: 'master', title: 'MASTER', accent: C.mixer },
  { key: 'delay', title: 'DELAY', accent: C.delay, toggle: 'fx.delay.on' },
  { key: 'dist', title: 'DISTORTION', accent: C.dist, toggle: 'fx.dist.on' },
  { key: 'comp', title: 'COMPRESSOR', accent: C.comp, toggle: 'fx.comp.on' },
  { key: 'pcf', title: 'PATTERN FILTER', accent: C.pcf, toggle: 'fx.pcf.on' },
];


// Effect modules are laid out for this size; a larger rack spreads them
// horizontally and centres their contents vertically.
const BASE_W = 300;
const BASE_MODULE_H = 92;
const MASTER_COL_X = 60; // delay return + COMP column, right of the master fader and meters

// Right-hand column, roughly like ReBirth's: the master beside bass line 1, the
// pattern filter beside bass line 2, delay and distortion beside Drum 08 and the
// compressor beside Drum 09 (`bands` are those instrument rows).
export class EffectsColumn {
  constructor(state, x, y, w, h, bands, gap) {
    Object.assign(this, { state, x, y, w, h });
    this.k = w / BASE_W;
    const rects = moduleRects(bands, gap);
    this.modules = MODULES.map((m) => ({ ...m, ...rects[m.key], w, knobs: [] }));
    this.mod = Object.fromEntries(this.modules.map((m) => [m.key, m]));
    for (const m of this.modules) if (m.toggle) state.define(m.toggle, 1);
    this.layoutMaster(this.mod.master);
    this.layoutEffects();
  }

  addKnob(m, x, y, r, param, label, def, extra = {}) {
    this.state.define(param, def);
    m.knobs.push(new Knob({ x, y, r, param, label, style: styleFor(m.accent), ...extra }));
  }

  layoutMaster(m) {
    this.addKnob(m, MASTER_COL_X + 20, 44, 12, 'mixer.delayReturn', 'DLY RETURN', 0.6, { style: styleFor(C.delay), labelSize: 5.5 });
    this.state.define('mixer.master.level', 0.8);
  }

  layoutEffects() {
    const { delay, dist, comp, pcf } = this.mod;
    const { state, k } = this;
    this.addKnob(delay, 116 * k, 50, 14, 'fx.delay.steps', 'STEPS', 2 / (DELAY_STEPS - 1), { ticks: 9 });
    this.addKnob(delay, 180 * k, 50, 14, 'fx.delay.feedback', 'FEEDBACK', 0.45);
    this.addKnob(delay, 244 * k, 50, 14, 'fx.delay.pan', 'PAN', 0.5);
    state.define('fx.delay.triplet', 0);

    this.addKnob(dist, 44 * k, 50, 14, 'fx.dist.amount', 'AMOUNT', 0.4);
    this.addKnob(dist, 110 * k, 50, 14, 'fx.dist.shape', 'SHAPE', 0.55);

    this.addKnob(comp, 44 * k, 50, 14, 'fx.comp.amount', 'AMOUNT', 0.3);
    this.addKnob(comp, 110 * k, 50, 14, 'fx.comp.threshold', 'THRESHOLD', 0.5);
    state.define('fx.comp.target', 0);
    state.define('fx.comp.routed', 1);

    this.addKnob(pcf, 156 * k, 38, 10, 'fx.pcf.freq', 'FREQ', 0.45, { labelSize: 5.5 });
    this.addKnob(pcf, 194 * k, 38, 10, 'fx.pcf.reso', 'RESO', 0.5, { labelSize: 5.5 });
    this.addKnob(pcf, 232 * k, 38, 10, 'fx.pcf.amount', 'AMOUNT', 0.6, { labelSize: 5.5 });
    this.addKnob(pcf, 270 * k, 38, 10, 'fx.pcf.decay', 'DECAY', 0.4, { labelSize: 5.5 });
    state.define('fx.pcf.wave', 0);
    state.define('fx.pcf.mode', 1);
    state.define('fx.pcf.target', 0);
  }

  draw(ctx) {
    const { state } = this;
    for (const m of this.modules) {
      ctx.save();
      ctx.translate(0, m.y);
      this.drawFrame(ctx, m);
      if (m.key === 'master') this.drawMaster(ctx, m);
      else {
        // Effect contents keep their base height, centred below the title bar.
        ctx.translate(0, Math.max(0, (m.h - BASE_MODULE_H) / 2));
        const base = { ...m, h: BASE_MODULE_H };
        if (m.key === 'delay') this.drawDelay(ctx, base);
        if (m.key === 'dist') this.drawDist(ctx, base);
        if (m.key === 'comp') this.drawComp(ctx, base);
        if (m.key === 'pcf') this.drawPcf(ctx, base);
      }
      for (const k of m.knobs) k.draw(ctx, state);
      ctx.restore();
    }
  }

  // Brushed neutral grey, so the effects read apart from the slate channel strips.
  drawFrame(ctx, m) {
    panel(ctx, 0, 0, m.w, m.h, C.fxPanel);
    brushed(ctx, 1, 15, m.w - 2, m.h - 16, 0.25);
    ctx.fillStyle = vgrad(ctx, 1, 15, C.fxTitle);
    ctx.fillRect(1, 1, m.w - 2, 14);
    rrect(ctx, 6, 4.5, 3, 7, 1);
    ctx.fillStyle = m.accent;
    ctx.fill();
    text(ctx, m.title, 13, 8.5, { size: 7, weight: 800, align: 'left', spacing: 1 });
    if (m.toggle) {
      led(ctx, m.w - 22, 8, 2.3, this.state.on01(m.toggle), m.accent);
      text(ctx, 'ON', m.w - 16, 8.5, { size: 5.5, align: 'left', color: C.inkMuted });
      hits.rect(ctx, m.w - 28, 1, 26, 14, toggle(this.state, m.toggle));
    }
  }

  // Master fader with its left/right meter, then a column with the delay return
  // and the master COMP button (the compressor's master position). The rest shows
  // analogue VU needles for left and right, or (click to switch) a spectrum.
  drawMaster(ctx, m) {
    const { state } = this;
    const fy = 30;
    drawFaderWithMeters(ctx, state, 18, fy, m.h - 12 - fy, 'mixer.master.level', state.meters.master);
    drawButton(ctx, MASTER_COL_X, 74, 40, 'COMP', compHere(state, 0), C.comp, () => toggleComp(state, 0));

    const vx = MASTER_COL_X + 52;
    const vw = m.w - 14 - vx;
    const top = 24;
    const total = m.h - 12 - top;
    if (state.ui.masterView === 'spectrum') {
      spectrumDisplay(ctx, vx, top, vw, total, state.meters.spectrum);
    } else {
      const vh = (total - 6) / 2;
      const [l, r] = state.meters.vu ?? [0, 0];
      vuMeter(ctx, vx, top, vw, vh, l, 'L');
      vuMeter(ctx, vx, top + vh + 6, vw, vh, r, 'R');
    }
    const flip = () => (state.ui.masterView = state.ui.masterView === 'spectrum' ? 'vu' : 'spectrum');
    hits.rect(ctx, vx, top, vw, total, click(flip));
  }

  // Horizontal LED strip; `lit` LEDs from the left. Colors: green, then yellow, red at the end.
  ledRow(ctx, x, y, w, count, lit, { yellowFrom = count - 3, redFrom = count - 1, color = null } = {}) {
    const pitch = w / count;
    for (let i = 0; i < count; i++) {
      const c = color ?? (i >= redFrom ? C.ledRed : i >= yellowFrom ? C.ledYellow : C.ledGreen);
      ledBar(ctx, x + i * pitch, y, pitch - 2, 5, i < lit, c);
    }
  }

  fxMeters() {
    return this.state.meters.fx ?? {};
  }

  drawDelay(ctx, m) {
    const { state } = this;
    // Echo output level, so feedback tails are visible.
    const echo = this.fxMeters().delay ?? 0;
    const ex = 100 * this.k;
    this.ledRow(ctx, ex, m.h - 16, m.w - 14 - ex, 12, Math.round(echo * 12), { color: C.delay });
    // The label needs room beside the step-mode button (x 14..66).
    if (ex - 26 > 70) text(ctx, 'ECHO', ex - 4, m.h - 13.5, { size: 5.5, align: 'right', color: C.inkMuted, spacing: 0.6 });
    const steps = String(state.choice('fx.delay.steps', DELAY_STEPS) + 1);
    lcd(ctx, 14, 24, 52, 36);
    sevenSeg(ctx, steps, 14 + (52 - sevenSegWidth(steps, 12)) / 2, 30, 12, 24);
    hits.rect(ctx, 14, 24, 52, 36, knobDrag(state, 'fx.delay.steps'));
    const triplet = state.on01('fx.delay.triplet');
    const off = button(ctx, 14, 70, 52, 14, { pressed: triplet, face: triplet ? [shade(C.delay, 0.3), C.delay] : C.btnDark });
    text(ctx, triplet ? '1/16 TRIPLET' : '1/16 STEPS', 40, 77.5 + off, { size: 5.5, weight: 800, color: triplet ? C.bassInk : C.inkLight });
    hits.rect(ctx, 14, 70, 52, 14, toggle(state, 'fx.delay.triplet'));
  }

  // Distortion is switched per channel (DIST buttons on the strips): show which, and
  // the level coming out of the distortion.
  drawDist(ctx, m) {
    const x = 160 * this.k;
    const w = m.w - x - 14;
    lcd(ctx, x, 26, w, 18, C.lcdGreen);
    const on = this.state.on01('fx.dist.on') ? CHANNELS.filter(([id]) => this.state.on01(`mixer.${id}.dist`)).map(([, label]) => label.replace(/\D+/g, (s) => s[0])) : [];
    text(ctx, on.length ? on.join(' ') : 'NONE', x + w / 2, 35.5, { size: 7, family: MONO, color: C.lcdGreenOn });
    text(ctx, 'ON CHANNELS (DIST)', x + w / 2, 51, { size: 5, color: C.inkMuted, spacing: 0.5 });
    const level = this.fxMeters().dist ?? 0;
    this.ledRow(ctx, x, 60, w, 10, Math.round(level * 10), { yellowFrom: 7, redFrom: 9 });
    text(ctx, 'OUTPUT', x + w / 2, 74, { size: 5.5, color: C.inkMuted, spacing: 0.6 });
  }

  // Gain-reduction meter (2 dB per LED) plus where the compressor sits. Routing
  // is set with the COMP buttons on the channel strips and the master module.
  drawComp(ctx, m) {
    const { state } = this;
    const x = 160 * this.k;
    const w = m.w - x - 14;
    const routed = state.on01('fx.comp.routed');
    const where = !state.on01('fx.comp.on') || !routed ? 'OFF' : COMP_TARGETS[state.choice('fx.comp.target', COMP_TARGETS.length)];
    lcd(ctx, x, 26, w, 18, C.lcdGreen);
    text(ctx, `ON ${where}`, x + w / 2, 35.5, { size: 7, family: MONO, color: C.lcdGreenOn });
    const reduction = -(this.fxMeters().compReduction ?? 0);
    const count = 12;
    this.ledRow(ctx, x, 54, w, count, Math.min(count, Math.round(reduction / 2)), { yellowFrom: 6, redFrom: 9 });
    [['0', 0], ['6', 3], ['12', 6], ['24', 12]].forEach(([label, i]) => text(ctx, label, x + (i * w) / count - (i === count ? 3 : 0), 64, { size: 5, color: C.inkMuted }));
    text(ctx, `GAIN REDUCTION ${reduction.toFixed(1)} dB`, x + w / 2, 74, { size: 5.5, color: C.inkMuted, spacing: 0.4 });
  }

  // Click the readout to cycle a routing choice.
  drawChoice(ctx, x, y, w, param, options, label) {
    const { state } = this;
    const i = state.choice(param, options.length);
    lcd(ctx, x, y, w, 18, C.lcdGreen);
    text(ctx, `\u25B8 ${options[i]}`, x + w / 2, y + 9.5, { size: 7.5, family: MONO, color: C.lcdGreenOn });
    if (label) text(ctx, label, x + w / 2, y + 30, { size: 5.5, color: C.inkMuted, spacing: 0.8 });
    hits.rect(ctx, x, y, w, 18, click(() => state.setChoice(param, (i + 1) % options.length, options.length)));
  }

  drawPcf(ctx, m) {
    const { state } = this;
    const x = 12;
    const y = 22;
    const w = 120 * this.k;
    const h = 46;
    const wave = state.choice('fx.pcf.wave', PCF_WAVE_COUNT);
    lcd(ctx, x, y, w, h, C.lcdGreen);
    text(ctx, `WAVE ${String(wave + 1).padStart(2, '0')}`, x + 5, y + 7, { size: 5.5, family: MONO, align: 'left', color: C.lcdGreenOn });
    const bw = (w - 10) / 16;
    const top = y + 14;
    const maxH = h - 18;
    // While playing: the step the filter is on, and its live cutoff (log scale).
    const n = PCF_TARGETS.length;
    const target = state.choice('fx.pcf.target', n);
    const t = state.transport;
    const active = t.playing && state.on01('fx.pcf.on') && target > 0;
    const step = active ? (t.positions[CHANNELS[target - 1][0]] ?? -1) : -1;
    PCF_WAVES[wave].forEach((v, i) => {
      const bx = x + 5 + i * bw;
      ctx.fillStyle = C.lcdGreenDim;
      ctx.fillRect(bx + 0.8, top, bw - 1.6, maxH);
      ctx.fillStyle = i === step ? C.lcdGreenOn : C.lcdGreenMid;
      const bh = Math.max(1, v * maxH);
      ctx.fillRect(bx + 0.8, top + maxH - bh, bw - 1.6, bh);
    });
    const hz = this.fxMeters().pcfHz;
    if (active && hz) {
      const pos = Math.min(1, Math.max(0, Math.log2(hz / 30) / Math.log2(14000 / 30)));
      const ly = top + maxH - pos * maxH;
      ctx.fillStyle = C.ledYellow;
      ctx.fillRect(x + 4, ly - 0.5, w - 8, 1);
      text(ctx, hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`, x + w - 5, y + 7, { size: 5.5, family: MONO, align: 'right', color: C.ledYellow });
    }
    hits.rect(ctx, x, y, w, h, knobDrag(state, 'fx.pcf.wave'));

    // Wave ◂▸, mode, target
    const nudge = (bx, dir, delta) => {
      const key = `pcf.wave.${dir}`;
      const off = button(ctx, bx, 74, 14, 13, { pressed: hits.isPressed(key) });
      icon(ctx, dir, bx + 7, 80.5 + off, 6, C.inkLight);
      hits.rect(ctx, bx, 74, 14, 13, click(() => state.setChoice('fx.pcf.wave', (wave + delta + PCF_WAVE_COUNT) % PCF_WAVE_COUNT, PCF_WAVE_COUNT), key));
    };
    nudge(x, 'left', -1);
    nudge(x + 18, 'right', 1);
    const lp = state.on01('fx.pcf.mode');
    const off = button(ctx, x + 40, 74, 34, 13, { pressed: hits.isPressed('pcf.mode') });
    text(ctx, lp ? 'LOWPASS' : 'BANDPASS', x + 57, 80.5 + off, { size: 5, weight: 800, color: C.inkLight });
    hits.rect(ctx, x + 40, 74, 34, 13, click(() => state.toggle('fx.pcf.mode'), 'pcf.mode'));
    this.drawChoice(ctx, 146 * this.k, 72, m.w - 14 - 146 * this.k, 'fx.pcf.target', PCF_TARGETS, null);
  }
}

function moduleRects([bass1, bass2, drum1, drum2], gap) {
  const split = (b) => {
    const top = Math.floor((b.h - gap) / 2);
    return [
      { y: b.y, h: top },
      { y: b.y + top + gap, h: b.h - top - gap },
    ];
  };
  const [delay, dist] = split(drum1);
  return { master: bass1, pcf: bass2, delay, dist, comp: drum2 };
}
