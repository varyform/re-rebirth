import { DELAY_STEPS } from '../../audio/engine.js';
import { PCF_WAVE_COUNT, PCF_WAVES } from '../../audio/pcf-waves.js';
import { CHANNELS, COMP_TARGETS, PCF_TARGETS } from '../../channels.js';
import { hits } from '../../ui/hits.js';
import { click, faderDrag, knobDrag, toggle } from '../../ui/handlers.js';
import { Knob } from '../controls.js';
import { button, fader, icon, lcd, led, ledBar, line, MONO, panel, rrect, sevenSeg, sevenSegWidth, shade, text, vgrad } from '../primitives.js';
import { C, KNOB } from '../theme.js';

const MODULES = [
  { key: 'mixer', title: 'MIXER', accent: C.mixer },
  { key: 'delay', title: 'DELAY', accent: C.delay, toggle: 'fx.delay.on' },
  { key: 'dist', title: 'DISTORTION', accent: C.dist, toggle: 'fx.dist.on' },
  { key: 'comp', title: 'COMPRESSOR', accent: C.comp, toggle: 'fx.comp.on' },
  { key: 'pcf', title: 'PATTERN FILTER', accent: C.pcf, toggle: 'fx.pcf.on' },
];

const CH_W = 58;
const FADER_Y = 150;
const FADER_CAP = 11;
const CH_BUTTONS = [
  ['M', 'mute', C.ledOrange],
  ['S', 'solo', C.ledGreen],
  ['D', 'dist', C.dist],
];
const styleFor = (accent) => ({ ...KNOB.fx, pointers: [[accent, 0.22, 0.95, 0.15]] });

// Right-hand column. Module rows line up with the instrument rows beside it
// (`bands`): the mixer spans both bass lines, each drum row holds two effects.
export class EffectsColumn {
  constructor(state, x, y, w, h, bands, gap) {
    Object.assign(this, { state, x, y, w, h });
    const rects = moduleRects(bands, gap);
    this.modules = MODULES.map((m) => ({ ...m, ...rects[m.key], w, knobs: [] }));
    this.mod = Object.fromEntries(this.modules.map((m) => [m.key, m]));
    for (const m of this.modules) if (m.toggle) state.define(m.toggle, 1);
    this.layoutMixer(this.mod.mixer);
    this.layoutEffects();
  }

  addKnob(m, x, y, r, param, label, def, extra = {}) {
    this.state.define(param, def);
    m.knobs.push(new Knob({ x, y, r, param, label, style: styleFor(m.accent), ...extra }));
  }

  layoutMixer(m) {
    const small = { ticks: 7, labelSize: 5.5 };
    CHANNELS.forEach(([id], i) => {
      const cx = 6 + i * CH_W + CH_W / 2;
      this.addKnob(m, cx, 52, 10, `mixer.${id}.pan`, 'PAN', 0.5, small);
      this.addKnob(m, cx, 94, 10, `mixer.${id}.delay`, 'DELAY', i === 0 ? 0.4 : 0.1, { ...small, style: styleFor(C.delay) });
      for (const [, k] of CH_BUTTONS) this.state.define(`mixer.${id}.${k}`, k === 'dist' && i === 0 ? 1 : 0);
      this.state.define(`mixer.${id}.level`, 0.72);
    });
    const cx = 6 + CHANNELS.length * CH_W + CH_W / 2;
    this.addKnob(m, cx, 52, 10, 'mixer.delayReturn', 'DLY RTN', 0.6, { ...small, style: styleFor(C.delay) });
    this.state.define('mixer.master.level', 0.8);
  }

