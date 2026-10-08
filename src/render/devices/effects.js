import { Knob } from '../controls.js';
import { fader, lcd, led, ledBar, line, MONO, panel, rrect, sevenSeg, text, vgrad } from '../primitives.js';
import { C, KNOB } from '../theme.js';

const MODULES = [
  { key: 'mixer', w: 300, title: 'MIXER', accent: C.mixer },
  { key: 'delay', w: 118, title: 'DELAY', accent: C.delay },
  { key: 'dist', w: 106, title: 'DISTORTION', accent: C.dist, toggle: 'fx.dist.on' },
  { key: 'comp', w: 106, title: 'COMPRESSOR', accent: C.comp, toggle: 'fx.comp.on' },
  { key: 'pcf', w: 142, title: 'PATTERN FILTER', accent: C.pcf, toggle: 'fx.pcf.on' },
];

export const CHANNELS = [
  ['bass1', 'BASS 1'],
  ['bass2', 'BASS 2'],
  ['r808', 'DRUM 08'],
  ['r909', 'DRUM 09'],
];

const CH_W = 58;
const METER_LEDS = 9;
const styleFor = (accent) => ({ ...KNOB.fx, pointers: [[accent, 0.22, 0.95, 0.15]] });

export class EffectsRow {
  constructor(state, x, y, w, h) {
    Object.assign(this, { state, x, y, w, h });
    this.knobs = [];
    this.modules = {};
    let mx = 0;
    for (const m of MODULES) {
      this.modules[m.key] = { ...m, x: mx };
      if (m.toggle) state.define(m.toggle, 1);
      mx += m.w;
    }

    const add = (x, y, r, param, label, def, extra = {}) => {
      state.define(param, def);
      this.knobs.push(new Knob({ x, y, r, param, label, ...extra }));
    };

    const mix = this.modules.mixer;
    const mixStyle = styleFor(C.mixer);
    CHANNELS.forEach(([id], i) => {
      const x0 = mix.x + 6 + i * CH_W;
      add(x0 + 15, 41, 8, `mixer.${id}.pan`, 'PAN', 0.5, { style: mixStyle, ticks: 7, labelSize: 5.5 });
      add(x0 + 41, 41, 8, `mixer.${id}.delay`, 'DELAY', i === 0 ? 0.4 : 0.1, { style: styleFor(C.delay), ticks: 7, labelSize: 5.5 });
      state.define(`mixer.${id}.level`, 0.72);
    });
    state.define('mixer.master.level', 0.8);

    const d = this.modules.delay;
    add(d.x + 86, 37, 12, 'fx.delay.steps', 'STEPS', 2 / 7, { style: styleFor(C.delay), ticks: 8 });
    add(d.x + 30, 87, 12, 'fx.delay.feedback', 'FEEDBACK', 0.45, { style: styleFor(C.delay) });
    add(d.x + 88, 87, 12, 'fx.delay.pan', 'WIDTH', 0.5, { style: styleFor(C.delay) });

    const ds = this.modules.dist;
    add(ds.x + 30, 50, 13, 'fx.dist.amount', 'AMOUNT', 0.4, { style: styleFor(C.dist) });
    add(ds.x + 76, 50, 13, 'fx.dist.shape', 'SHAPE', 0.55, { style: styleFor(C.dist) });

    const cp = this.modules.comp;
    add(cp.x + 30, 50, 13, 'fx.comp.amount', 'AMOUNT', 0.3, { style: styleFor(C.comp) });
    add(cp.x + 76, 50, 13, 'fx.comp.speed', 'SPEED', 0.5, { style: styleFor(C.comp) });

    const pf = this.modules.pcf;
    add(pf.x + 24, 83, 10, 'fx.pcf.mode', 'MODE', 0, { style: styleFor(C.pcf), ticks: 4 });
    add(pf.x + 71, 83, 10, 'fx.pcf.level', 'LEVEL', 0.7, { style: styleFor(C.pcf) });
    add(pf.x + 118, 83, 10, 'fx.pcf.decay', 'DECAY', 0.4, { style: styleFor(C.pcf) });
  }

  draw(ctx) {
    const { state, h } = this;
    for (const m of Object.values(this.modules)) this.drawModuleFrame(ctx, m, h);
    this.drawMixer(ctx, this.modules.mixer);
    this.drawDelay(ctx, this.modules.delay);
    this.drawTarget(ctx, this.modules.dist, state.fx.distTarget);
    this.drawTarget(ctx, this.modules.comp, state.fx.compTarget);
    this.drawPcf(ctx, this.modules.pcf);
    for (const k of this.knobs) k.draw(ctx, state);
  }

