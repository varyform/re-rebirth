// Automation window: every recorded control of the song as a lane graph over
// time, grouped by song track. Drag or scroll to pan, pinch / ctrl+wheel to
// zoom, click the bar ruler to move the song position.
import { TICKS_PER_BAR, TRACK_IDS } from '../song/song.js';
import { hits } from '../ui/hits.js';
import { click } from '../ui/handlers.js';
import { brushed, button, led, line, MONO, panel, rgba, rrect, screws, text, textWidth, vgrad } from './primitives.js';
import { C } from './theme.js';

const MARGIN = 22; // around the window, inside the rack
const TITLE_H = 18;
const PAD = 12;
const TOOL_Y = 25;
const TOOL_H = 14;
const RULER_Y = 47;
const RULER_H = 13;
const LANES_Y = RULER_Y + RULER_H + 3;
const LABEL_W = 156;
const GROUP_H = 16;
const LANE_H = 24;
const MIN_SPAN = TICKS_PER_BAR; // most zoomed in: one bar across
const BANKS = 'ABCD';

const TRACK_NAMES = { bass1: 'BASS 1', bass2: 'BASS 2', r808: 'DRUM 08', r909: 'DRUM 09', mixer: 'MIXER', fx: 'EFFECTS' };
// Devices first, like the rack.
const TRACK_ORDER = ['bass1', 'bass2', 'r808', 'r909', 'mixer', 'fx'].filter((id) => TRACK_IDS.includes(id));
const LABEL = { size: 6, weight: 700, align: 'left', color: C.inkLight, spacing: 0.3 };
const VALUE = { size: 6, weight: 700, family: MONO, align: 'right', color: C.lcdGreenMid };

export function openAutomation(state) {
  state.ui.automation = { filter: 'all', y: 0, from: 0, span: maxSpan(state.song) };
}

export function closeAutomation(state) {
  state.ui.automation = null;
}

// "mixer.bass1.level" on the mixer track -> "BASS 1 LEVEL"; "r909.hh.chDecay" -> "HH CH DECAY".
function laneLabel(track, key) {
  if (key === 'pattern') return 'PATTERN';
  let parts = key.split('.');
  if (parts[0] === track || parts[0] === 'fx') parts = parts.slice(1);
  return parts
    .map((p) => TRACK_NAMES[p] ?? p.replace(/([a-z])([A-Z])/g, '$1 $2'))
    .join(' ')
    .toUpperCase();
}

// Lanes are rebuilt only when the song changes (another song, or recording).
let cache = { song: null, stamp: '', groups: [] };

function laneGroups(song) {
  const stamp = `${song.length}:${TRACK_ORDER.map((id) => song.tracks[id].length).join(',')}`;
  if (cache.song === song && cache.stamp === stamp) return cache.groups;
  const groups = [];
  for (const id of TRACK_ORDER) {
    const byKey = new Map();
    for (const e of song.tracks[id]) {
      if (!byKey.has(e.key)) byKey.set(e.key, []);
      byKey.get(e.key).push(e);
    }
    if (!byKey.size) continue;
    const keys = [...byKey.keys()].sort((a, b) => (a === 'pattern' ? -1 : b === 'pattern' ? 1 : a.localeCompare(b)));
    const lanes = keys.map((key) => {
      const events = byKey.get(key);
      const kind = key === 'pattern' ? 'pattern' : events.every((e) => e.value === 0 || e.value === 1) ? 'switch' : 'level';
      return { key, events, kind, label: laneLabel(id, key) };
    });
    groups.push({ id, name: TRACK_NAMES[id], color: C.lanes[id], lanes });
  }
  cache = { song, stamp, groups };
  return groups;
}

const songEnd = (song) => Math.max(song.length, TICKS_PER_BAR);
const maxSpan = (song) => Math.max(songEnd(song), MIN_SPAN * 4);

