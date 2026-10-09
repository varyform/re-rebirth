// "About" window, drawn over the rack like another piece of hardware.
import pkg from '../../package.json' with { type: 'json' };
import { hits } from '../ui/hits.js';
import { click } from '../ui/handlers.js';
import { drawLogo } from './logo.js';
import { brushed, button, lcd, led, MONO, panel, screws, text, vgrad } from './primitives.js';
import { C } from './theme.js';

const W = 380;
const H = 236;
const COPY = {
  title: 'ABOUT',
  author: 'OLEH KHOMEI',
  year: '2026',
  lines: [
    'A tribute to ReBirth RB-338 (Propellerhead Software, 1997).',
    'Independent project: not affiliated with or endorsed by Reason Studios.',
    'All sounds are synthesized in the browser with the Web Audio API.',
    'Song file format from publicly shared reverse-engineering notes.',
    'Opens ReBirth 2.0 songs using the standard sounds; songs that need a mod are refused.',
  ],
  keys: 'SPACE  PLAY / STOP       DROP .RBS / .JSON  OPEN       HOLD REW / FF  SEEK',
};

export function openAbout(state) {
  state.ui.about = true;
}

export function closeAbout(state) {
  state.ui.about = false;
}

export function drawAbout(ctx, rackW, rackH, state) {
  // Dim the rack; a click anywhere outside the window closes it.
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, rackW, rackH);
  hits.rect(ctx, 0, 0, rackW, rackH, { ...click(() => closeAbout(state)), cursor: 'default' });

  ctx.save();
  ctx.translate(Math.round((rackW - W) / 2), Math.round((rackH - H) / 2));
  // Swallow clicks on the window itself.
  hits.rect(ctx, 0, 0, W, H, { cursor: 'default', down: () => ({}) });

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(3, 5, W, H);
  panel(ctx, 0, 0, W, H, C.transport);
  brushed(ctx, 0, 0, W, H, 0.35);

  ctx.fillStyle = vgrad(ctx, 0, 18, C.bassHeader);
  ctx.fillRect(0, 0, W, 18);
  led(ctx, 16, 9, 2.3, true, C.ledGreen);
  text(ctx, COPY.title, 24, 9.5, { size: 7.5, weight: 900, align: 'left', spacing: 1.6 });
  screws(ctx, W, H, 7, 26);

  drawLogo(ctx, 24, 58);

  lcd(ctx, W - 150, 32, 126, 38, C.lcdGreen);
  text(ctx, `VERSION ${pkg.version}`, W - 87, 45, { size: 8, weight: 700, family: MONO, color: C.lcdGreenOn });
  text(ctx, `\u00A9 ${COPY.year} ${COPY.author}`, W - 87, 59, { size: 6.5, family: MONO, color: C.lcdGreenMid });

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(18, 86, W - 36, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(18, 87, W - 36, 1);

  COPY.lines.forEach((line, i) => text(ctx, line, 24, 102 + i * 14, { size: 6.8, weight: 600, align: 'left', color: C.inkLight }));

  lcd(ctx, 18, 166, W - 36, 18, C.lcd);
  text(ctx, COPY.keys, W / 2, 175.5, { size: 5.8, weight: 700, family: MONO, color: C.lcdOn });

  const bw = 70;
  const bx = (W - bw) / 2;
  const off = button(ctx, bx, 196, bw, 22, { pressed: hits.isPressed('about.close') });
  text(ctx, 'CLOSE', W / 2, 207.5 + off, { size: 7, weight: 800, spacing: 1.2 });
  hits.rect(ctx, bx, 196, bw, 22, click(() => closeAbout(state), 'about.close'));
  ctx.restore();
}
