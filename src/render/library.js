// Song library window: every song the library holds, grouped by the mod it was
// made for (Standard ReBirth first, as those are the ones that play), sortable by
// column, with a star rating. Songs we can't open are listed but dimmed.
import { pickSongs, OTHER_GROUP, SAVES_GROUP, STANDARD_GROUP } from '../song/library.js';
import { hits } from '../ui/hits.js';
import { click, release } from '../ui/handlers.js';
import { brushed, button, lcd, led, MONO, panel, rgba, rrect, screws, text, textWidth, vgrad } from './primitives.js';
import { C } from './theme.js';

const MAX_W = 980;
const MARGIN = 16;
const TITLE_H = 18;
const PAD = 12;
const TOOL_Y = 26;
const TOOL_H = 19;
const HEAD_Y = 54;
const HEAD_H = 18;
const LIST_Y = HEAD_Y + HEAD_H + 2;
const ROW_H = 28;
const GROUP_H = 28;
const STAR = 14; // star pitch
const TAP_SLOP = 4; // units a press may move and still count as a tap

const COPY = {
  title: 'SONG LIBRARY',
  addFiles: 'ADD FILES',
  addFolder: 'ADD FOLDER',
  close: 'CLOSE',
  hint: 'DROP FILES OR FOLDERS ANYWHERE',
  search: 'Search title, file or mod',
  noMatch: 'NO SONGS MATCH',
  empty: 'NO SONGS YET',
  emptyHint: 'Drop .rbs files or whole folders on the window, or use ADD FILES / ADD FOLDER.',
  columns: { rating: 'RATING', title: 'TITLE', name: 'FILE', version: 'VER', tempo: 'BPM', bars: 'BARS' },
  needsMod: "NEEDS THIS MOD'S SOUNDS \u00B7 CAN'T OPEN",
  notSongs: "NOT REBIRTH 2.0 SONGS \u00B7 CAN'T OPEN",
};

export const SEARCH_PLACEHOLDER = COPY.search;

export function openLibrary(state) {
  // `search`: where the search field sits, in rack units (main.js lays an input over it).
  state.ui.library ??= { y: 0, sort: 'title', desc: false, collapsed: {}, query: '', search: null };
}

export function closeLibrary(state) {
  state.ui.library = null;
}

const displayTitle = (s) => s.title || s.name.replace(/\.[^.]+$/, '');
const compareText = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
const SORTS = {
  title: (a, b) => compareText(displayTitle(a), displayTitle(b)),
  name: (a, b) => compareText(a.name, b.name),
  rating: (a, b) => a.rating - b.rating,
  version: (a, b) => compareText(a.version, b.version),
  tempo: (a, b) => a.tempo - b.tempo,
  bars: (a, b) => a.bars - b.bars,
};

// Standard ReBirth, then our own saves, then mods A-Z, then files that aren't songs.
function groupRank(name) {
  if (name === STANDARD_GROUP) return 0;
  if (name === SAVES_GROUP) return 1;
  if (name === OTHER_GROUP) return 3;
  return 2;
}

// Every word has to appear in the title, file name or mod.
function matches(song, query) {
  const hay = `${song.title} ${song.name} ${song.group}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => hay.includes(word));
}

function groupSongs(items, view) {
  const sort = SORTS[view.sort];
  const dir = view.desc ? -1 : 1;
  const byGroup = new Map();
  for (const s of items) byGroup.set(s.group, [...(byGroup.get(s.group) ?? []), s]);
  return [...byGroup]
    .map(([name, songs]) => ({
      name,
      songs: songs.sort((a, b) => dir * sort(a, b) || SORTS.title(a, b)),
      loadable: songs.some((s) => s.loadable),
    }))
    .sort((a, b) => groupRank(a.name) - groupRank(b.name) || compareText(a.name, b.name));
}

function fit(ctx, s, maxW, opts) {
  if (textWidth(ctx, s, opts) <= maxW) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(ctx, `${s.slice(0, mid)}\u2026`, opts) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo)}\u2026`;
}

function columns(W) {
  const right = W - PAD - 30; // remove button and scrollbar beyond
  const titleX = PAD + 10 + STAR * 5 + 10;
  const versionX = right - 144;
  const nameW = Math.round((versionX - 12 - titleX) * 0.4);
  const nameX = versionX - 12 - nameW;
  return { starsX: PAD + 10, titleX, titleW: nameX - 12 - titleX, nameX, nameW, versionX, tempoR: right - 58, barsR: right, removeX: right + 6 };
}