// Index of the last event at or before `tick`, or -1.
function lastAt(events, tick) {
  let lo = 0;
  let hi = events.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].tick <= tick) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function valueText(lane, value) {
  if (value === undefined) return '';
  if (lane.kind === 'pattern') return `${BANKS[Math.floor(value / 8)]}${(value % 8) + 1}`;
  if (lane.kind === 'switch') return value >= 0.5 ? 'ON' : 'OFF';
  return String(Math.round(value * 127)); // ReBirth's knob scale
}

function clampView(view, song, contentH, viewH) {
  view.span = Math.min(maxSpan(song), Math.max(MIN_SPAN, view.span));
  view.from = Math.min(Math.max(0, songEnd(song) - view.span), Math.max(0, view.from));
  view.y = Math.min(Math.max(0, contentH - viewH), Math.max(0, view.y));
}

export function drawAutomation(ctx, rackW, rackH, state, app) {
  const view = state.ui.automation;
  const { song } = state;
  const W = rackW - MARGIN * 2;
  const H = rackH - MARGIN * 2;

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, rackW, rackH);
  hits.rect(ctx, 0, 0, rackW, rackH, { ...click(() => closeAutomation(state)), cursor: 'default' });

  ctx.save();
  ctx.translate(MARGIN, MARGIN);
  hits.rect(ctx, 0, 0, W, H, { cursor: 'default', down: () => ({}) });
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(3, 5, W, H);
  panel(ctx, 0, 0, W, H, C.transport);
  brushed(ctx, 0, 0, W, H, 0.35);
  ctx.fillStyle = vgrad(ctx, 0, TITLE_H, C.bassHeader);
  ctx.fillRect(0, 0, W, TITLE_H);
  led(ctx, 16, 9, 2.3, true, C.ledGreen);
  text(ctx, 'AUTOMATION', 24, 9.5, { size: 7.5, weight: 900, align: 'left', spacing: 1.6 });
  const name = (state.info.title || state.info.file || 'UNTITLED').toUpperCase();
  text(ctx, name, 108, 9.5, { size: 6, weight: 700, align: 'left', color: C.inkMuted, spacing: 0.8 });
  screws(ctx, W, H, 7, 26);

  const all = laneGroups(song);
  const groups = all.filter((g) => view.filter === 'all' || g.id === view.filter);
  const gx = LABEL_W;
  const gw = W - PAD - gx;
  const viewH = H - PAD - LANES_Y;
  const contentH = groups.reduce((h, g) => h + GROUP_H + g.lanes.length * LANE_H, 0);
  clampView(view, song, contentH, viewH);
  const X = (tick) => gx + ((tick - view.from) * gw) / view.span;
  const tickAt = (x) => view.from + ((x - gx) * view.span) / gw;

  drawToolbar(ctx, W, state, view, all, song);
  if (!groups.length) {
    text(ctx, 'NO AUTOMATION IN THIS SONG', W / 2, LANES_Y + 60, { size: 8, weight: 800, color: C.inkMuted, spacing: 1.2 });
    text(ctx, 'Open a song, or arm REC in song mode and move some knobs.', W / 2, LANES_Y + 76, { size: 6.5, color: C.inkMuted });
    ctx.restore();
    return;
  }

  const barStep = rulerStep((gw * TICKS_PER_BAR) / view.span);
  drawRuler(ctx, state, view, gx, gw, X, barStep);
  hits.rect(ctx, gx, RULER_Y, gw, RULER_H, seekDrag(app, tickAt));

  // Lanes, clipped to the viewport and scrolled.
  ctx.save();
  rrect(ctx, PAD, LANES_Y, W - PAD * 2, viewH, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
  ctx.clip();
  const playTick = (state.transport.bar - 1) * TICKS_PER_BAR + Math.max(0, state.transport.step) * 2;
  let y = LANES_Y - view.y;
  for (const g of groups) {
    if (y + GROUP_H > LANES_Y && y < LANES_Y + viewH) drawGroupHeader(ctx, g, y, W);
    y += GROUP_H;
    for (const lane of g.lanes) {
      if (y + LANE_H > LANES_Y && y < LANES_Y + viewH) drawLane(ctx, lane, g.color, y, { gx, gw, X, view, song, playTick, barStep });
      y += LANE_H;
    }
  }
  ctx.restore();

  // Playhead over ruler and lanes.
  const px = X(playTick);
  if (px >= gx && px <= gx + gw) {
    ctx.strokeStyle = rgba(C.ledGreen, 0.85);
    ctx.lineWidth = 1;
    line(ctx, Math.round(px) + 0.5, RULER_Y, Math.round(px) + 0.5, LANES_Y + viewH);
  }
  if (contentH > viewH) drawScrollbar(ctx, W - PAD + 3, LANES_Y, viewH, view.y, contentH);
  hits.rect(ctx, PAD, LANES_Y, W - PAD * 2, viewH, panZoom(view, gw, tickAt));
  ctx.restore();
}

