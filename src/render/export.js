// EXPORT window: renders the song, the A-B loop or the current patterns
// offline with the real engine to a WAV, or to stems (one WAV per channel and
// one for the delay, in a ZIP), then hands over the file (download, or the
// share sheet on iPad/iPhone). Below, the song as a ReBirth .rbs.
import { peakDb, renderSession, wavBlob, wavParts } from '../audio/offline.js';
import { CHANNELS } from '../channels.js';
import { shareFiles } from '../song/library.js';
import { zipBlob } from '../song/zip.js';
import { serialize } from '../song/session.js';
import { songBars, TICKS_PER_BAR } from '../song/song.js';
import { hits } from '../ui/hits.js';
import { click, release } from '../ui/handlers.js';
import { brushed, button, lcd, led, MONO, panel, px, rrect, screws, text, vgrad } from './primitives.js';
import { C } from './theme.js';

const W = 360;
const H = 232;
const RBS_Y = 202; // the ReBirth song row
const PATTERN_BARS = [4, 8, 16, 32];
const TAIL = 2; // seconds after the last bar, for delay and decay tails
const COPY = {
  title: 'EXPORT',
  what: 'WHAT',
  song: 'WHOLE SONG',
  loop: 'LOOP A\u2013B',
  patterns: 'PATTERNS',
  bars: 'BARS',
  mix: 'MIX',
  stems: 'STEMS',
  render: 'RENDER',
  rendering: 'RENDERING\u2026',
  renderingStem: (label, i, n) => `${label} \u00B7 ${i} OF ${n}`,
  save: 'SAVE WAV',
  saveZip: 'SAVE ZIP',
  close: 'CLOSE',
  again: 'RENDER AGAIN',
  noSong: 'NO SONG YET: RECORD ONE, OR EXPORT THE PATTERNS',
  summary: (bars, secs, stems) => `${bars} BARS \u00B7 ${formatTime(secs)} \u00B7 ${stems ? 'STEMS, ONE WAV EACH, IN A ZIP' : '48 KHZ 16-BIT STEREO'}`,
  done: (peak, stems) =>
    `DONE${stems ? ` \u00B7 ${stems} STEMS` : ''} \u00B7 PEAK ${peak > -0.05 ? '0.0' : peak.toFixed(1)} DBFS${peak > -0.05 ? ' \u00B7 CLIPPED, TURN THE MASTER DOWN' : ''}`,
  // File names for the stems; the delay stem holds every channel's echoes.
  stemNames: { bass1: 'Bass Line 1', bass2: 'Bass Line 2', r808: 'Drum 08', r909: 'Drum 09', delay: 'Delay' },
  stemLabel: (id) => (id === 'delay' ? 'DELAY' : CHANNELS.find(([c]) => c === id)[1]),
  failed: (msg) => `FAILED: ${msg}`.toUpperCase(),
  rbs: 'REBIRTH SONG',
  rbsHint: 'PATTERNS, ARRANGEMENT, KNOBS AND AUTOMATION, FOR REBIRTH 2.0.1',
  saveRbs: 'SAVE .RBS',
};

