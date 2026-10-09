// "About" window, drawn over the rack like another piece of hardware.
import pkg from '../../package.json' with { type: 'json' };
import { hits } from '../ui/hits.js';
import { click, release } from '../ui/handlers.js';
import { drawLogo } from './logo.js';
import { brushed, button, lcd, led, MONO, panel, screws, text, textWidth, vgrad } from './primitives.js';
import { C } from './theme.js';

const W = 380;
const H = 252;
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
  songsLabel: 'More songs:',
  songsUrl: 'https://nordbeat.com/archive/rebirth/song_archives.htm',
  songsText: 'nordbeat.com/archive/rebirth',
  demoLabel: "LOAD TGV'S KILOMIX '98",
  demoName: "TGV's KiloMix '98.rbs",
  demoUrl: `${import.meta.env.BASE_URL}songs/tgv-kilomix-98.rbs`,
};

export function openAbout(state) {
  state.ui.about = true;
}

export function closeAbout(state) {
  state.ui.about = false;
}

// app: { files } for the built-in example song.
export function drawAbout(ctx, rackW, rackH, state, app) {
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
  drawSongsLink(ctx, 24, 172);

  lcd(ctx, 18, 182, W - 36, 18, C.lcd);
  text(ctx, COPY.keys, W / 2, 191.5, { size: 5.8, weight: 700, family: MONO, color: C.lcdOn });

  // An example song is one click away, no file to pass around.
  const loadW = 132;
  const closeW = 70;
  const lx = (W - loadW - 10 - closeW) / 2;
  const loadOff = button(ctx, lx, 212, loadW, 22, { pressed: hits.isPressed('about.demo') });
  text(ctx, COPY.demoLabel, lx + loadW / 2, 223.5 + loadOff, { size: 6.5, weight: 800, spacing: 0.8 });
  const loadDemo = () => {
    closeAbout(state);
    app.files.openUrl(COPY.demoUrl, COPY.demoName);
  };
  hits.rect(ctx, lx, 212, loadW, 22, click(loadDemo, 'about.demo'));
  const cx = lx + loadW + 10;
  const off = button(ctx, cx, 212, closeW, 22, { pressed: hits.isPressed('about.close') });
  text(ctx, 'CLOSE', cx + closeW / 2, 223.5 + off, { size: 7, weight: 800, spacing: 1.2 });
  hits.rect(ctx, cx, 212, closeW, 22, click(() => closeAbout(state), 'about.close'));
  ctx.restore();
}

// "More songs:" plus an underlined link that opens the song archive in a new tab.
function drawSongsLink(ctx, x, y) {
  const labelOpts = { size: 6.8, weight: 600, align: 'left', color: C.inkMuted };
  const linkOpts = { ...labelOpts, color: C.delay };
  text(ctx, COPY.songsLabel, x, y, labelOpts);
  const lx = x + textWidth(ctx, COPY.songsLabel, labelOpts) + 5;
  const lw = textWidth(ctx, COPY.songsText, linkOpts);
  text(ctx, COPY.songsText, lx, y, linkOpts);
  ctx.fillStyle = C.delay;
  ctx.fillRect(lx, y + 4.5, lw, 0.7);
  hits.rect(ctx, lx - 2, y - 6, lw + 4, 12, release(() => window.open(COPY.songsUrl, '_blank', 'noopener')));
}