  drawModuleFrame(ctx, m, h) {
    panel(ctx, m.x + 0.5, 0, m.w - 1, h, C.fx);
    ctx.fillStyle = vgrad(ctx, 1, 15, C.fxTitle);
    ctx.fillRect(m.x + 1.5, 1.5, m.w - 3, 13.5);
    rrect(ctx, m.x + 6, 4.5, 3, 7, 1);
    ctx.fillStyle = m.accent;
    ctx.fill();
    text(ctx, m.title, m.x + 13, 8.5, { size: 7, weight: 800, align: 'left', spacing: 1 });
    if (m.toggle) {
      const on = this.state.get(m.toggle) >= 0.5;
      led(ctx, m.x + m.w - 22, 8, 2.3, on, m.accent);
      text(ctx, 'ON', m.x + m.w - 16, 8.5, { size: 5.5, align: 'left', color: C.inkMuted });
    }
  }

  drawMixer(ctx, m) {
    const { state } = this;
    const strip = (x0, label, levelParam, meters) => {
      text(ctx, label, x0 + 28, 23, { size: 6.5, weight: 800 });
      fader(ctx, x0 + 8, 62, 18, 50, state.get(levelParam));
      meters.forEach((mx) => this.drawMeter(ctx, mx, 64, 0));
    };

    CHANNELS.forEach(([id, label], i) => {
      const x0 = m.x + 6 + i * CH_W;
      strip(x0, label, `mixer.${id}.level`, [x0 + 36]);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      line(ctx, x0 + CH_W - 1.5, 19, x0 + CH_W - 1.5, 114);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      line(ctx, x0 + CH_W - 0.5, 19, x0 + CH_W - 0.5, 114);
    });

    const x0 = m.x + 6 + CHANNELS.length * CH_W;
    strip(x0, 'MASTER', 'mixer.master.level', [x0 + 33, x0 + 42]);
    text(ctx, 'L', x0 + 36, 41, { size: 5.5, color: C.inkMuted });
    text(ctx, 'R', x0 + 45, 41, { size: 5.5, color: C.inkMuted });
  }

  drawMeter(ctx, x, y, level) {
    const lit = Math.round(level * METER_LEDS);
    for (let i = 0; i < METER_LEDS; i++) {
      const color = i >= METER_LEDS - 1 ? C.ledRed : i >= METER_LEDS - 3 ? C.ledYellow : C.ledGreen;
      ledBar(ctx, x, y + (METER_LEDS - 1 - i) * 5.4, 6, 3.8, i < lit, color);
    }
  }

  drawDelay(ctx, m) {
    const steps = 1 + Math.round(this.state.get('fx.delay.steps') * 7);
    lcd(ctx, m.x + 12, 22, 40, 30);
    sevenSeg(ctx, String(steps), m.x + 26, 27, 11, 20);
    text(ctx, '1/16 STEPS', m.x + 32, 60, { size: 5.5, color: C.inkMuted });
  }

  drawTarget(ctx, m, target) {
    lcd(ctx, m.x + 9, 86, m.w - 18, 15, C.lcdGreen);
    text(ctx, `\u25B8 ${target}`, m.x + m.w / 2, 94, { size: 7, weight: 700, family: MONO, color: C.lcdGreenOn });
    text(ctx, 'TARGET', m.x + m.w / 2, 110, { size: 5.5, color: C.inkMuted, spacing: 0.8 });
  }

  drawPcf(ctx, m) {
    const x = m.x + 9;
    const w = m.w - 18;
    const y = 20;
    const h = 40;
    lcd(ctx, x, y, w, h, C.lcdGreen);
    text(ctx, `\u25B8 ${this.state.fx.pcfTarget}`, x + 4, y + 6.5, { size: 5.5, family: MONO, align: 'left', color: C.lcdGreenOn });
    const bw = (w - 8) / 16;
    const top = y + 13;
    const maxH = h - 17;
    this.state.fx.pcf.forEach((v, i) => {
      const bx = x + 4 + i * bw;
      ctx.fillStyle = C.lcdGreenDim;
      ctx.fillRect(bx + 0.8, top, bw - 1.6, maxH);
      ctx.fillStyle = C.lcdGreenOn;
      const bh = Math.max(1, v * maxH);
      ctx.fillRect(bx + 0.8, top + maxH - bh, bw - 1.6, bh);
    });
  }
}
