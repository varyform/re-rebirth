// Song library: every song dropped, picked or opened is kept in IndexedDB (its
// bytes plus what the list shows), keyed by a hash of its contents, so the same
// song found in several folders is one entry.
import { isRbs, parseRbs, rbsInfo } from './rbs.js';
import { FORMAT } from './session.js';
import { TICKS_PER_BAR } from './song.js';

const DB_NAME = 're-rebirth.library';
const META = 'songs';
const DATA = 'data';

export const STANDARD_GROUP = 'Standard ReBirth';
export const SAVES_GROUP = 'Re-Rebirth saves';
export const OTHER_GROUP = 'Not ReBirth 2.0 songs';

const isSongName = (name) => !name.startsWith('.') && /\.(rbs|json)$/i.test(name);

// What the list shows for one file. `group` is the mod the song needs (the
// ReBirth edition it was made for), and `loadable` whether we can play it.
export function songMeta(buffer, name) {
  const base = { name, title: '', group: OTHER_GROUP, version: '', tempo: 0, bars: 0, loadable: false, reason: 'not a ReBirth 2.0 song' };
  if (isRbs(buffer)) {
    let meta;
    try {
      const info = rbsInfo(buffer);
      meta = { ...base, title: info.title, group: info.mod || 'Unnamed mod', version: info.version, tempo: info.tempo };
    } catch (err) {
      return { ...base, reason: err.message };
    }
    try {
      const song = parseRbs(buffer, name).song;
      return { ...meta, loadable: true, reason: '', bars: Math.ceil(song.length / TICKS_PER_BAR) };
    } catch (err) {
      return { ...meta, reason: err.message };
    }
  }
  try {
    const s = JSON.parse(new TextDecoder().decode(buffer));
    if (s?.format === FORMAT) {
      const bars = Math.ceil((s.song?.length ?? 0) / TICKS_PER_BAR);
      return { ...base, title: s.info?.title ?? '', group: SAVES_GROUP, tempo: s.transport?.tempo ?? 0, bars, loadable: true, reason: '' };
    }
  } catch {
    // not JSON
  }
  return base;
}

async function contentId(buffer) {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Insecure contexts (plain http on a LAN address) have no SubtleCrypto: two FNV-1a passes.
  const bytes = new Uint8Array(buffer);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ bytes.length;
  for (const byte of bytes) {
    a = Math.imul(a ^ byte, 0x01000193) >>> 0;
    b = Math.imul(b ^ byte ^ (a & 0xff), 0x01000193) >>> 0;
  }
  return `fnv-${bytes.length}-${a.toString(16)}-${b.toString(16)}`;
}

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const complete = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

function openDb() {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(META, { keyPath: 'id' });
    req.result.createObjectStore(DATA);
  };
  return request(req);
}

export class Library {
  constructor(onChange) {
    this.onChange = onChange;
    this.items = [];
    this.current = null; // id of the song in the rack, if it came through the library
    this.db = null;
    this.ready = this.load().catch((err) => console.warn('Song library unavailable:', err));
  }

  async load() {
    this.db = await openDb();
    this.items = await request(this.db.transaction(META).objectStore(META).getAll());
    this.onChange();
  }

  find(id) {
    return this.items.find((s) => s.id === id);
  }

  // Adds files that aren't in the library yet. JSON files that aren't our saves
  // are skipped (folders hold all kinds of JSON). Returns counts and each file's id.
  async add(files) {
    await this.ready;
    const result = { added: 0, duplicates: 0, skipped: 0, ids: [] };
    if (!this.db) return result;
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const id = await contentId(buffer);
      result.ids.push(id);
      if (this.find(id)) {
        result.duplicates++;
        continue;
      }
      const meta = { id, ...songMeta(buffer, file.name), rating: 0, added: Date.now() };
      if (meta.group === OTHER_GROUP && /\.json$/i.test(file.name)) {
        result.skipped++;
        continue;
      }
      const tx = this.db.transaction([META, DATA], 'readwrite');
      tx.objectStore(META).put(meta);
      tx.objectStore(DATA).put(buffer, id);
      await complete(tx);
      this.items.push(meta);
      result.added++;
    }
    if (result.added) this.onChange();
    return result;
  }

  async file(id) {
    const meta = this.find(id);
    const buffer = await request(this.db.transaction(DATA).objectStore(DATA).get(id));
    return new File([buffer], meta.name);
  }

  async update(id, changes) {
    const meta = this.find(id);
    if (!meta) return;
    Object.assign(meta, changes);
    this.onChange();
    const tx = this.db.transaction(META, 'readwrite');
    tx.objectStore(META).put(meta);
    await complete(tx);
  }

  rate(id, stars) {
    return this.update(id, { rating: stars });
  }

  async remove(id) {
    this.items = this.items.filter((s) => s.id !== id);
    if (this.current === id) this.current = null;
    this.onChange();
    const tx = this.db.transaction([META, DATA], 'readwrite');
    tx.objectStore(META).delete(id);
    tx.objectStore(DATA).delete(id);
    await complete(tx);
  }
}

// Files from a drop, walking into dropped folders. The entries have to be taken
// from the DataTransfer before the first await: it's emptied once the drop
// handler returns.
export async function collectDropped(dataTransfer) {
  const entries = [...(dataTransfer.items ?? [])].map((item) => (item.kind === 'file' ? item.webkitGetAsEntry?.() : null));
  const plain = [...(dataTransfer.files ?? [])];
  if (!entries.some(Boolean)) return { files: plain, folders: 0 };
  const files = [];
  let folders = 0;
  const walk = async (entry) => {
    if (entry.isFile) {
      if (isSongName(entry.name)) files.push(await new Promise((resolve, reject) => entry.file(resolve, reject)));
      return;
    }
    if (!entry.isDirectory) return;
    folders++;
    const reader = entry.createReader();
    // readEntries returns the folder in batches until an empty one.
    for (let batch; (batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))).length;) {
      for (const child of batch) await walk(child);
    }
  };
  for (const entry of entries) if (entry) await walk(entry);
  // A single loose file is opened whatever its name, as before.
  if (!folders && files.length === 0 && plain.length === 1) return { files: plain, folders };
  return { files, folders };
}

// File or folder picker for adding to the library. Must run inside a user gesture.
export function pickSongs(folder, onFiles) {
  const input = Object.assign(document.createElement('input'), { type: 'file', multiple: true, hidden: true });
  if (folder) input.webkitdirectory = true;
  document.body.append(input);
  const done = () => input.remove();
  input.addEventListener('change', () => {
    const files = [...input.files].filter((f) => isSongName(f.name));
    if (files.length) onFiles(files);
    done();
  });
  input.addEventListener('cancel', done);
  input.click();
}
