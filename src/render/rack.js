import { Bassline } from './devices/bassline.js';
import { DrumMachine, R808, R909 } from './devices/drum-machine.js';
import { EffectsColumn } from './devices/effects.js';
import { Transport } from './devices/transport.js';
import { hgrad, line, rrect } from './primitives.js';
import { C } from './theme.js';

const RAIL_W = 14;
const MARGIN = 6;
const GAP = 3;
const INSTRUMENT_W = 772;
const EFFECTS_W = 300;

// Design-space width of the rack: the app's minimum (1:1) size.
export const RACK_W = RAIL_W * 2 + INSTRUMENT_W + GAP + EFFECTS_W;

export class Rack {
  // app: { clock, engine, files }
  constructor(state, app) {
    this.state = state;
    this.devices = [];
    const x = RAIL_W;
    let y = MARGIN;

    this.devices.push(new Transport(state, app, x, y, RACK_W - RAIL_W * 2, 80));
    y += 80 + GAP;

    const top = y;
    const bands = [];
    const instruments = [
      [(...r) => new Bassline(state, app, ...r, { id: 'bass1', number: 1 }), 176],
      [(...r) => new Bassline(state, app, ...r, { id: 'bass2', number: 2 }), 176],
      [(...r) => new DrumMachine(state, app, ...r, R808), 206],
      [(...r) => new DrumMachine(state, app, ...r, R909), 206],
    ];
    for (const [make, h] of instruments) {
      this.devices.push(make(x, y, INSTRUMENT_W, h));
      bands.push({ y: y - top, h });
      y += h + GAP;
    }
    const bottom = y - GAP;
    this.devices.push(new EffectsColumn(state, x + INSTRUMENT_W + GAP, top, EFFECTS_W, bottom - top, bands, GAP));

    this.width = RACK_W;
    this.height = bottom + MARGIN;
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
