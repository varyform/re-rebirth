// Spectrum display in the style of an old graphic-EQ readout: LED-segment bars
// per frequency band with peak-hold markers, on an LCD. `spectrum` is
// { bands, peaks } with values 0..1 (see AudioEngine.updateSpectrum).
import { lcd, text } from './primitives.js';
import { C } from './theme.js';

const FREQ_LABELS = [
  [100, '100'],
  [1000, '1K'],
  [10000, '10K'],
];
const F_LO = 40;
const F_HI = 16000;

export function spectrumDisplay(ctx, x, y, w, h, spectrum) {
  lcd(ctx, x, y, w, h, C.lcdGreen);
  const bands = spectrum?.bands ?? [];
  const peaks = spectrum?.peaks ?? [];
  const n = bands.length || 28;
  const left = x + 5;
  const right = x + w - 5;
  const top = y + 12;
  const bottom = y + h - 11;
  const rows = Math.max(6, Math.floor((bottom - top) / 3.5));
  const pitch = (bottom - top) / rows;
  const bw = (right - left) / n;

  text(ctx, 'SPECTRUM', left, y + 6.5, { size: 5, weight: 800, align: 'left', color: C.lcdGreenMid, spacing: 0.8 });
  for (let b = 0; b < n; b++) {
    const bx = left + b * bw + 0.5;
    const lit = Math.round((bands[b] ?? 0) * rows);
    const peak = Math.min(rows - 1, Math.round((peaks[b] ?? 0) * rows) - 1);
    for (let r = 0; r < rows; r++) {
      const on = r < lit || (r === peak && peak > 0);
      const color = r >= rows - 1 ? C.ledRed : r >= rows - 4 ? C.ledYellow : C.lcdGreenOn;
      ctx.fillStyle = on ? color : 'rgba(121,255,99,0.07)';
      ctx.fillRect(bx, bottom - (r + 1) * pitch + 0.6, bw - 1, pitch - 1.2);
    }
  }
  const fx = (f) => left + ((right - left) * Math.log(f / F_LO)) / Math.log(F_HI / F_LO);
  for (const [f, label] of FREQ_LABELS) text(ctx, label, fx(f), y + h - 5, { size: 5, weight: 700, color: C.lcdGreenMid });
}
