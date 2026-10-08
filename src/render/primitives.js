// Vector drawing primitives. Everything is drawn in rack design units and
// scaled by the context transform, so no bitmap assets and no blur on resize.
// Canvas shadows ignore the transform, so soft shadows are faked with gradients.
import { C } from './theme.js';

export const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
export const MONO = 'Menlo, "SF Mono", Consolas, monospace';
const TAU = Math.PI * 2;

export const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// amt < 0 darkens towards black, amt > 0 lightens towards white.
export function shade(hex, amt) {
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function addStops(g, stops) {
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
  return g;
}

export const vgrad = (ctx, y0, y1, stops) => addStops(ctx.createLinearGradient(0, y0, 0, y1), stops);
export const hgrad = (ctx, x0, x1, stops) => addStops(ctx.createLinearGradient(x0, 0, x1, 0), stops);

export function circle(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
}

export function rrect(ctx, x, y, w, h, r = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function font({ size = 7, weight = 700, italic = false, family = FONT }) {
  return `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
}

export function text(ctx, s, x, y, opts = {}) {
  const { color = C.inkLight, align = 'center', baseline = 'middle', spacing = 0 } = opts;
  ctx.font = font(opts);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (spacing && 'letterSpacing' in ctx) {
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(s, x, y);
    ctx.letterSpacing = '0px';
  } else {
    ctx.fillText(s, x, y);
  }
}

export function textWidth(ctx, s, opts = {}) {
  ctx.font = font(opts);
  return ctx.measureText(s).width;
}

export function panel(ctx, x, y, w, h, stops, { radius = 2, bevel = 0.3 } = {}) {
  rrect(ctx, x, y, w, h, radius);
  ctx.fillStyle = vgrad(ctx, y, y + h, stops);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(255,255,255,${bevel})`;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y + h - radius);
  ctx.lineTo(x + 0.5, y + 0.5);
  ctx.lineTo(x + w - radius, y + 0.5);
  ctx.stroke();
  ctx.strokeStyle = `rgba(0,0,0,${Math.min(1, bevel + 0.35)})`;
  ctx.beginPath();
  ctx.moveTo(x + w - 0.5, y + radius);
  ctx.lineTo(x + w - 0.5, y + h - 0.5);
  ctx.lineTo(x + radius, y + h - 0.5);
  ctx.stroke();
}

let brushedTile = null;
const brushedPatterns = new WeakMap();

function brushedPattern(ctx) {
  let pattern = brushedPatterns.get(ctx);
  if (pattern) return pattern;
  if (!brushedTile) {
    const W = 512;
    const H = 128;
    brushedTile = document.createElement('canvas');
    brushedTile.width = W;
    brushedTile.height = H;
    const g = brushedTile.getContext('2d');
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1400; i++) {
      const y = rnd() * H;
      const x = rnd() * W;
      const len = 40 + rnd() * 260;
      g.strokeStyle = rnd() > 0.5 ? `rgba(255,255,255,${0.05 + rnd() * 0.12})` : `rgba(0,0,0,${0.04 + rnd() * 0.1})`;
      g.lineWidth = 0.5 + rnd() * 0.6;
      for (const ox of [0, -W]) {
        g.beginPath();
        g.moveTo(x + ox, y);
        g.lineTo(x + ox + len, y);
        g.stroke();
      }
    }
  }
  pattern = ctx.createPattern(brushedTile, 'repeat');
  brushedPatterns.set(ctx, pattern);
  return pattern;
}