// iPad and iPhone can't download into a folder: they get the share sheet
// (Save to Files, AirDrop...). Desktops download. iPadOS reports itself as a Mac.
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function saveFile(file) {
  if (isIOS()) return shareFiles([file]);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function openExport(state) {
  const { song } = state;
  const range = song.length ? 'song' : 'patterns';
  state.ui.export = { range, bars: 8, stems: false, status: 'idle', progress: 0, stem: '', file: null, peak: 0, count: 0, error: '' };
}

export const closeExport = (state) => (state.ui.export = null);

// What a range covers: { startBar, bars, mode } or null when it's not available.
function rangeOf(state, view) {
  const { song } = state;
  if (view.range === 'song') return song.length ? { startBar: 1, bars: songBars(song), mode: 'song' } : null;
  if (view.range === 'loop') {
    if (song.loopEnd <= song.loopStart) return null;
    return { startBar: song.loopStart / TICKS_PER_BAR + 1, bars: (song.loopEnd - song.loopStart) / TICKS_PER_BAR, mode: 'song' };
  }
  return { startBar: 1, bars: view.bars, mode: 'pattern' };
}

// Named after the song's file, like saves: a ReBirth song's title is often a credit.
const baseName = (app, view) => `${app.files.baseName()}${view.range === 'song' ? '' : view.range === 'loop' ? ' (loop)' : ' (patterns)'}`;

// A stem that never makes a sound (a machine the song doesn't use) is left out.
const SILENT_DB = -90;
const STEMS = [...CHANNELS.map(([id]) => id), 'delay'];

async function render(state, app) {
  const view = state.ui.export;
  const range = rangeOf(state, view);
  if (!range) return;
  Object.assign(view, { status: 'rendering', progress: 0, stem: '', file: null, error: '' });
  app.redraw();
  try {
    const session = serialize(state);
    const prepare = (s) => Object.assign(s.transport, { mode: range.mode, loop: false });
    const opts = { startBar: range.startBar, bars: range.bars, tail: TAIL, prepare };
    const base = baseName(app, view);
    const stems = view.stems ? STEMS : [null];
    const files = [];
    let peak = -Infinity;
    for (const [i, stem] of stems.entries()) {
      if (stem) view.stem = COPY.renderingStem(COPY.stemLabel(stem), i + 1, stems.length);
      const onProgress = (p) => {
        view.progress = (i + p) / stems.length;
        app.redraw();
      };
      const { buffer } = await renderSession(session, { ...opts, stem, onProgress });
      if (state.ui.export !== view) return;
      const db = peakDb(buffer);
      if (stem && db < SILENT_DB) continue;
      peak = Math.max(peak, db);
      files.push(stem ? { name: `${base} - ${COPY.stemNames[stem]}.wav`, parts: wavParts(buffer) } : new File([wavBlob(buffer)], `${base}.wav`, { type: 'audio/wav' }));
    }
    const file = view.stems ? new File([zipBlob(files)], `${base} (stems).zip`, { type: 'application/zip' }) : files[0];
    Object.assign(view, { status: 'done', file, peak, count: view.stems ? files.length : 0 });
  } catch (err) {
    console.error(err);
    Object.assign(view, { status: 'error', error: err.message });
  }
  app.redraw();
}

export function drawExport(ctx, rackW, rackH, state, app) {
  const view = state.ui.export;
  const busy = view.status === 'rendering';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, rackW, rackH);
  hits.rect(ctx, 0, 0, rackW, rackH, { ...click(() => !busy && closeExport(state)), cursor: 'default' });

  ctx.save();
  ctx.translate(Math.round((rackW - W) / 2), Math.round((rackH - H) / 2));
  hits.rect(ctx, 0, 0, W, H, { cursor: 'default', down: () => ({}) });
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(3, 5, W, H);
  panel(ctx, 0, 0, W, H, C.transport);
  brushed(ctx, 0, 0, W, H, 0.35);
  ctx.fillStyle = vgrad(ctx, 0, 18, C.bassHeader);
  ctx.fillRect(0, 0, W, 18);
  led(ctx, 16, 9, 2.3, true, busy ? C.ledRed : C.ledGreen);
  text(ctx, COPY.title, 24, 9.5, { size: 7.5, weight: 900, align: 'left', spacing: 1.6 });
  const name = (state.info.title || state.info.file || 'UNTITLED').toUpperCase();
  text(ctx, name.length > 34 ? `${name.slice(0, 33)}\u2026` : name, 104, 9.5, { size: 6, weight: 700, align: 'left', color: C.inkMuted, spacing: 0.6 });
  screws(ctx, W, H, 7, 26);

  // What to render
  const label = { size: 6, color: C.inkMuted, spacing: 1, align: 'left' };
  text(ctx, COPY.what, 24, 40, label);
  const options = [
    ['song', COPY.song],
    ['loop', COPY.loop],
    ['patterns', COPY.patterns],
  ];
  let x = 24;
  for (const [range, text_] of options) {
    const available = !!rangeOf(state, { ...view, range });
    x += option(ctx, x, 48, 96, text_, view.range === range, available && !busy ? () => Object.assign(view, { range, status: 'idle', file: null }) : null, `export.${range}`) + 6;
  }
  if (view.range === 'patterns') {
    text(ctx, COPY.bars, 24, 84, label);
    x = 60;
    for (const bars of PATTERN_BARS) {
      x += option(ctx, x, 76, 34, String(bars), view.bars === bars, busy ? null : () => Object.assign(view, { bars, status: 'idle', file: null }), `export.bars.${bars}`) + 6;
    }
  }
  // The whole mix in one file, or stems.
  x = W - 24 - 50 * 2 - 6;
  for (const [stems, text_] of [[false, COPY.mix], [true, COPY.stems]]) {
    x += option(ctx, x, 76, 50, text_, view.stems === stems, busy ? null : () => Object.assign(view, { stems, status: 'idle', file: null }), `export.stems.${stems}`) + 6;
  }

  // Readout: what it'll be, progress, or the result
  const range = rangeOf(state, view);
  lcd(ctx, 24, 104, W - 48, 30, C.lcdGreen);
  const mono = { size: 6.5, weight: 700, family: MONO, color: C.lcdGreenOn };
  if (!range) {
    text(ctx, COPY.noSong, W / 2, 119.5, { ...mono, color: C.lcdGreenMid });
  } else {
    const secs = (range.bars * 16 * 60) / state.transport.tempo / 4 + TAIL;
    const top = busy && view.stem ? view.stem : COPY.summary(range.bars, secs, view.stems);
    text(ctx, top, W / 2, 113, mono);
    const line2 = view.status === 'rendering' ? null : view.status === 'done' ? COPY.done(view.peak, view.count) : view.status === 'error' ? COPY.failed(view.error) : '';
    if (line2 !== null) text(ctx, line2, W / 2, 125.5, { ...mono, size: 6, color: view.status === 'error' || view.peak > -0.05 ? C.ledYellow : C.lcdGreenMid });
    else {
      rrect(ctx, 34, 122, W - 68, 6, 2);
      ctx.fillStyle = 'rgba(121,255,99,0.12)';
      ctx.fill();
      rrect(ctx, 34, 122, (W - 68) * view.progress, 6, 2);
      ctx.fillStyle = C.lcdGreenOn;
      ctx.fill();
    }
  }

  // Actions
  const by = 150;
  const closeW = 70;
  const mainW = 130;
  const gap = 10;
  const bx = (W - mainW - gap - closeW) / 2;
  if (view.status === 'done') {
    // Share/download needs the release of a tap on iOS (see `release`).
    actionButton(ctx, bx, by, mainW, view.file.name.endsWith('.zip') ? COPY.saveZip : COPY.save, release(() => saveFile(view.file), 'export.save'), 'export.save', true);
  } else {
    const label_ = busy ? COPY.rendering : view.status === 'idle' ? COPY.render : COPY.again;
    actionButton(ctx, bx, by, mainW, label_, range && !busy ? click(() => render(state, app), 'export.render') : null, 'export.render', !!range && !busy);
  }
  actionButton(ctx, bx + mainW + gap, by, closeW, COPY.close, busy ? null : click(() => closeExport(state), 'export.close'), 'export.close', !busy);
  if (view.status === 'done') {
    const again = click(() => render(state, app), 'export.again');
    text(ctx, COPY.again, W / 2, by + 34, { size: 5.5, weight: 800, color: C.inkMuted, spacing: 0.6 });
    hits.rect(ctx, W / 2 - 34, by + 28, 68, 12, again);
  }

  // The song itself, as a ReBirth file (no rendering).
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(18, RBS_Y - 10, W - 36, px(1));
  text(ctx, COPY.rbs, 24, RBS_Y + 5, label);
  text(ctx, COPY.rbsHint, 24, RBS_Y + 16, { ...label, size: 5, spacing: 0.3 });
  const rw = 90;
  actionButton(ctx, W - 24 - rw, RBS_Y - 1, rw, COPY.saveRbs, busy ? null : release(() => app.notify(app.files.saveRbs()), 'export.rbs'), 'export.rbs', !busy);
  ctx.restore();
}

function option(ctx, x, y, w, label, on, fn, key) {
  const h = 18;
  const held = on || hits.isPressed(key);
  const off = button(ctx, x, y, w, h, { face: held ? C.btnPressed : C.btnDark, pressed: held });
  led(ctx, x + 7, y + h / 2 + off, 1.9, on, C.ledYellow);
  text(ctx, label, x + 7 + (w - 7) / 2, y + h / 2 + 0.5 + off, { size: 6.5, weight: 800, spacing: 0.4, color: fn || on ? C.inkLight : C.inkMuted });
  if (fn) hits.rect(ctx, x, y, w, h, click(fn, key));
  return w;
}

function actionButton(ctx, x, y, w, label, handler, key, enabled) {
  const off = button(ctx, x, y, w, 22, { pressed: hits.isPressed(key) });
  text(ctx, label, x + w / 2, y + 11.5 + off, { size: 7, weight: 800, spacing: 1, color: enabled ? C.inkLight : C.inkMuted });
  if (handler) hits.rect(ctx, x, y, w, 22, handler);
}
