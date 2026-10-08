import { CHANNELS, TARGETS } from '../../channels.js';
import { hits } from '../../ui/hits.js';
import { click, faderDrag, knobDrag, toggle } from '../../ui/handlers.js';
import { Knob } from '../controls.js';
import { button, fader, lcd, led, ledBar, line, MONO, panel, rrect, sevenSeg, sevenSegWidth, shade, text, vgrad } from '../primitives.js';
import { C, KNOB } from '../theme.js';

const MODULES = [
  { key: 'mixer', title: 'MIXER', accent: C.mixer },
  { key: 'delay', title: 'DELAY', accent: C.delay },
  { key: 'dist', title: 'DISTORTION', accent: C.dist, toggle: 'fx.dist.on' },
  { key: 'comp', title: 'COMPRESSOR', accent: C.comp, toggle: 'fx.comp.on' },
  { key: 'pcf', title: 'PATTERN FILTER', accent: C.pcf, toggle: 'fx.pcf.on' },
];

const CH_W = 58;
const FADER_Y = 150;
const FADER_CAP = 11;
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
      for (const k of ['mute', 'solo']) this.state.define(`mixer.${id}.${k}`, 0);
      this.state.define(`mixer.${id}.level`, 0.72);
    });
    const cx = 6 + CHANNELS.length * CH_W + CH_W / 2;
    this.addKnob(m, cx, 52, 10, 'mixer.delayReturn', 'DLY RTN', 0.6, { ...small, style: styleFor(C.delay) });
    this.state.define('mixer.master.level', 0.8);
  }

  layoutEffects() {
    const { delay, dist, comp, pcf } = this.mod;
    this.addKnob(delay, 108, 52, 14, 'fx.delay.steps', 'STEPS', 2 / 7, { ticks: 8 });
    this.addKnob(delay, 178, 52, 14, 'fx.delay.feedback', 'FEEDBACK', 0.45);
    this.addKnob(delay, 248, 52, 14, 'fx.delay.pan', 'WIDTH', 0.5);

    this.addKnob(dist, 44, 52, 14, 'fx.dist.amount', 'AMOUNT', 0.4);
    this.addKnob(dist, 110, 52, 14, 'fx.dist.shape', 'SHAPE', 0.55);

    this.addKnob(comp, 44, 52, 14, 'fx.comp.amount', 'AMOUNT', 0.3);
    this.addKnob(comp, 110, 52, 14, 'fx.comp.speed', 'SPEED', 0.5);

    this.addKnob(pcf, 194, 52, 12, 'fx.pcf.mode', 'MODE', 0, { ticks: 4 });
    this.addKnob(pcf, 234, 52, 12, 'fx.pcf.level', 'LEVEL', 0.7);
    this.addKnob(pcf, 274, 52, 12, 'fx.pcf.decay', 'DECAY', 0.4);
  }

  draw(ctx) {
    const { state } = this;
    for (const m of this.modules) {
      ctx.save();
      ctx.translate(0, m.y);
      this.drawFrame(ctx, m);
      if (m.key === 'mixer') this.drawMixer(ctx, m);
      if (m.key === 'delay') this.drawDelay(ctx);
      if (m.key === 'dist') this.drawTarget(ctx, m, 'distTarget');
      if (m.key === 'comp') this.drawTarget(ctx, m, 'compTarget');
      if (m.key === 'pcf') this.drawPcf(ctx);
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
      led(ctx, m.w - 22, 8, 2.3, this.state.get(m.toggle) >= 0.5, m.accent);
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
      this.drawToggle(ctx, x0 + 6, 'M', `mixer.${id}.mute`, C.ledOrange);
      this.drawToggle(ctx, x0 + 31, 'S', `mixer.${id}.solo`, C.ledGreen);
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
    const on = this.state.get(param) >= 0.5;
    const face = on ? [shade(color, 0.3), color] : C.btnDark;
    const off = button(ctx, x, 124, 21, 13, { face, pressed: on });
    text(ctx, label, x + 10.5, 131 + off, { size: 7, weight: 800, color: on ? C.bassInk : C.inkLight });
    hits.rect(ctx, x, 124, 21, 13, toggle(this.state, param));
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
    const steps = String(1 + Math.round(this.state.get('fx.delay.steps') * 7));
    lcd(ctx, 14, 26, 44, 42);
    sevenSeg(ctx, steps, 14 + (44 - sevenSegWidth(steps, 13)) / 2, 34, 13, 26);
    text(ctx, '1/16 STEPS', 36, 80, { size: 5.5, color: C.inkMuted, spacing: 0.5 });
    hits.rect(ctx, 14, 26, 44, 42, knobDrag(this.state, 'fx.delay.steps'));
  }

  // Click the readout to cycle through routing targets.
  drawTarget(ctx, m, field) {
    const { fx } = this.state;
    const x = 160;
    const w = m.w - x - 14;
    lcd(ctx, x, 36, w, 18, C.lcdGreen);
    text(ctx, `\u25B8 ${fx[field]}`, x + w / 2, 45.5, { size: 7.5, family: MONO, color: C.lcdGreenOn });
    text(ctx, 'TARGET', x + w / 2, 66, { size: 5.5, color: C.inkMuted, spacing: 0.8 });
    hits.rect(ctx, x, 36, w, 18, click(() => (fx[field] = TARGETS[(TARGETS.indexOf(fx[field]) + 1) % TARGETS.length])));
  }

  drawPcf(ctx) {
    const x = 12;
    const y = 24;
    const w = 150;
    const h = 64;
    const { fx } = this.state;
    lcd(ctx, x, y, w, h, C.lcdGreen);
    text(ctx, `\u25B8 ${fx.pcfTarget}`, x + 5, y + 7, { size: 5.5, family: MONO, align: 'left', color: C.lcdGreenOn });
    hits.rect(ctx, x, y, w, 13, click(() => (fx.pcfTarget = TARGETS[(TARGETS.indexOf(fx.pcfTarget) + 1) % TARGETS.length])));
    const bw = (w - 10) / 16;
    const top = y + 15;
    const maxH = h - 20;
    hits.rect(ctx, x + 5, top - 2, w - 10, maxH + 4, this.pcfDraw(x + 5, bw, top, maxH));
    fx.pcf.forEach((v, i) => {
      const bx = x + 5 + i * bw;
      ctx.fillStyle = C.lcdGreenDim;
      ctx.fillRect(bx + 1, top, bw - 2, maxH);
      ctx.fillStyle = C.lcdGreenOn;
      const bh = Math.max(1, v * maxH);
      ctx.fillRect(bx + 1, top + maxH - bh, bw - 2, bh);
    });
  }

  // Draw the filter curve by dragging across the bars.
  pcfDraw(x0, bw, top, maxH) {
    const { pcf } = this.state.fx;
    const paint = (ev) => {
      const i = Math.floor((ev.p.x - x0) / bw);
      if (i >= 0 && i < pcf.length) pcf[i] = Math.min(1, Math.max(0, (top + maxH - ev.p.y) / maxH));
    };
    return {
      cursor: 'crosshair',
      down(ev) {
        paint(ev);
        return { move: paint };
      },
    };
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
