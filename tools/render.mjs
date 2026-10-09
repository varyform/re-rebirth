#!/usr/bin/env node
// Offline render of a song to WAV with the real engine, in headless Chrome.
//
//   node tools/render.mjs <song.rbs|session.json> [out.wav] [--start 1] [--bars 16] [--rate 48000] [--solo bass1] [--set fx.dist.on=0 ...] [--no-trim]
//
// Uses the locally installed Chrome (override with CHROME=/path/to/chrome).
import { writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function parseArgs(argv) {
  const opts = { start: 1, bars: 16, rate: 48000, solo: null, set: {}, noTrim: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--start') opts.start = Number(argv[++i]);
    else if (a === '--bars') opts.bars = Number(argv[++i]);
    else if (a === '--rate') opts.rate = Number(argv[++i]);
    else if (a === '--no-trim') opts.noTrim = true;
    else if (a === '--solo') opts.solo = argv[++i];
    else if (a === '--set') {
      const [key, value] = argv[++i].split('=');
      opts.set[key] = Number(value);
    }
    else opts.files.push(a);
  }
  return opts;
}

function wav(pcm, sampleRate, channels) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const opts = parseArgs(process.argv.slice(2));
const [song, out = 'render.wav'] = opts.files;
if (!song) {
  console.error('usage: node tools/render.mjs <song.rbs|session.json> [out.wav] [--start N] [--bars N] [--solo deviceId]');
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: CHROME });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${base}tools/render.html`);
  await page.waitForFunction(() => window.renderReady);
  const url = `/${relative(root, resolve(song)).split('/').map(encodeURIComponent).join('/')}`;
  const t0 = performance.now();
  const res = await page.evaluate((args) => window.renderSong(args), { url, startBar: opts.start, bars: opts.bars, sampleRate: opts.rate, solo: opts.solo, set: opts.set, noTrim: opts.noTrim });
  writeFileSync(out, wav(Buffer.from(res.data, 'base64'), res.sampleRate, res.channels));
  console.log(`${out}: bars ${opts.start}-${opts.start + opts.bars - 1} at ${res.tempo} BPM${opts.solo ? `, solo ${opts.solo}` : ''} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
} finally {
  await browser.close();
  await server.close();
}