export function drawLibrary(ctx, rackW, rackH, state, app) {
  const view = state.ui.library;
  const { library } = app;
  const W = Math.min(MAX_W, rackW - MARGIN * 2);
  const H = rackH - MARGIN * 2;

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, rackW, rackH);
  hits.rect(ctx, 0, 0, rackW, rackH, { ...click(() => closeLibrary(state)), cursor: 'default' });

  ctx.save();
  ctx.translate(Math.round((rackW - W) / 2), MARGIN);
  hits.rect(ctx, 0, 0, W, H, { cursor: 'default', down: () => ({}) });
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(3, 5, W, H);
  panel(ctx, 0, 0, W, H, C.transport);
  brushed(ctx, 0, 0, W, H, 0.35);
  ctx.fillStyle = vgrad(ctx, 0, TITLE_H, C.bassHeader);
  ctx.fillRect(0, 0, W, TITLE_H);
  led(ctx, 16, 9, 2.3, true, C.ledGreen);
  text(ctx, COPY.title, 24, 9.5, { size: 7.5, weight: 900, align: 'left', spacing: 1.6 });
  screws(ctx, W, H, 7, 26);

  const items = library.items;
  const query = view.query.trim();
  const shown = query ? items.filter((s) => matches(s, query)) : items;
  drawToolbar(ctx, W, state, app, items, shown, Math.round((rackW - W) / 2));
  const cols = columns(W);
  drawHeader(ctx, cols, view);

  const listH = H - PAD - LIST_Y;
  ctx.save();
  rrect(ctx, PAD, LIST_Y, W - PAD * 2, listH, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
  ctx.clip();
  if (!shown.length) {
    text(ctx, items.length ? COPY.noMatch : COPY.empty, W / 2, LIST_Y + 60, { size: 10, weight: 800, color: C.inkMuted, spacing: 1.2 });
    if (!items.length) text(ctx, COPY.emptyHint, W / 2, LIST_Y + 80, { size: 8, color: C.inkMuted });
    ctx.restore();
    ctx.restore();
    return;
  }

  const groups = groupSongs(shown, view);
  // While searching every group is open, so no match stays hidden.
  const collapsed = (g) => !query && view.collapsed[g.name];
  const contentH = groups.reduce((h, g) => h + GROUP_H + (collapsed(g) ? 0 : g.songs.length * ROW_H), 0);
  view.y = Math.min(Math.max(0, contentH - listH), Math.max(0, view.y));
  // The list scrolls with the wheel; rows and headers handle drags themselves.
  hits.rect(ctx, PAD, LIST_Y, W - PAD * 2, listH, { cursor: 'default', down: () => scrollDrag(view), wheel: (ev) => (view.y += ev.dy) });
  let y = LIST_Y - view.y;
  const visible = (h) => y + h > LIST_Y && y < LIST_Y + listH;
  for (const g of groups) {
    if (visible(GROUP_H)) drawGroup(ctx, g, y, W, view, collapsed(g));
    y += GROUP_H;
    if (collapsed(g)) continue;
    for (const song of g.songs) {
      if (visible(ROW_H)) drawRow(ctx, song, y, W, cols, view, app, g.loadable);
      y += ROW_H;
    }
  }
  ctx.restore();
  if (contentH > listH) drawScrollbar(ctx, W - PAD - 6, LIST_Y + 2, listH - 4, view.y, contentH);
  ctx.restore();
}

