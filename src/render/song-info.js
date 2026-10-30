// SONG INFORMATION window: the song's file, its title, text, web page and
// copyright (edited in real text fields laid over the canvas, see main.js), and
// what the file says about itself: mod, format, tempo, mode, loop, shuffle,
// synth sound (switchable here) and where its last event sits.
import { songBars, TICKS_PER_BAR } from '../song/song.js';

import { hits } from '../ui/hits.js';
import { click, release } from '../ui/handlers.js';
import { brushed, button, lcd, led, MONO, panel, px, screws, text, textWidth, vgrad } from './primitives.js';
import { C } from './theme.js';

const W = 400;
const H = 304;
const LABEL_X = 22;
const VALUE_X = 96;
const FIELD_W = 228;
const FIELD_H = 13;
const ROW = 18;
const COPY = {
  title: 'SONG INFORMATION',
  close: 'CLOSE',
  file: 'FILE',
  fields: { title: 'TITLE', text: 'TEXT', url: 'WEB PAGE', copyright: 'COPYRIGHT' },
  left: (n) => `${n} LEFT`,
  lineBreaks: 'A LINE BREAK TAKES 2',
  open: 'OPEN',
  mod: 'MOD',
  modWeb: 'MOD WEB',
  modFtp: 'MOD FTP',
  format: 'FORMAT',
  lastEvent: 'LAST EVENT',
  tempo: 'TEMPO',
  mode: 'MODE',
  loop: 'LOOP',
  shuffle: 'SHUFFLE',
  sound: 'SYNTH SOUND',
  standard: 'STANDARD REBIRTH',
  standardKit: (mod) => `${mod.toUpperCase()} \u00B7 PLAYS ON THE STANDARD DRUMS`,
  sounds: [
    [0, 'REBIRTH 2.0'],
    [1, 'VINTAGE'],
  ],
  none: '\u2014',
  untitled: 'NOT SAVED YET',
  bar: (n) => `BAR ${n}`,
  noEvents: 'NO SONG EVENTS',
  on: 'ON',
  off: 'OFF',
  bpm: (t) => `${t.toFixed(3)} BPM`,
};

// The editable fields and what ReBirth's file has room for. The text's line
// breaks are one byte in the file, but ReBirth's own dialog counts two and cuts
// a text that's full by its count, so they count two here too.
export const INFO_FIELDS = [
  { key: 'title', max: 40 },
  { key: 'text', max: 400, multiline: true },
  { key: 'url', max: 100 },
  { key: 'copyright', max: 128 },
];
const used = (field, s) => (field.multiline ? s.length + (s.match(/\n/g)?.length ?? 0) : s.length);

// The value cut down to what the field holds.
export function fitField(field, value) {
  let s = value;
  while (used(field, s) > field.max) s = s.slice(0, -1);
  return s;
}

export function openSongInfo(state) {
  // rects: where the text fields go this frame, in rack units (main.js places them).
  state.ui.songInfo = { rects: {} };
}

export function closeSongInfo(state) {
  state.ui.songInfo = null;
}

// The bar of the song's last recorded event, or 0.
function lastEventBar(song) {
  let last = -1;
  for (const events of Object.values(song.tracks)) if (events.length) last = Math.max(last, events.at(-1).tick);
  return last < 0 ? 0 : Math.floor(last / TICKS_PER_BAR) + 1;
}

