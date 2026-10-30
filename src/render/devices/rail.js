// The focus stages' instrument rail: one strip per machine, top to bottom, so
// you see what's sounding and pick what's shown big. Each strip: a small ON
// button, meters beside the machine's name, its volume fader, and the playing
// pattern (click: that machine's pattern picker). A click anywhere else on the
// strip shows the machine: the ON button is kept small and boxed so a click
// meant to pick an instrument doesn't switch it off. Option/Alt-click on the
// strip or its ON button solos the machine: the others switch off (channels.js).
import { hits } from '../../ui/hits.js';
import { click, faderDrag } from '../../ui/handlers.js';
import { audibleChannel, toggleSolo } from '../../channels.js';
import { automatedMark, midiBadge } from '../controls.js';
import { button, lcd, led, panel, rgba, rrect, sevenSeg, sevenSegWidth, text, vgrad } from '../primitives.js';
import { C } from '../theme.js';

export const RAIL_W = 44;
export const RAIL_STRIPS = [
  ['bass1', 'BASS 1'],
  ['bass2', 'BASS 2'],
  ['r808', 'DRUM 08'],
  ['r909', 'DRUM 09'],
];
const GAP = 4;
const LED_H = 14;
const ON_W = 18; // the ON button
const ON_H = 11;
const LCD_H = 14;
const BANKS = 'ABCD';
const VOL_X = 28; // level fader bar, right of the meters
const VOL_W = 11;
const LIVE = [C.ledGreen, C.ledGreen, C.ledYellow, C.ledRed];
const GHOST = [rgba(C.inkMuted, 0.35), rgba(C.inkMuted, 0.35), rgba(C.inkMuted, 0.5), rgba(C.inkLight, 0.5)];

export class Rail {
  constructor(state, app, x, y, w, h) {
    Object.assign(this, { state, app, x, y, w, h });
  }

  draw(ctx) {
    const sh = (this.h - GAP * (RAIL_STRIPS.length - 1)) / RAIL_STRIPS.length;
    RAIL_STRIPS.forEach(([id, name], i) => {
      ctx.save();
      ctx.translate(0, i * (sh + GAP));
      this.drawStrip(ctx, id, name, sh);
      ctx.restore();
    });
  }