export function brushed(ctx, x, y, w, h, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = brushedPattern(ctx);
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

export function softShadow(ctx, cx, cy, r, alpha = 0.5) {
  const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  circle(ctx, cx, cy, r);
  ctx.fill();
}

export function screw(ctx, cx, cy, r = 3.4, angle = 0.6) {
  softShadow(ctx, cx + 0.5, cy + 1, r + 1.8, 0.55);
  const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#f4f4f4');
  g.addColorStop(0.6, '#a7a9ad');
  g.addColorStop(1, '#55585d');
  circle(ctx, cx, cy, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = 'rgba(30,30,30,0.85)';
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = 'round';
  line(ctx, -r * 0.55, 0, r * 0.55, 0);
  line(ctx, 0, -r * 0.55, 0, r * 0.55);
  ctx.restore();
}

export function screws(ctx, w, h, inset = 7, top = 9) {
  screw(ctx, inset, top, 3.4, 0.4);
  screw(ctx, w - inset, top, 3.4, 1.1);
  screw(ctx, inset, h - top, 3.4, 0.9);
  screw(ctx, w - inset, h - top, 3.4, 0.2);
}

export const KNOB_A0 = Math.PI * 0.75;
export const KNOB_SWEEP = Math.PI * 1.5;

export function knob(ctx, cx, cy, r, value, s, { ticks = 11 } = {}) {
  if (ticks > 1) {
    ctx.strokeStyle = s.tick;
    ctx.lineCap = 'round';
    for (let i = 0; i < ticks; i++) {
      const a = KNOB_A0 + (KNOB_SWEEP * i) / (ticks - 1);
      const major = i === 0 || i === ticks - 1;
      const r0 = r + 2.2;
      const r1 = r + (major ? 5 : 4);
      ctx.lineWidth = major ? 1.1 : 0.8;
      line(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
  }

  softShadow(ctx, cx + r * 0.1, cy + r * 0.25, r * 1.35, 0.6);

  let g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.1, cx, cy, r);
  g.addColorStop(0, s.body[0]);
  g.addColorStop(1, s.body[1]);
  circle(ctx, cx, cy, r);
  ctx.fillStyle = g;
  ctx.fill();

  if (s.knurl) {
    ctx.strokeStyle = s.knurl;
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 32; i++) {
      const a = (TAU * i) / 32;
      line(ctx, cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, cx + Math.cos(a) * r * 0.97, cy + Math.sin(a) * r * 0.97);
    }
  }
  circle(ctx, cx, cy, r);
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  if (s.cap) {
    const rc = r * s.capRatio;
    g = ctx.createRadialGradient(cx - rc * 0.4, cy - rc * 0.5, rc * 0.05, cx, cy, rc * 1.05);
    g.addColorStop(0, s.cap[0]);
    g.addColorStop(1, s.cap[1]);
    circle(ctx, cx, cy, rc);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, rc - 0.3, Math.PI * 1.05, Math.PI * 1.75);
    ctx.stroke();
  }

  const a = KNOB_A0 + KNOB_SWEEP * clamp01(value);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  ctx.lineCap = 'round';
  for (const [color, from, to, width] of s.pointers) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.9, r * width);
    line(ctx, cx + ca * r * from, cy + sa * r * from, cx + ca * r * to, cy + sa * r * to);
  }
}

export function led(ctx, cx, cy, r, on, color = C.ledRed) {
  if (on) {
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.5);
    glow.addColorStop(0, rgba(color, 0.55));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    circle(ctx, cx, cy, r * 3.5);
    ctx.fill();
  }
  circle(ctx, cx, cy + 0.3, r + 0.9);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.05, cx, cy, r);
  if (on) {
    g.addColorStop(0, '#fffbe8');
    g.addColorStop(0.35, color);
    g.addColorStop(1, shade(color, -0.35));
  } else {
    g.addColorStop(0, shade(color, -0.45));
    g.addColorStop(1, shade(color, -0.82));
  }
  circle(ctx, cx, cy, r);
  ctx.fillStyle = g;
  ctx.fill();
  circle(ctx, cx - r * 0.35, cy - r * 0.4, r * 0.28);
  ctx.fillStyle = on ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.22)';
  ctx.fill();
}

export function ledBar(ctx, x, y, w, h, on, color) {
  if (on) {
    ctx.fillStyle = rgba(color, 0.25);
    ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
  }
  ctx.fillStyle = on ? color : shade(color, -0.8);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = on ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.05)';
  ctx.fillRect(x, y, w, h * 0.35);
}

// Returns the vertical press offset so callers can shift face labels with it.
export function button(ctx, x, y, w, h, { face = C.btnDark, pressed = false, radius = 2 } = {}) {
  const off = pressed ? 1 : 0;
  rrect(ctx, x - 0.6, y - 0.6, w + 1.2, h + 2.6, radius + 0.6);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  rrect(ctx, x, y + off, w, h, radius);
  ctx.fillStyle = vgrad(ctx, y + off, y + off + h, face);
  ctx.fill();
  ctx.strokeStyle = pressed ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.7;
  line(ctx, x + radius, y + off + 0.6, x + w - radius, y + off + 0.6);
  return off;
}