function drawToolbar(ctx, W, state, view, groups, song) {
  let x = PAD;
  const filters = [['all', 'ALL'], ...groups.map((g) => [g.id, g.name])];
  for (const [id, label] of filters) {
    const bw = textWidth(ctx, label, { size: 6, weight: 800 }) + 18;
    const on = view.filter === id;
    const off = button(ctx, x, TOOL_Y, bw, TOOL_H, { face: on ? C.btnPressed : C.btnDark, pressed: on });
    led(ctx, x + 6, TOOL_Y + TOOL_H / 2 + off, 1.8, on, id === 'all' ? C.ledGreen : C.lanes[id]);
    text(ctx, label, x + 11, TOOL_Y + TOOL_H / 2 + 0.5 + off, { size: 6, weight: 800, align: 'left', color: on ? C.inkLight : C.inkMuted, spacing: 0.4 });
    hits.rect(ctx, x, TOOL_Y, bw, TOOL_H, click(() => Object.assign(view, { filter: id, y: 0 })));
    x += bw + 4;
  }

  const tools = [
    ['CLOSE', () => closeAutomation(state)],
    ['FIT', () => Object.assign(view, { from: 0, span: maxSpan(song) })],
    ['+', () => zoomAround(view, 0.5, view.from + view.span / 2)],
    ['\u2212', () => zoomAround(view, 2, view.from + view.span / 2)],
  ];
  let rx = W - PAD;
  for (const [label, fn] of tools) {
    const bw = label.length > 1 ? textWidth(ctx, label, { size: 6, weight: 800 }) + 16 : 16;
    rx -= bw;
    const key = `automation.${label}`;
    const off = button(ctx, rx, TOOL_Y, bw, TOOL_H, { pressed: hits.isPressed(key) });
    text(ctx, label, rx + bw / 2, TOOL_Y + TOOL_H / 2 + 0.5 + off, { size: label.length > 1 ? 6 : 9, weight: 800, spacing: label.length > 1 ? 0.6 : 0 });
    hits.rect(ctx, rx, TOOL_Y, bw, TOOL_H, click(fn, key));
    rx -= 4;
  }
  const bars = view.span / TICKS_PER_BAR;
  text(ctx, `${Math.round(bars)} BARS IN VIEW \u00B7 DRAG / SCROLL TO PAN \u00B7 PINCH OR CTRL+SCROLL TO ZOOM`, rx - 6, TOOL_Y + TOOL_H / 2 + 0.5, { size: 5.2, align: 'right', color: C.inkMuted, spacing: 0.4 });
}

// Bar numbering step so labels stay at least ~30 units apart.
function rulerStep(pxPerBar) {
  for (const step of [1, 2, 4, 8, 16, 32, 64, 128, 256]) if (step * pxPerBar >= 30) return step;
  return 512;
}

