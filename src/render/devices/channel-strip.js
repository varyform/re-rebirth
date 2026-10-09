// Channel strip beside each instrument, like ReBirth's per-device mix section:
// on switch, pan, delay send, level fader with a left/right meter, and the
// distortion / pattern filter / compressor routing buttons.
import { COMP_TARGETS, PCF_TARGETS } from '../../channels.js';
import { hits } from '../../ui/hits.js';
import { click, faderDrag } from '../../ui/handlers.js';
import { Knob } from '../controls.js';
import { button, fader, led, ledBar, panel, shade, text, vgrad } from '../primitives.js';
import { C, KNOB } from '../theme.js';

export const STRIP_W = 98;
const FADER_CAP = 11;
const FADER_Y = 66;
const BUTTON_X = 52;
const BUTTON_W = 40;

export const styleFor = (accent) => ({ ...KNOB.fx, pointers: [[accent, 0.22, 0.95, 0.15]] });

// There is one compressor: on the master (target 0), on one channel (index + 1),
// or unrouted. Every COMP button (strips and master) is part of one radio group:
// lit = the compressor is here; clicking moves it here, or off if already here.
export const compHere = (state, target) =>
  state.on01('fx.comp.routed') && state.choice('fx.comp.target', COMP_TARGETS.length) === target;

export function toggleComp(state, target) {
  if (compHere(state, target)) return state.set('fx.comp.routed', 0);
  state.set('fx.comp.routed', 1);
  state.setChoice('fx.comp.target', target, COMP_TARGETS.length);
}

export function drawButton(ctx, x, y, w, label, on, color, onClick) {
  const face = on ? [shade(color, 0.3), color] : C.btnDark;
  const off = button(ctx, x, y, w, 13, { face, pressed: on });
  text(ctx, label, x + w / 2, y + 7 + off, { size: 6.5, weight: 800, color: on ? C.bassInk : C.inkLight, spacing: 0.5 });
  hits.rect(ctx, x, y, w, 13, click(onClick));
}

export function drawMeter(ctx, x, y, h, level, w = 6) {
  const count = Math.floor(h / 8);
  const pitch = h / count;
  const lit = Math.round(level * count);
  for (let i = 0; i < count; i++) {
    const color = i >= count - 1 ? C.ledRed : i >= count - 4 ? C.ledYellow : C.ledGreen;
    ledBar(ctx, x, y + (count - 1 - i) * pitch, w, pitch - 2.5, i < lit, color);
  }
}

// Fader plus a left/right meter pair, labelled L / R above the meters.
export function drawFaderWithMeters(ctx, state, x, y, h, param, levels) {
  fader(ctx, x, y, 16, h, state.get(param));
  hits.rect(ctx, x, y, 16, h, faderDrag(state, param, h - FADER_CAP));
  const [l, r] = levels ?? [0, 0];
  drawMeter(ctx, x + 21, y + 2, h - 4, l, 5);
  drawMeter(ctx, x + 28, y + 2, h - 4, r, 5);
  text(ctx, 'L', x + 23.5, y - 5, { size: 5, color: C.inkMuted });
  text(ctx, 'R', x + 30.5, y - 5, { size: 5, color: C.inkMuted });
}

export class ChannelStrip {
  // index: position in CHANNELS (routing targets are index + 1).
  constructor(state, x, y, w, h, { id, label, index }) {
    Object.assign(this, { state, x, y, w, h, id, label, index });
    const small = { ticks: 7, labelSize: 5.5, r: 10 };
    const param = (k) => `mixer.${id}.${k}`;
    state.define(param('pan'), 0.5);
    state.define(param('delay'), index === 0 ? 0.4 : 0.1);
    state.define(param('level'), 0.72);
    for (const k of ['mute', 'solo']) state.define(param(k), 0);
    state.define(param('dist'), index === 0 ? 1 : 0);
    this.knobs = [
      new Knob({ x: 26, y: 37, param: param('pan'), label: 'PAN', style: styleFor(C.mixer), ...small }),
      new Knob({ x: 72, y: 37, param: param('delay'), label: 'DELAY', style: styleFor(C.delay), ...small }),
    ];
  }

  draw(ctx) {
    const { w, h, state, id } = this;
    panel(ctx, 0, 0, w, h, C.fx);
    this.drawTitle(ctx);
    for (const k of this.knobs) k.draw(ctx, state);
    drawFaderWithMeters(ctx, state, 10, FADER_Y, h - 10 - FADER_Y, `mixer.${id}.level`, state.meters[id]);
    this.drawButtons(ctx);
  }

  // The on switch (the mixer's mute, inverted) next to the channel name.
  drawTitle(ctx) {
    const { w, state, id } = this;
    const mute = `mixer.${id}.mute`;
    const on = !state.on01(mute);
    ctx.fillStyle = vgrad(ctx, 1, 15, C.fxTitle);
    ctx.fillRect(1, 1, w - 2, 14);
    led(ctx, 10, 8, 2.4, on, C.ledGreen);
    text(ctx, this.label, 17, 8.5, { size: 6.5, weight: 800, align: 'left', spacing: 0.8, color: on ? C.inkLight : C.inkMuted });
    hits.rect(ctx, 2, 1, w - 4, 14, click(() => state.toggle(mute)));
  }

  // DIST is per channel, while PCF and COMP place the single pattern filter /
  // compressor on one channel (radio buttons; the master module has its own COMP).
  drawButtons(ctx) {
    const { state, id, index: i } = this;
    const nPcf = PCF_TARGETS.length;
    const dist = `mixer.${id}.dist`;
    const pcfHere = state.choice('fx.pcf.target', nPcf) === i + 1;
    drawButton(ctx, BUTTON_X, FADER_Y, BUTTON_W, 'DIST', state.on01(dist), C.dist, () => state.toggle(dist));
    drawButton(ctx, BUTTON_X, FADER_Y + 18, BUTTON_W, 'PCF', pcfHere, C.pcf, () => state.setChoice('fx.pcf.target', pcfHere ? 0 : i + 1, nPcf));
    drawButton(ctx, BUTTON_X, FADER_Y + 36, BUTTON_W, 'COMP', compHere(state, i + 1), C.comp, () => toggleComp(state, i + 1));
  }
}