function drawToolbar(ctx, W, state, app, items, shown, originX) {
  const { library } = app;
  const add = (folder) => () =>
    pickSongs(folder, async (files) => {
      const r = await library.add(files);
      app.notify(addedMessage(r));
    });
  let x = PAD;
  for (const [label, fn] of [
    [COPY.addFiles, add(false)],
    [COPY.addFolder, add(true)],
  ]) {
    const bw = textWidth(ctx, label, { size: 7.5, weight: 800 }) + 20;
    const key = `library.${label}`;
    const off = button(ctx, x, TOOL_Y, bw, TOOL_H, { pressed: hits.isPressed(key) });
    text(ctx, label, x + bw / 2, TOOL_Y + TOOL_H / 2 + 0.5 + off, { size: 7.5, weight: 800, spacing: 0.6 });
    // Pickers are system UI: open on release (see `release`).
    hits.rect(ctx, x, TOOL_Y, bw, TOOL_H, release(fn, key));
    x += bw + 4;
  }
  // Search: an LCD box; the text field itself is an <input> main.js lays over it.
  const sw = 230;
  lcd(ctx, x + 4, TOOL_Y, sw, TOOL_H, C.lcdGreen);
  state.ui.library.search = { x: originX + x + 4, y: MARGIN + TOOL_Y, w: sw, h: TOOL_H, size: 8 };
  x += sw + 8;

  const bw = textWidth(ctx, COPY.close, { size: 7.5, weight: 800 }) + 20;
  const cx = W - PAD - bw;
  const playable = shown.filter((s) => s.loadable).length;
  const count = shown.length === items.length ? `${items.length} SONGS` : `${shown.length} OF ${items.length} SONGS`;
  const stats = items.length ? `${count} \u00B7 ${playable} PLAYABLE \u00B7 ` : '';
  const statsOpts = { size: 6.8, align: 'left', color: C.inkMuted, spacing: 0.4 };
  text(ctx, fit(ctx, `${stats}${COPY.hint}`, cx - 10 - (x + 6), statsOpts), x + 6, TOOL_Y + TOOL_H / 2 + 0.5, statsOpts);

  const off = button(ctx, cx, TOOL_Y, bw, TOOL_H, { pressed: hits.isPressed('library.close') });
  text(ctx, COPY.close, cx + bw / 2, TOOL_Y + TOOL_H / 2 + 0.5 + off, { size: 7.5, weight: 800, spacing: 0.6 });
  hits.rect(ctx, cx, TOOL_Y, bw, TOOL_H, click(() => closeLibrary(state), 'library.close'));
}

export function addedMessage({ added, duplicates, skipped }) {
  const parts = [`Added ${added} song${added === 1 ? '' : 's'}`];
  if (duplicates) parts.push(`${duplicates} already in library`);
  if (skipped) parts.push(`${skipped} skipped`);
  return parts.join(' \u00B7 ');
}

// Column titles; click to sort, again to reverse.
function drawHeader(ctx, cols, view) {
  const y = HEAD_Y + HEAD_H / 2 + 0.5;
  const heads = [
    ['rating', cols.starsX, 'left', STAR * 5 + 4],
    ['title', cols.titleX, 'left', cols.titleW],
    ['name', cols.nameX, 'left', cols.nameW],
    ['version', cols.versionX, 'left', 40],
    ['tempo', cols.tempoR, 'right', 46],
    ['bars', cols.barsR, 'right', 46],
  ];
  for (const [key, x, align, w] of heads) {
    const on = view.sort === key;
    const label = `${COPY.columns[key]}${on ? (view.desc ? ' \u25BE' : ' \u25B4') : ''}`;
    text(ctx, label, x, y, { size: 7.2, weight: 800, align, color: on ? C.inkLight : C.inkMuted, spacing: 0.6 });
    const hx = align === 'left' ? x : x - w;
    // Ratings and numbers read best highest first.
    const firstDesc = key === 'rating' || key === 'tempo' || key === 'bars';
    hits.rect(ctx, hx - 2, HEAD_Y, w + 4, HEAD_H, click(() => Object.assign(view, on ? { desc: !view.desc } : { sort: key, desc: firstDesc })));
  }
}

function drawGroup(ctx, g, y, W, view, collapsed) {
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(PAD, y, W - PAD * 2, GROUP_H);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(PAD, y + GROUP_H - 1, W - PAD * 2, 1);
  const cy = y + GROUP_H / 2 + 0.5;
  text(ctx, collapsed ? '\u25B8' : '\u25BE', PAD + 9, cy, { size: 10, color: C.inkMuted });
  led(ctx, PAD + 22, cy - 0.5, 2.6, g.loadable, C.ledGreen);
  const name = g.name.toUpperCase();
  text(ctx, name, PAD + 32, cy, { size: 10, weight: 800, align: 'left', color: g.loadable ? C.inkLight : C.inkMuted, spacing: 0.8 });
  const nw = textWidth(ctx, name, { size: 10, weight: 800, spacing: 0.8 });
  const count = `${g.songs.length} SONG${g.songs.length === 1 ? '' : 'S'}`;
  text(ctx, count, PAD + 42 + nw, cy, { size: 8, align: 'left', color: C.inkMuted, spacing: 0.4 });
  if (!g.loadable) {
    const why = g.name === OTHER_GROUP ? COPY.notSongs : COPY.needsMod;
    text(ctx, why, W - PAD - 12, cy, { size: 8, align: 'right', color: C.inkMuted, spacing: 0.4 });
  }
  hits.rect(ctx, PAD, y, W - PAD * 2, GROUP_H, tapOrScroll(view, () => (view.collapsed[g.name] = !collapsed)));
}

