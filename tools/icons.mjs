#!/usr/bin/env node
// Renders public/icon.svg to the PNG home-screen icons (iOS ignores SVG icons).
//
//   node tools/icons.mjs
//
// Uses the locally installed Chrome (override with CHROME=/path/to/chrome).
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SIZES = { 'public/apple-touch-icon.png': 180, 'public/icon-192.png': 192, 'public/icon-512.png': 512 };

const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch({ executablePath: CHROME });
try {
  for (const [out, size] of Object.entries(SIZES)) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`${out}: ${size}x${size}`);
  }
} finally {
  await browser.close();
}
