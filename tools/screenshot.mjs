#!/usr/bin/env node
// README screenshot: the example song playing in a window of the rack's minimum
// size, at 2x pixel density. Drives the real UI: About -> load the example song,
// the automation window's ruler to jump to a busy bar, then Space to play.
//
//   node tools/screenshot.mjs [out.png] [--bar 97] [--wait 6000]
//
// Uses the locally installed Chrome (override with CHROME=/path/to/chrome).
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : fallback);
const out = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? 'docs/screenshot.png';
const BAR = opt('--bar', 97);
const WAIT = opt('--wait', 6000);
const SONG_BARS = 544; // TGV's KiloMix '98

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 0 } });
await server.listen();
const { RACK_W: W, RACK_H: H } = await server.ssrLoadModule('/src/render/rack.js');
const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForTimeout(500);
  // At the minimum size one rack unit is one CSS pixel. Positions follow the
  // transport, About and automation layouts.
  const tap = (x, y) => page.mouse.click(x, y);
  await tap(14 + 16 + 60, 4 + 30); // logo -> About
  await page.waitForTimeout(150);
  await tap((W - 380) / 2 + 84 + 66, (H - 252) / 2 + 223); // LOAD TGV'S KILOMIX '98
  await page.waitForTimeout(1500);
  await tap(14 + 214 + 203 + 23, 4 + 47 + 7); // AUTOMATION
  await page.waitForTimeout(150);
  const gx = 22 + 156;
  const gw = W - 44 - 12 - 156;
  await tap(gx + ((BAR - 1 + 0.5) / SONG_BARS) * gw, 22 + 47 + 6); // ruler
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.mouse.move(W - 5, H - 5);
  await page.keyboard.press('Space');
  await page.waitForTimeout(WAIT);
  await page.screenshot({ path: out });
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log(`${out}: ${W}x${H} at 2x, bar ${BAR}`);
} finally {
  await browser.close();
  await server.close();
}