export function fader(ctx, x, y, w, h, value, { cap = C.faderCap, tickColor = 'rgba(255,255,255,0.22)' } = {}) {
  const cx = x + w / 2;
  const capH = 11;
  ctx.strokeStyle = tickColor;
  ctx.lineWidth = 0.6;
  for (let i = 0; i <= 10; i++) {
    const ty = y + capH / 2 + ((h - capH) * i) / 10;
    const len = i % 5 === 0 ? 4 : 2.5;
    line(ctx, x, ty, x + len, ty);
    line(ctx, x + w - len, ty, x + w, ty);
  }
  rrect(ctx, cx - 1.6, y, 3.2, h, 1.6);
  ctx.fillStyle = '#050505';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  line(ctx, cx - 1.6, y + h + 0.5, cx + 1.6, y + h + 0.5);

  const cy = y + (h - capH) * (1 - clamp01(value));
  rrect(ctx, x + 1, cy + 1.5, w - 2, capH, 1.5);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  rrect(ctx, x + 1, cy, w - 2, capH, 1.5);
  ctx.fillStyle = vgrad(ctx, cy, cy + capH, cap);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#1a1a1a';
  line(ctx, x + 2.5, cy + capH / 2, x + w - 2.5, cy + capH / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  line(ctx, x + 2.5, cy + capH / 2 + 1, x + w - 2.5, cy + capH / 2 + 1);
}

export function lcd(ctx, x, y, w, h, stops = C.lcd, radius = 2) {
  rrect(ctx, x - 1, y - 1, w + 2, h + 2, radius + 1);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 0.8;
  line(ctx, x, y + h + 1.4, x + w, y + h + 1.4);
  rrect(ctx, x, y, w, h, radius);
  ctx.fillStyle = vgrad(ctx, y, y + h, stops);
  ctx.fill();
  ctx.save();
  rrect(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h * 0.3);
  ctx.lineTo(x, y + h * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  '-': 'g', ' ': '', _: 'd',
  A: 'abcefg', B: 'cdefg', b: 'cdefg', C: 'adef', D: 'bcdeg', d: 'bcdeg', E: 'adefg', F: 'aefg', H: 'bcefg',
  L: 'def', P: 'abefg', S: 'acdfg', U: 'bcdef', n: 'ceg', o: 'cdeg', r: 'eg', t: 'defg',
};

function segmentPolys(w, h, t) {
  const ht = t / 2;
  const g = t * 0.2;
  const L = ht;
  const R = w - ht;
  const T = ht;
  const M = h / 2;
  const B = h - ht;
  const H = (x0, x1, y) => [[x0, y], [x0 + ht, y - ht], [x1 - ht, y - ht], [x1, y], [x1 - ht, y + ht], [x0 + ht, y + ht]];
  const V = (x, y0, y1) => [[x, y0], [x + ht, y0 + ht], [x + ht, y1 - ht], [x, y1], [x - ht, y1 - ht], [x - ht, y0 + ht]];
  return {
    a: H(L + g, R - g, T),
    g: H(L + g, R - g, M),
    d: H(L + g, R - g, B),
    f: V(L, T + g, M - g),
    b: V(R, T + g, M - g),
    e: V(L, M + g, B - g),
    c: V(R, M + g, B - g),
  };
}

function segmentCells(str) {
  const cells = [];
  for (const ch of String(str)) {
    if (ch === '.' && cells.length && !cells[cells.length - 1].dp) cells[cells.length - 1].dp = true;
    else cells.push({ ch, dp: false });
  }
  return cells;
}

export function sevenSegWidth(str, dw, gap = dw * 0.32) {
  const n = segmentCells(str).length;
  return n * dw + (n - 1) * gap;
}

// `on` must be a hex color (used for the glow).
export function sevenSeg(ctx, str, x, y, dw, dh, opts = {}) {
  const { on = C.lcdOn, off = C.lcdOff, gap = dw * 0.32, thick = dw * 0.2, skew = 0.07 } = opts;
  const polys = segmentPolys(dw, dh, thick);
  segmentCells(str).forEach((cell, i) => {
    ctx.save();
    ctx.translate(x + i * (dw + gap), y);
    ctx.transform(1, 0, -skew, 1, skew * dh, 0);
    const lit = SEGMENTS[cell.ch] ?? '';
    for (const k of 'abcdefg') {
      const pts = polys[k];
      ctx.beginPath();
      pts.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      if (lit.includes(k)) {
        ctx.strokeStyle = rgba(on, 0.3);
        ctx.lineWidth = thick * 0.9;
        ctx.stroke();
        ctx.fillStyle = on;
      } else {
        ctx.fillStyle = off;
      }
      ctx.fill();
    }
    circle(ctx, dw + gap * 0.45, dh - thick * 0.5, thick * 0.55);
    ctx.fillStyle = cell.dp ? on : off;
    ctx.fill();
    ctx.restore();
  });
}

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11, 12];
const BLACK_KEYS = [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6]]; // [note, boundary between white keys]