function drawRuler(ctx, state, view, gx, gw, X, step) {
  const { song, transport } = state;
  rrect(ctx, gx, RULER_Y, gw, RULER_H, 2);
  ctx.fillStyle = vgrad(ctx, RULER_Y, RULER_Y + RULER_H, C.lcdGreen);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(gx, RULER_Y, gw, RULER_H);
  ctx.clip();
  if (transport.loop && song.loopEnd > song.loopStart) {
    ctx.fillStyle = rgba(C.ledYellow, 0.22);
    ctx.fillRect(X(song.loopStart), RULER_Y, X(song.loopEnd) - X(song.loopStart), RULER_H);
  }
  const first = Math.floor(view.from / TICKS_PER_BAR / step) * step;
  const last = (view.from + view.span) / TICKS_PER_BAR;
  ctx.strokeStyle = C.lcdGreenDim;
  ctx.lineWidth = 1;
  for (let b = first; b <= last; b += step) {
    const x = Math.round(X(b * TICKS_PER_BAR)) + 0.5;
    line(ctx, x, RULER_Y + RULER_H - 4, x, RULER_Y + RULER_H);
    text(ctx, String(b + 1), x + 2, RULER_Y + RULER_H / 2, { size: 5.8, weight: 700, family: MONO, align: 'left', color: C.lcdGreenMid });
  }
  ctx.restore();
}

function drawGroupHeader(ctx, g, y, W) {
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(PAD, y, W - PAD * 2, GROUP_H);
  ctx.fillStyle = g.color;
  ctx.fillRect(PAD + 6, y + 5, 10, 6);
  text(ctx, g.name, PAD + 22, y + GROUP_H / 2 + 0.5, { size: 6.5, weight: 900, align: 'left', color: C.inkLight, spacing: 1.2 });
  text(ctx, `${g.lanes.length} LANE${g.lanes.length > 1 ? 'S' : ''}`, LABEL_W - 8, y + GROUP_H / 2 + 0.5, { size: 5.5, align: 'right', color: C.inkMuted, spacing: 0.5 });
}

function drawLane(ctx, lane, color, y, { gx, gw, X, view, song, playTick, barStep }) {
  const top = y + 3;
  const h = LANE_H - 6;
  const now = lastAt(lane.events, playTick);
  text(ctx, lane.label, PAD + 22, y + LANE_H / 2 + 0.5, LABEL);
  text(ctx, valueText(lane, lane.events[now]?.value), LABEL_W - 8, y + LANE_H / 2 + 0.5, VALUE);

  rrect(ctx, gx, top, gw, h, 1.5);
  ctx.fillStyle = vgrad(ctx, top, top + h, C.screen);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(gx, top, gw, h);
  ctx.clip();
  // Bar grid, matching the ruler.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  const firstBar = Math.floor(view.from / TICKS_PER_BAR / barStep) * barStep;
  for (let b = firstBar; b * TICKS_PER_BAR <= view.from + view.span; b += barStep) {
    const x = Math.round(X(b * TICKS_PER_BAR)) + 0.5;
    line(ctx, x, top, x, top + h);
  }
  const end = Math.max(song.length, lane.events.at(-1).tick + TICKS_PER_BAR);
  const span = { from: Math.max(0, lastAt(lane.events, view.from)), to: view.from + view.span, end };
  if (lane.kind === 'level') drawLevel(ctx, lane.events, color, X, top, h, span);
  else drawBlocks(ctx, lane, color, X, top, h, span);
  if (song.length) {
    // Past the end of the song.
    const xe = X(song.length);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(xe, top, gx + gw - xe, h);
  }
  ctx.restore();
}

