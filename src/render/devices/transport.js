import { Knob } from '../controls.js';
import { brushed, button, FONT, icon, lcd, led, panel, screws, sevenSeg, sevenSegWidth, text, vgrad } from '../primitives.js';
import { C, KNOB } from '../theme.js';

const LABEL = { size: 6, color: C.inkMuted, spacing: 1 };
const BUTTONS = [
  ['rew', 'REW'],
  ['ff', 'FF'],
  ['stop', 'STOP'],
  ['play', 'PLAY'],
];

export class Transport {
  constructor(state, x, y, w, h) {
    Object.assign(this, { state, x, y, w, h });
    state.define('master.volume', 0.8);
    this.master = new Knob({ x: w - 30, y: 37, r: 14, param: 'master.volume', label: 'MASTER', style: KNOB.fx });
  }

  draw(ctx) {
    const { w, h, state } = this;
    const t = state.transport;

    panel(ctx, 0, 0, w, h, C.transport);
    brushed(ctx, 0, 0, w, h, 0.35);
    screws(ctx, w, h, 7, 8);
    this.drawLogo(ctx, 20, 38);

    // Tempo readout + nudge buttons
    text(ctx, 'TEMPO', 292, 12, LABEL);
    lcd(ctx, 240, 19, 104, 40);
    const tempo = t.tempo.toFixed(1).padStart(5, ' ');
    sevenSeg(ctx, tempo, 240 + (104 - sevenSegWidth(tempo, 15)) / 2, 26, 15, 26);
    button(ctx, 349, 19, 16, 19);
    icon(ctx, 'up', 357, 28.5, 6, C.inkLight);
    button(ctx, 349, 40, 16, 19);
    icon(ctx, 'down', 357, 49.5, 6, C.inkLight);

    // Song position (bar.step)
    text(ctx, t.mode === 'song' ? 'SONG POSITION' : 'PATTERN POSITION', 430, 12, LABEL);
    lcd(ctx, 380, 19, 100, 40);
    const pos = `${String(t.bar).padStart(3, '0')}.${String(Math.max(0, t.step) + 1).padStart(2, '0')}`;
    sevenSeg(ctx, pos, 380 + (100 - sevenSegWidth(pos, 12)) / 2, 28, 12, 22);

    // Transport buttons
    BUTTONS.forEach(([kind, label], i) => {
      const bx = 498 + i * 40;
      const active = kind === 'play' ? t.playing : kind === 'stop' ? !t.playing : false;
      const off = button(ctx, bx, 24, 34, 26, { face: active ? C.btnPressed : C.btnDark, pressed: active });
      icon(ctx, kind, bx + 17, 37 + off, 11, kind === 'play' && t.playing ? C.ledGreen : C.inkLight);
      text(ctx, label, bx + 17, 61, LABEL);
      if (kind === 'play' || kind === 'stop') led(ctx, bx + 17, 15, 2.4, active, kind === 'play' ? C.ledGreen : C.ledRed);
    });

    // Play mode
    text(ctx, 'MODE', 691, 12, LABEL);
    led(ctx, 671, 26, 2.4, t.mode === 'pattern', C.ledYellow);
    text(ctx, 'PATTERN', 677, 26.5, { ...LABEL, align: 'left', spacing: 0.3, color: C.inkLight });
    led(ctx, 671, 38, 2.4, t.mode === 'song', C.ledYellow);
    text(ctx, 'SONG', 677, 38.5, { ...LABEL, align: 'left', spacing: 0.3, color: C.inkLight });
    button(ctx, 666, 48, 50, 13);
    text(ctx, 'SELECT', 691, 55, { ...LABEL, size: 5.5 });

    this.master.draw(ctx, state);
  }

  drawLogo(ctx, x, y) {
    ctx.save();
    ctx.font = `italic 900 27px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText('RE-REBIRTH', x + 1, y + 1.5);
    ctx.fillStyle = vgrad(ctx, y - 21, y + 2, C.logo);
    ctx.fillText('RE-REBIRTH', x, y);
    ctx.restore();

    C.r808Steps.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(x + 2 + i * 12, y + 9, 9, 3.5);
    });
    text(ctx, 'SYNTH & RHYTHM RACK', x + 54, y + 11, { size: 6.5, align: 'left', color: C.inkMuted, spacing: 1.6 });
  }
}
