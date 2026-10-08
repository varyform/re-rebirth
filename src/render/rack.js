import { Bassline } from './devices/bassline.js';
import { DrumMachine, R808, R909 } from './devices/drum-machine.js';
import { EffectsRow } from './devices/effects.js';
import { Transport } from './devices/transport.js';
import { hgrad, line, rrect } from './primitives.js';
import { C } from './theme.js';

// Design-space size of the rack: the app's minimum (1:1) size.
export const RACK_W = 800;
const RAIL_W = 14;
const MARGIN = 6;
const GAP = 3;

export class Rack {
  constructor(state) {
    this.state = state;
    this.devices = [];
    const x = RAIL_W;
    const w = RACK_W - RAIL_W * 2;
    let y = MARGIN;
    const add = (make, h) => {
      this.devices.push(make(x, y, w, h));
      y += h + GAP;
    };
    add((...r) => new Transport(state, ...r), 80);
    add((...r) => new EffectsRow(state, ...r), 120);
    add((...r) => new Bassline(state, ...r, { id: 'bass1', number: 1 }), 176);
    add((...r) => new Bassline(state, ...r, { id: 'bass2', number: 2 }), 176);
    add((...r) => new DrumMachine(state, ...r, R808), 206);
    add((...r) => new DrumMachine(state, ...r, R909), 206);
    this.width = RACK_W;
    this.height = y - GAP + MARGIN;
  }

  draw(ctx) {
    ctx.fillStyle = C.rackBg;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawRail(ctx, 0);
    this.drawRail(ctx, this.width - RAIL_W);
    for (const d of this.devices) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(d.x + 1, d.y + 2, d.w, d.h);
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