function drawRow(ctx, song, y, W, cols, view, app, groupLoadable) {
  const { library } = app;
  const current = library.current === song.id;
  if (current) {
    ctx.fillStyle = rgba(C.ledGreen, 0.12);
    ctx.fillRect(PAD, y, W - PAD * 2, ROW_H);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(PAD + 4, y + ROW_H - 0.5, W - PAD * 2 - 8, 0.5);
  const cy = y + ROW_H / 2 + 0.5;
  ctx.save();
  if (!song.loadable) ctx.globalAlpha = 0.45;

  const opts = { size: 11, weight: 700, align: 'left', color: current ? C.ledGreen : C.inkLight };
  const muted = { size: 9.5, family: MONO, align: 'left', color: C.inkMuted };
  text(ctx, fit(ctx, displayTitle(song), cols.titleW, opts), cols.titleX, cy, opts);
  text(ctx, fit(ctx, song.name, cols.nameW, muted), cols.nameX, cy, muted);
  if (!song.loadable && groupLoadable) {
    // A broken song among playable ones says why.
    const reason = { ...muted, align: 'right', color: C.ledRed };
    text(ctx, fit(ctx, song.reason.toUpperCase(), cols.barsR - cols.versionX, reason), cols.barsR, cy, reason);
  } else {
    text(ctx, song.version, cols.versionX, cy, muted);
    if (song.tempo) text(ctx, song.tempo.toFixed(song.tempo % 1 ? 1 : 0), cols.tempoR, cy, { ...muted, align: 'right' });
    if (song.bars) text(ctx, String(song.bars), cols.barsR, cy, { ...muted, align: 'right' });
  }
  ctx.restore();

  // Tap to open (playing on if the rack was playing); drag to scroll.
  if (song.loadable) hits.rect(ctx, PAD, y, W - PAD * 2, ROW_H, tapOrScroll(view, () => openSong(app, song.id), 'pointer'));
  else hits.rect(ctx, PAD, y, W - PAD * 2, ROW_H, tapOrScroll(view, () => { }, 'not-allowed'));

  for (let i = 1; i <= 5; i++) {
    const sx = cols.starsX + (i - 1) * STAR + STAR / 2;
    star(ctx, sx, cy - 0.5, 5.6, i <= song.rating);
    hits.rect(ctx, sx - STAR / 2, y, STAR, ROW_H, click(() => library.rate(song.id, song.rating === i ? 0 : i)));
  }
  const rx = cols.removeX;
  text(ctx, '\u00D7', rx + 6, cy, { size: 13, weight: 700, color: C.inkMuted });
  hits.rect(ctx, rx - 1, y + 2, 14, ROW_H - 4, click(() => library.remove(song.id)));
}

async function openSong(app, id) {
  const wasPlaying = app.clock.t.playing;
  const opened = await app.files.open(await app.library.file(id));
  if (opened && wasPlaying) app.clock.play();
}

function star(ctx, cx, cy, r, on) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = on ? C.ledYellow : 'rgba(255,255,255,0.12)';
  ctx.fill();
}

function scrollDrag(view) {
  return { move: (ev) => (view.y -= ev.p.y - ev.prev.y) };
}

// A tap acts; a drag scrolls the list (touch screens have no wheel).
function tapOrScroll(view, onTap, cursor = 'pointer') {
  return {
    cursor,
    down: (ev) => {
      let moved = 0;
      const drag = scrollDrag(view);
      return {
        move: (e) => {
          moved += Math.abs(e.p.y - e.prev.y) + Math.abs(e.p.x - e.prev.x);
          drag.move(e);
        },
        up: () => moved < TAP_SLOP && onTap(ev),
      };
    },
    wheel: (ev) => (view.y += ev.dy),
  };
}

function drawScrollbar(ctx, x, y, h, scroll, contentH) {
  const th = Math.max(16, (h * h) / contentH);
  const ty = y + ((h - th) * scroll) / (contentH - h);
  rrect(ctx, x, ty, 3, th, 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();
}
