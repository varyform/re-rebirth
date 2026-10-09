import { drawAbout } from './about.js';
import { drawAutomation } from './automation.js';
import { Bassline } from './devices/bassline.js';
import { DrumMachine, R808, R909 } from './devices/drum-machine.js';
import { EffectsColumn } from './devices/effects.js';
import { Transport } from './devices/transport.js';
import { hgrad, line, rrect } from './primitives.js';
import { C } from './theme.js';

const RAIL_W = 14;
const MARGIN = 4;
const TRANSPORT_H = 72;
const BASS_H = 162;
const DRUM_H = 188;
const GAP = 3;
const INSTRUMENT_W = 772;
const EFFECTS_W = 300;

// Minimum (1:1) design size. The rack can be built larger in either direction;
// devices then spread their controls into the extra room.
export const RACK_W = RAIL_W * 2 + INSTRUMENT_W + GAP + EFFECTS_W;
export const RACK_H = MARGIN * 2 + TRANSPORT_H + GAP + (BASS_H + GAP) * 2 + (DRUM_H + GAP) * 2 - GAP;
// Beyond this much stretch, extra window space becomes empty margin around the rack.
export const MAX_STRETCH = { w: 1.6, h: 1.4 };

export class Rack {
  // app: { clock, engine, files }
  constructor(state, app, width = RACK_W, height = RACK_H) {
    this.state = state;
    this.app = app;
    this.devices = [];
    this.width = Math.max(RACK_W, width);
    this.height = Math.max(RACK_H, height);

    // Extra width goes to both columns in proportion to their base widths; extra
    // height to the instrument rows in proportion to theirs (the transport keeps
    // a small share).
    const extraW = this.width - RACK_W;
    const instW = INSTRUMENT_W + (extraW * INSTRUMENT_W) / (INSTRUMENT_W + EFFECTS_W);
    const fxW = this.width - RAIL_W * 2 - GAP - instW;
    const extraH = this.height - RACK_H;
    const rows = BASS_H * 2 + DRUM_H * 2;
    const transportH = TRANSPORT_H + extraH * 0.08;
    const grow = (h) => h + ((extraH - (transportH - TRANSPORT_H)) * h) / rows;

    const x = RAIL_W;
    let y = MARGIN;
    this.devices.push(new Transport(state, app, x, y, this.width - RAIL_W * 2, transportH));
    y += transportH + GAP;

    const top = y;
    const bands = [];
    const instruments = [
      [(...r) => new Bassline(state, app, ...r, { id: 'bass1', number: 1 }), BASS_H],
      [(...r) => new Bassline(state, app, ...r, { id: 'bass2', number: 2 }), BASS_H],
      [(...r) => new DrumMachine(state, app, ...r, R808), DRUM_H],
      [(...r) => new DrumMachine(state, app, ...r, R909), DRUM_H],
    ];
    for (const [make, base] of instruments) {
      const h = grow(base);
      this.devices.push(make(x, y, instW, h));
      bands.push({ y: y - top, h });
      y += h + GAP;
    }
    const bottom = y - GAP;
    this.devices.push(new EffectsColumn(state, x + instW + GAP, top, fxW, bottom - top, bands, GAP));
  }

  draw(ctx) {
    ctx.fillStyle = C.rackBg;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawRail(ctx, 0);
    this.drawRail(ctx, this.width - RAIL_W);
    for (const d of this.devices) {
      ctx.save();
      ctx.translate(d.x, d.y);
      d.draw(ctx);
      ctx.restore();
    }
    // Windows are drawn last so their hit regions take every click while open.
    if (this.state.ui.automation) drawAutomation(ctx, this.width, this.height, this.state, this.app);
    if (this.state.ui.about) drawAbout(ctx, this.width, this.height, this.state, this.app);
  }

  drawRail(ctx, x) {
    const h = this.height;
    ctx.fillStyle = hgrad(ctx, x, x + RAIL_W, C.rail);
    ctx.fillRect(x, 0, RAIL_W, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    line(ctx, x + 0.5, 0, x + 0.5, h);
    line(ctx, x + RAIL_W - 0.5, 0, x + RAIL_W - 0.5, h);
    for (let y = 10; y < h - 10; y += 22) {
      rrect(ctx, x + 4, y, RAIL_W - 8, 8, 2);
      ctx.fillStyle = C.railHole;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      line(ctx, x + 5, y + 8.6, x + RAIL_W - 5, y + 8.6);
    }
  }
}