const webUrl = (s) => (/^[a-z]+:\/\//i.test(s) ? s : `http://${s}`);

function fit(ctx, s, maxW, opts) {
  if (textWidth(ctx, s, opts) <= maxW) return s;
  let out = s;
  while (out.length > 1 && textWidth(ctx, `${out}\u2026`, opts) > maxW) out = out.slice(0, -1);
  return `${out}\u2026`;
}

export function drawSongInfo(ctx, rackW, rackH, state) {
  const view = state.ui.songInfo;
  const { info, transport: t, song } = state;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, rackW, rackH);
  hits.rect(ctx, 0, 0, rackW, rackH, { ...click(() => closeSongInfo(state)), cursor: 'default' });

  const ox = Math.round((rackW - W) / 2);
  const oy = Math.round((rackH - H) / 2);
  ctx.save();
  ctx.translate(ox, oy);
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

  const label = { size: 6.2, weight: 700, align: 'left', color: C.inkMuted, spacing: 0.8 };
  const value = { size: 6.8, weight: 600, align: 'left', color: C.inkLight };
  const small = { size: 5.2, weight: 700, align: 'left', color: C.inkMuted, spacing: 0.4 };

  let y = 34;
  text(ctx, COPY.file, LABEL_X, y, label);
  text(ctx, fit(ctx, info.file || COPY.untitled, W - VALUE_X - 22, value), VALUE_X, y, value);

  // The text fields: an LCD box each; main.js lays a real input over it.
  y += 16;
  for (const field of INFO_FIELDS) {
    const h = field.multiline ? 74 : FIELD_H;
    const fy = y - FIELD_H / 2;
    text(ctx, COPY.fields[field.key], LABEL_X, field.multiline ? fy + h / 2 : y, label);
    lcd(ctx, VALUE_X, fy, FIELD_W, h, C.lcdGreen);
    view.rects[field.key] = { x: ox + VALUE_X, y: oy + fy, w: FIELD_W, h, size: 6.5 };
    const left = COPY.left(field.max - used(field, info[field.key] ?? ''));
    if (field.multiline) {
      text(ctx, `${left} \u00B7 ${COPY.lineBreaks}`, VALUE_X, fy + h + 6, small);
      y += h + 12;
    } else {
      text(ctx, left, VALUE_X + FIELD_W + 6, y, small);
      if (field.key === 'url' && info.url) {
        const lx = VALUE_X + FIELD_W + 46;
        const link = { ...small, size: 6, color: C.delay };
        text(ctx, COPY.open, lx, y, link);
        ctx.fillStyle = C.delay;
        ctx.fillRect(lx, y + 4, textWidth(ctx, COPY.open, link), 0.7);
        hits.rect(ctx, lx - 2, y - 6, 26, 12, release(() => window.open(webUrl(info.url), '_blank', 'noopener')));
      }
      y += ROW;
    }
  }

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(18, y - 6, W - 36, px(1));
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(18, y - 6 + px(1), W - 36, px(1));

  // What the file says, in two columns.
  const facts = { size: 6.4, weight: 700, family: MONO, align: 'left', color: C.inkLight };
  const colW = W / 2 - 82 - 10;
  const fact = (col, row, name, val) => {
    const x = col ? W / 2 + 4 : LABEL_X;
    const fy = y + 8 + row * 14;
    text(ctx, name, x, fy, label);
    if (val !== null) text(ctx, fit(ctx, val, colW, facts), x + 64, fy, facts);
    return { x: x + 64, y: fy };
  };
  const bar = lastEventBar(song);
  fact(0, 0, COPY.mod, info.mod ? COPY.standardKit(info.mod) : COPY.standard);
  fact(0, 1, COPY.modWeb, info.modWeb || (info.mod ? COPY.none : 'www.propellerheads.se'));
  fact(0, 2, COPY.modFtp, info.modFtp || (info.mod ? COPY.none : 'ftp.propellerheads.se'));
  fact(0, 3, COPY.format, info.format || COPY.none);
  fact(0, 4, COPY.lastEvent, bar ? COPY.bar(bar) : COPY.noEvents);
  fact(1, 0, COPY.tempo, COPY.bpm(t.tempo));
  fact(1, 1, COPY.mode, t.mode.toUpperCase());
  fact(1, 2, COPY.loop, t.loop && songBars(song) ? COPY.on : COPY.off);
  fact(1, 3, COPY.shuffle, String(Math.round(state.get('song.shuffle') * 127)));
  // The sound model, switchable: the one setting here that changes the sound.
  const at = fact(1, 4, COPY.sound, null);
  let sx = at.x;
  for (const [v, name] of COPY.sounds) {
    const on = state.on01('song.vintage') === !!v;
    const bw = name.length * 3.9 + 14;
    const key = `info.sound.${v}`;
    const off = button(ctx, sx, at.y - 6.5, bw, 13, { face: on ? C.btnPressed : C.btnDark, pressed: on || hits.isPressed(key) });
    led(ctx, sx + 6, at.y + off, 1.7, on, C.ledYellow);
    text(ctx, name, sx + 10 + (bw - 10) / 2, at.y + 0.5 + off, { size: 5.4, weight: 800, spacing: 0.3, color: on ? C.inkLight : C.inkMuted });
    hits.rect(ctx, sx, at.y - 6.5, bw, 13, click(() => state.set('song.vintage', v), key));
    sx += bw + 4;
  }

  const closeW = 70;
  const cx = (W - closeW) / 2;
  const off = button(ctx, cx, H - 32, closeW, 22, { pressed: hits.isPressed('info.close') });
  text(ctx, COPY.close, cx + closeW / 2, H - 20.5 + off, { size: 7, weight: 800, spacing: 1.2 });
  hits.rect(ctx, cx, H - 32, closeW, 22, click(() => closeSongInfo(state), 'info.close'));
  ctx.restore();
}
