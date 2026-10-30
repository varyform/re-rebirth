// Opening/saving songs, drag & drop, and local autosave.
import { isRbs, parseRbs } from './rbs.js';
import { rbsLosses, writeRbs } from './rbs-write.js';
import { applySession, serialize } from './session.js';

const AUTOSAVE_KEY = 're-rebirth.session';
// iPadOS reports itself as a Mac, so also check for touch.
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const AUTOSAVE_DELAY = 800;
const JSON_FORMAT = 'Re-Rebirth session (.json)';

export class Files {
  constructor(state, { beforeLoad, onLoaded, onError }) {
    Object.assign(this, { state, beforeLoad, onLoaded, onError });
    this.timer = 0;
  }

  // Resolves true once the song is in the rack.
  async open(file) {
    try {
      const buffer = await file.arrayBuffer();
      const rbs = isRbs(buffer);
      const session = rbs ? parseRbs(buffer, file.name) : JSON.parse(new TextDecoder().decode(buffer));
      this.beforeLoad?.();
      applySession(this.state, session);
      if (!this.state.info.file) this.state.info.file = file.name;
      if (!rbs) this.state.info.format = JSON_FORMAT;
      this.autosave();
      this.onLoaded?.(this.state, file);
      return true;
    } catch (err) {
      this.onError?.(err, file);
      return false;
    }
  }

  // A song shipped with the app (public/songs), opened like a picked file.
  async openUrl(url, name) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      await this.open(new File([await res.arrayBuffer()], name));
    } catch (err) {
      this.onError?.(err, { name });
    }
  }

  newSong() {
    this.beforeLoad?.();
    this.state.clearSong();
    this.autosave();
    this.onLoaded?.(this.state);
  }

  // Must run inside a user gesture (see `release` in ui/handlers.js).
  pick() {
    // iOS has no file type for .rbs, so an `accept` filter greys those files out
    // in the picker; it gets an unfiltered picker and open() rejects bad files.
    const input = Object.assign(document.createElement('input'), { type: 'file' });
    if (!isIOS()) input.accept = '.rbs,.json,application/json';
    // Safari is more reliable with an input that's in the document.
    input.hidden = true;
    document.body.append(input);
    const done = () => input.remove();
    input.addEventListener('change', () => {
      if (input.files[0]) this.open(input.files[0]);
      done();
    });
    input.addEventListener('cancel', done);
    input.click();
  }

  // Saves are named after the file the song came from: a ReBirth song's title
  // is often a credit ("(c) by ..."). New songs use the title.
  baseName() {
    const { info } = this.state;
    const file = info.file.replace(/(\.rerebirth\.json|\.json|\.rbs)+.*$/i, '');
    return (file || info.title.trim() || 'untitled').replace(/[\\/:*?"<>|]+/g, '_');
  }

  download(blob, name) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  save() {
    this.download(new Blob([JSON.stringify(serialize(this.state))], { type: 'application/json' }), `${this.baseName()}.rerebirth.json`);
  }

  // As a ReBirth 2.0.1 song, for ReBirth itself or anything else that reads
  // .rbs. Returns a notice, naming what the format couldn't hold.
  saveRbs() {
    const session = serialize(this.state);
    const name = `${this.baseName()}.rbs`;
    this.download(new Blob([writeRbs(session)], { type: 'application/octet-stream' }), name);
    const lost = rbsLosses(session);
    return `Saved ${name}${lost.length ? ` \u00B7 not in .rbs: ${lost.join(', ')}` : ''}`;
  }


  autosave() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serialize(this.state)));
      } catch {
        // Quota or privacy mode: autosave is best-effort.
      }
    }, AUTOSAVE_DELAY);
  }

  restore() {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (!saved) return false;
      applySession(this.state, JSON.parse(saved));
      return true;
    } catch {
      return false;
    }
  }
}