// Knob moves hold until the next event: a stepped line with a soft fill.
// Zoomed out, many moves share a pixel column; those collapse into one
// vertical stroke over their range.
function drawLevel(ctx, events, color, X, top, h, { from, to, end }) {
  const Y = (v) => top + h - v * (h - 2) - 1;
  const path = new Path2D();
  let x0 = null;
  let colX = 0;
  let lo = 0;
  let hi = 0;
  let prevY = 0;
  let k = from;
  for (; k < events.length && events[k].tick <= to; k++) {
    const x = X(events[k].tick);
    const y = Y(events[k].value);
    if (x0 === null) {
      x0 = colX = x;
      lo = hi = y;
      path.moveTo(x, y);
    } else if (x - colX < 0.5) {
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    } else {
      if (hi - lo > 0.5) {
        path.lineTo(colX, lo);
        path.lineTo(colX, hi);
      }
      path.lineTo(colX, prevY);
      path.lineTo(x, prevY);
      path.lineTo(x, y);
      colX = x;
      lo = hi = y;
    }
    prevY = y;
  }
  if (x0 === null) return;
  if (hi - lo > 0.5) {
    path.lineTo(colX, lo);
    path.lineTo(colX, hi);
  }
  path.lineTo(colX, prevY);
  const xEnd = X(k < events.length ? events[k].tick : end);
  path.lineTo(xEnd, prevY);
  const area = new Path2D(path);
  area.lineTo(xEnd, top + h);
  area.lineTo(x0, top + h);
  area.closePath();
  ctx.fillStyle = rgba(color, 0.2);
  ctx.fill(area);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke(path);
}

// Switches as lit blocks; pattern changes as labelled blocks.
function drawBlocks(ctx, lane, color, X, top, h, { from, to, end }) {
  const { events } = lane;
  for (let k = from; k < events.length && events[k].tick <= to; k++) {
    const e = events[k];
    const x0 = X(e.tick);
    const x1 = X(events[k + 1]?.tick ?? end);
    if (lane.kind === 'switch') {
      if (e.value < 0.5) continue;
      ctx.fillStyle = rgba(color, 0.55);
      ctx.fillRect(x0, top + 3, x1 - x0, h - 6);
      continue;
    }
    ctx.fillStyle = rgba(color, k % 2 ? 0.28 : 0.42);
    ctx.fillRect(x0, top + 1, x1 - x0 - 0.5, h - 2);
    const label = valueText(lane, e.value);
    if (x1 - x0 > textWidth(ctx, label, { size: 6, weight: 800, family: MONO }) + 6) {
      text(ctx, label, x0 + 3, top + h / 2 + 0.5, { size: 6, weight: 800, family: MONO, align: 'left', color: C.inkLight });
    }
  }
}

function drawScrollbar(ctx, x, y, h, scroll, contentH) {
  const th = Math.max(16, (h * h) / contentH);
  const ty = y + ((h - th) * scroll) / (contentH - h);
  rrect(ctx, x, ty, 3, th, 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();
}

function zoomAround(view, factor, anchor) {
  const span = view.span * factor;
  view.from = anchor - ((anchor - view.from) * span) / view.span;
  view.span = span; // clamped on the next draw
}

// Drag pans both ways; wheel scrolls lanes (shift / horizontal wheel pans time);
// pinch or ctrl+wheel zooms around the pointer.
function panZoom(view, gw, tickAt) {
  return {
    cursor: 'grab',
    down: () => ({
      move: (ev) => {
        view.from -= ((ev.p.x - ev.prev.x) * view.span) / gw;
        view.y -= ev.p.y - ev.prev.y;
      },
    }),
    wheel: (ev) => {
      if (ev.zoom) return zoomAround(view, Math.exp(ev.dy * 0.01), tickAt(ev.p.x));
      const dx = ev.fine && !ev.dx ? ev.dy : ev.dx;
      view.from += (dx * view.span) / gw;
      if (!(ev.fine && !ev.dx)) view.y += ev.dy;
    },
  };
}

// Click or drag along the ruler to move the song position.
function seekDrag(app, tickAt) {
  const seek = (ev) => app.clock.seekTo(Math.floor(Math.max(0, tickAt(ev.p.x)) / TICKS_PER_BAR) + 1);
  return {
    cursor: 'pointer',
    down: (ev) => {
      seek(ev);
      return { move: seek };
    },
  };
}