export function miniKeyboard(ctx, x, y, w, h, { active = -1, color = C.bassAccent } = {}) {
  const ww = w / WHITE_KEYS.length;
  rrect(ctx, x - 2, y - 2, w + 4, h + 4, 2);
  ctx.fillStyle = '#050505';
  ctx.fill();
  WHITE_KEYS.forEach((note, i) => {
    const kx = x + i * ww;
    ctx.beginPath();
    ctx.roundRect(kx + 0.4, y, ww - 0.8, h, [0, 0, 2, 2]);
    ctx.fillStyle = vgrad(ctx, y, y + h, note === active ? [shade(color, 0.45), color] : ['#d4d4d1', '#fbfbf8', '#e6e6e3']);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.fillRect(kx + 0.4, y + h - 3, ww - 0.8, 3);
  });
  const bw = ww * 0.6;
  const bh = h * 0.6;
  for (const [note, b] of BLACK_KEYS) {
    const kx = x + b * ww - bw / 2;
    ctx.beginPath();
    ctx.roundRect(kx, y, bw, bh, [0, 0, 1.5, 1.5]);
    ctx.fillStyle = note === active ? vgrad(ctx, y, y + bh, [shade(color, 0.1), shade(color, -0.35)]) : vgrad(ctx, y, y + bh, ['#3b3b3b', '#0b0b0b']);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(kx + 1.4, y, bw - 2.8, bh - 4, [0, 0, 1, 1]);
    ctx.fillStyle = note === active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
    ctx.fill();
  }
}

export function icon(ctx, kind, cx, cy, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const h = s * 0.5;
  switch (kind) {
    case 'play':
      ctx.moveTo(cx - s * 0.4, cy - h);
      ctx.lineTo(cx + s * 0.5, cy);
      ctx.lineTo(cx - s * 0.4, cy + h);
      break;
    case 'stop':
      ctx.rect(cx - s * 0.42, cy - s * 0.42, s * 0.84, s * 0.84);
      break;
    case 'rew':
      for (const ox of [-h, 0]) {
        ctx.moveTo(cx + ox, cy);
        ctx.lineTo(cx + ox + h, cy - s * 0.4);
        ctx.lineTo(cx + ox + h, cy + s * 0.4);
        ctx.closePath();
      }
      break;
    case 'ff':
      for (const ox of [h, 0]) {
        ctx.moveTo(cx + ox, cy);
        ctx.lineTo(cx + ox - h, cy - s * 0.4);
        ctx.lineTo(cx + ox - h, cy + s * 0.4);
        ctx.closePath();
      }
      break;
    case 'up':
      ctx.moveTo(cx, cy - s * 0.4);
      ctx.lineTo(cx + h, cy + s * 0.35);
      ctx.lineTo(cx - h, cy + s * 0.35);
      break;
    case 'down':
      ctx.moveTo(cx, cy + s * 0.4);
      ctx.lineTo(cx + h, cy - s * 0.35);
      ctx.lineTo(cx - h, cy - s * 0.35);
      break;
  }
  ctx.closePath();
  ctx.fill();
}

export function waveIcon(ctx, kind, cx, cy, s, color) {
  const h = s / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  if (kind === 'saw') {
    ctx.moveTo(cx - s, cy + h);
    ctx.lineTo(cx, cy - h);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx + s, cy - h);
    ctx.lineTo(cx + s, cy + h);
  } else {
    ctx.moveTo(cx - s, cy + h);
    ctx.lineTo(cx - s, cy - h);
    ctx.lineTo(cx, cy - h);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx + s, cy + h);
    ctx.lineTo(cx + s, cy - h);
  }
  ctx.stroke();
}
