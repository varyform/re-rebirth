// Opening/saving songs, drag & drop, and local autosave.
import { isRbs, parseRbs } from './rbs.js';
import { applySession, serialize } from './session.js';

const AUTOSAVE_KEY = 're-rebirth.session';
// iPadOS reports itself as a Mac, so also check for touch.
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const AUTOSAVE_DELAY = 800;

export class Files {
  constructor(state, { beforeLoad, onLoaded, onError }) {
    Object.assign(this, { state, beforeLoad, onLoaded, onError });
    this.timer = 0;
  }

  async open(file) {
    try {
      const buffer = await file.arrayBuffer();
      const session = isRbs(buffer) ? parseRbs(buffer, file.name) : JSON.parse(new TextDecoder().decode(buffer));
      this.beforeLoad?.();
      applySession(this.state, session);
      if (!this.state.info.file) this.state.info.file = file.name;
      this.autosave();
      this.onLoaded?.(this.state);
    } catch (err) {
      this.onError?.(err, file);
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

  save() {
    const { info } = this.state;
    const base = (info.title || info.file.replace(/\.[^.]+$/, '') || 'untitled').replace(/[\\/:*?"<>|]+/g, '_');
    const blob = new Blob([JSON.stringify(serialize(this.state))], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${base}.rerebirth.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Drop .rbs/.json files anywhere on the page.
  acceptDrops(target) {
    target.addEventListener('dragover', (e) => e.preventDefault());
    target.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) this.open(file);
    });
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