  drawStrip(ctx, id, name, h) {
    const { state, w } = this;
    const shown = state.ui.show === id;
    const on = state.on01(`${id}.on`);
    panel(ctx, 0, 0, w, h, C.transport);
    if (shown) {
      rrect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 2);
      ctx.strokeStyle = C.ledYellow;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // The whole strip shows the machine; the controls below register later and win.
    const show = (ev) => (ev.alt ? toggleSolo(state, id) : (state.ui.show = id));
    hits.rect(ctx, 0, 0, w, h, click(show, `rail.${id}`));

    // ON: the machine's own switch, as on its panel.
    const key = `rail.${id}.on`;
    const bx = (w - ON_W) / 2;
    const off = button(ctx, bx, 3, ON_W, ON_H, { face: C.btnQuiet, highlight: 0.12, pressed: hits.isPressed(key) });
    led(ctx, w / 2, 3 + ON_H / 2 + off, 2.1, on, C.ledGreen);
    hits.rect(ctx, bx, 3, ON_W, ON_H, click((ev) => (ev.alt ? toggleSolo(state, id) : state.toggle(`${id}.on`)), key));

    // Name (vertical) and level.
    const top = LED_H + 3;
    const bottom = h - LCD_H - 5;
    const mh = bottom - top;
    ctx.save();
    ctx.translate(8.5, top + mh / 2);
    ctx.rotate(-Math.PI / 2);
    text(ctx, name, 0, 0.5, { size: Math.min(6.5, mh / 5), weight: 800, color: shown ? C.ledYellow : on ? C.inkLight : C.inkMuted, spacing: 0.4 });
    ctx.restore();
    // Not heard (off or muted): the level it would
    // have, ghosted, so you still see it playing along.
    const heard = audibleChannel(state, id);
    const [l, r] = (heard ? state.meters[id] : state.meters.ghost?.[id]) ?? [0, 0];
    const colors = heard ? LIVE : GHOST;
    this.drawLevel(ctx, 14.5, top, 4, mh, l, colors);
    this.drawLevel(ctx, 20, top, 4, mh, r, colors);
    this.drawVolume(ctx, `mixer.${id}.level`, top, mh);

    // Pattern playing (or queued, blinking).
    const dev = state.device(id);
    const blink = state.transport.step % 4 < 2;
    const index = dev.queued !== null && blink ? dev.queued : dev.bank * 8 + dev.pattern;
    const label = `${BANKS[Math.floor(index / 8)]}${(index % 8) + 1}`;
    const ly = h - LCD_H - 3;
    lcd(ctx, 5, ly, w - 10, LCD_H);
    sevenSeg(ctx, label, 5 + (w - 10 - sevenSegWidth(label, 6)) / 2, ly + 2.5, 6, LCD_H - 5);
    if (shown && state.ui.picker) {
      rrect(ctx, 4, ly - 1, w - 8, LCD_H + 2, 2.5);
      ctx.strokeStyle = C.ledYellow;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Again on the open machine's readout closes the picker.
    const pick = () => {
      state.ui.picker = !(state.ui.picker && shown);
      state.ui.show = id;
    };
    hits.rect(ctx, 0, ly - 2, w, LCD_H + 5, click(pick, `rail.${id}.pattern`));
  }

  // The channel's level fader, as a bar: drag it, scroll it, double-click to
  // reset; MIDI learn picks it like any fader (a MiniLab slider by default).
  drawVolume(ctx, param, top, h) {
    const { state } = this;
    const v = state.get(param);
    const learn = state.ui.midiLearn;
    rrect(ctx, VOL_X, top, VOL_W, h, 2);
    ctx.fillStyle = '#060607';
    ctx.fill();
    if (learn) {
      const color = learn.param === param ? C.ledYellow : learn.mapped.has(param) ? C.ledGreen : null;
      if (color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
    const fh = (h - 4) * v;
    ctx.fillStyle = rgba(C.mixer, 0.35);
    ctx.fillRect(VOL_X + 2, top + h - 2 - fh, VOL_W - 4, fh);
    // The cap: where the fader sits.
    ctx.fillStyle = C.inkLight;
    ctx.fillRect(VOL_X + 1, top + h - 2 - fh - 1.25, VOL_W - 2, 2.5);
    hits.rect(ctx, VOL_X - 2, top, VOL_W + 4, h, faderDrag(state, param, h - 4));
    state.ui.drawnParams?.add(param);
    const hw = state.ui.midiLabels?.get(param);
    if (hw) midiBadge(ctx, VOL_X + VOL_W / 2, top - 5, hw);
    if (state.ui.automated?.has(param)) automatedMark(ctx, VOL_X + VOL_W / 2, top + h + 3);
  }

  // One meter channel: a continuous bar, green to yellow to red (or ghosted).
  drawLevel(ctx, x, y, w, h, level, colors) {
    rrect(ctx, x, y, w, h, 1.5);
    ctx.fillStyle = '#060607';
    ctx.fill();
    const lh = Math.min(1, level) * h;
    if (lh <= 0) return;
    ctx.save();
    rrect(ctx, x, y, w, h, 1.5);
    ctx.clip();
    ctx.fillStyle = vgrad(ctx, y + h, y, colors);
    ctx.fillRect(x, y + h - lh, w, lh);
    ctx.fillStyle = rgba('#ffffff', colors === GHOST ? 0.06 : 0.18);
    ctx.fillRect(x, y + h - lh, w * 0.35, lh);
    ctx.restore();
  }
}
