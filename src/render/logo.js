import { FONT, text, vgrad } from './primitives.js';
import { C } from './theme.js';

export const LOGO_W = 186;

// Chrome wordmark with the four step colours and a tagline; (x, y) is the
// wordmark's baseline start. Spans about y - 22 .. y + 14.
export function drawLogo(ctx, x, y) {
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