  layoutEffects() {
    const { delay, dist, comp, pcf } = this.mod;
    const { state } = this;
    this.addKnob(delay, 116, 50, 14, 'fx.delay.steps', 'STEPS', 2 / (DELAY_STEPS - 1), { ticks: 9 });
    this.addKnob(delay, 180, 50, 14, 'fx.delay.feedback', 'FEEDBACK', 0.45);
    this.addKnob(delay, 244, 50, 14, 'fx.delay.pan', 'PAN', 0.5);
    state.define('fx.delay.triplet', 0);

    this.addKnob(dist, 44, 50, 14, 'fx.dist.amount', 'AMOUNT', 0.4);
    this.addKnob(dist, 110, 50, 14, 'fx.dist.shape', 'SHAPE', 0.55);

    this.addKnob(comp, 44, 50, 14, 'fx.comp.amount', 'AMOUNT', 0.3);
    this.addKnob(comp, 110, 50, 14, 'fx.comp.threshold', 'THRESHOLD', 0.5);
    state.define('fx.comp.target', 0);

    this.addKnob(pcf, 156, 38, 10, 'fx.pcf.freq', 'FREQ', 0.45, { labelSize: 5.5 });
    this.addKnob(pcf, 194, 38, 10, 'fx.pcf.reso', 'RESO', 0.5, { labelSize: 5.5 });
    this.addKnob(pcf, 232, 38, 10, 'fx.pcf.amount', 'AMOUNT', 0.6, { labelSize: 5.5 });
    this.addKnob(pcf, 270, 38, 10, 'fx.pcf.decay', 'DECAY', 0.4, { labelSize: 5.5 });
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
      if (m.key === 'mixer') this.drawMixer(ctx, m);
      if (m.key === 'delay') this.drawDelay(ctx);
      if (m.key === 'dist') this.drawDist(ctx, m);
      if (m.key === 'comp') this.drawChoice(ctx, 160, 36, m.w - 174, 'fx.comp.target', COMP_TARGETS, 'TARGET');
      if (m.key === 'pcf') this.drawPcf(ctx, m);
      for (const k of m.knobs) k.draw(ctx, state);
      ctx.restore();
    }
  }

  drawFrame(ctx, m) {
    panel(ctx, 0, 0, m.w, m.h, C.fx);
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

  drawMixer(ctx, m) {
    const { state } = this;
    const faderH = m.h - 14 - FADER_Y;
    const strip = (x0, label, levelParam) => {
      text(ctx, label, x0 + CH_W / 2, 27, { size: 6.5, weight: 800 });
      fader(ctx, x0 + 8, FADER_Y, 18, faderH, state.get(levelParam));
      hits.rect(ctx, x0 + 8, FADER_Y, 18, faderH, faderDrag(state, levelParam, faderH - FADER_CAP));
    };

    CHANNELS.forEach(([id, label], i) => {
      const x0 = 6 + i * CH_W;
      strip(x0, label, `mixer.${id}.level`);
      this.drawMeter(ctx, x0 + 36, FADER_Y + 2, faderH - 4, state.meters[id] ?? 0);
      CH_BUTTONS.forEach(([name, k, color], b) => this.drawToggle(ctx, x0 + 4 + b * 17, name, `mixer.${id}.${k}`, color));
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      line(ctx, x0 + CH_W - 1.5, 20, x0 + CH_W - 1.5, m.h - 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      line(ctx, x0 + CH_W - 0.5, 20, x0 + CH_W - 0.5, m.h - 6);
    });

    const x0 = 6 + CHANNELS.length * CH_W;
    strip(x0, 'MASTER', 'mixer.master.level');
    const level = state.meters.master ?? 0;
    this.drawMeter(ctx, x0 + 33, FADER_Y + 2, faderH - 4, level, 5);
    this.drawMeter(ctx, x0 + 42, FADER_Y + 2, faderH - 4, level, 5);
    text(ctx, 'L', x0 + 35.5, FADER_Y - 7, { size: 5.5, color: C.inkMuted });
    text(ctx, 'R', x0 + 44.5, FADER_Y - 7, { size: 5.5, color: C.inkMuted });
  }

  drawToggle(ctx, x, label, param, color) {
    const on = this.state.on01(param);
    const face = on ? [shade(color, 0.3), color] : C.btnDark;
    const off = button(ctx, x, 124, 15, 13, { face, pressed: on });
    text(ctx, label, x + 7.5, 131 + off, { size: 7, weight: 800, color: on ? C.bassInk : C.inkLight });
    hits.rect(ctx, x, 124, 15, 13, toggle(this.state, param));
  }

  drawMeter(ctx, x, y, h, level, w = 6) {
    const count = Math.floor(h / 8);
    const pitch = h / count;
    const lit = Math.round(level * count);
    for (let i = 0; i < count; i++) {
      const color = i >= count - 1 ? C.ledRed : i >= count - 4 ? C.ledYellow : C.ledGreen;
      ledBar(ctx, x, y + (count - 1 - i) * pitch, w, pitch - 2.5, i < lit, color);
    }
  }

  drawDelay(ctx) {
    const { state } = this;
    const steps = String(state.choice('fx.delay.steps', DELAY_STEPS) + 1);
    lcd(ctx, 14, 24, 52, 36);
    sevenSeg(ctx, steps, 14 + (52 - sevenSegWidth(steps, 12)) / 2, 30, 12, 24);
    hits.rect(ctx, 14, 24, 52, 36, knobDrag(state, 'fx.delay.steps'));
    const triplet = state.on01('fx.delay.triplet');
    const off = button(ctx, 14, 70, 52, 14, { pressed: triplet, face: triplet ? [shade(C.delay, 0.3), C.delay] : C.btnDark });
    text(ctx, triplet ? '1/16 TRIPLET' : '1/16 STEPS', 40, 77.5 + off, { size: 5.5, weight: 800, color: triplet ? C.bassInk : C.inkLight });
    hits.rect(ctx, 14, 70, 52, 14, toggle(state, 'fx.delay.triplet'));
  }

  // Distortion is switched per channel (D buttons in the mixer); show which.
  drawDist(ctx, m) {
    const x = 160;
    const w = m.w - x - 14;
    lcd(ctx, x, 36, w, 18, C.lcdGreen);
    const on = CHANNELS.filter(([id]) => this.state.on01(`mixer.${id}.dist`)).map(([, label]) => label.replace(/\D+/g, (s) => s[0]));
    text(ctx, on.length ? on.join(' ') : 'NONE', x + w / 2, 45.5, { size: 7, family: MONO, color: C.lcdGreenOn });
    text(ctx, 'MIXER D SWITCHES', x + w / 2, 66, { size: 5.5, color: C.inkMuted, spacing: 0.6 });
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
    const w = 120;
    const h = 46;
    const wave = state.choice('fx.pcf.wave', PCF_WAVE_COUNT);
    lcd(ctx, x, y, w, h, C.lcdGreen);
    text(ctx, `WAVE ${String(wave + 1).padStart(2, '0')}`, x + 5, y + 7, { size: 5.5, family: MONO, align: 'left', color: C.lcdGreenOn });
    const bw = (w - 10) / 16;
    const top = y + 14;
    const maxH = h - 18;
    PCF_WAVES[wave].forEach((v, i) => {
      const bx = x + 5 + i * bw;
      ctx.fillStyle = C.lcdGreenDim;
      ctx.fillRect(bx + 0.8, top, bw - 1.6, maxH);
      ctx.fillStyle = C.lcdGreenOn;
      const bh = Math.max(1, v * maxH);
      ctx.fillRect(bx + 0.8, top + maxH - bh, bw - 1.6, bh);
    });
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
    this.drawChoice(ctx, 146, 72, m.w - 160, 'fx.pcf.target', PCF_TARGETS, null);
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
  const [comp, pcf] = split(drum2);
  return { mixer: { y: bass1.y, h: bass2.y + bass2.h - bass1.y }, delay, dist, comp, pcf };
}
