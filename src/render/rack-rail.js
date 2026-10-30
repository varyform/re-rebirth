// The rack's metal side rails with their mounting holes, drawn by the rack and
// by the focus stages.
import { hgrad, line, rrect } from './primitives.js';
import { C } from './theme.js';

export const RACK_RAIL_W = 14;

export function drawRackRail(ctx, x, h) {
  ctx.fillStyle = hgrad(ctx, x, x + RACK_RAIL_W, C.rail);
  ctx.fillRect(x, 0, RACK_RAIL_W, h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  line(ctx, x + 0.5, 0, x + 0.5, h);
  line(ctx, x + RACK_RAIL_W - 0.5, 0, x + RACK_RAIL_W - 0.5, h);
  for (let y = 10; y < h - 10; y += 22) {
    rrect(ctx, x + 4, y, RACK_RAIL_W - 8, 8, 2);
    ctx.fillStyle = C.railHole;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    line(ctx, x + 5, y + 8.6, x + RACK_RAIL_W - 5, y + 8.6);
  }
}
