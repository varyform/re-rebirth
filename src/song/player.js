// Song playback + recording over the event model in song.js.
import { DEVICE_IDS } from '../state.js';
import { eraseRange, TICKS_PER_BAR, TRACK_IDS, valueAt, writeEvent } from './song.js';

// Which song track a state param key is recorded on.
export function trackFor(key) {
  const head = key.split('.')[0];
  if (DEVICE_IDS.includes(head)) return head;
  if (head === 'fx') return 'fx';
  return 'mixer';
}

export function applyEvent(state, trackId, e, source = 'song') {
  if (e.key === 'pattern') state.selectPattern(trackId, e.value, source);
  else state.set(e.key, e.value, source);
}

// TOUCH lets go of a control this long after its last move.
export const RELEASE_MS = 300;
const UNDO_DEPTH = 32;

const snapshotOf = (song) => structuredClone({ tracks: song.tracks, length: song.length, loopStart: song.loopStart, loopEnd: song.loopEnd });

export class SongPlayer {
  constructor(state) {
    this.state = state;
    this.cursor = {};
    // Recording passes: a pass runs from where recording starts (or the loop's
    // A) to the loop's B, a seek or stop. Every control touched in it is
    // overridden: its old events are dropped as playback reaches them and its
    // new moves written. LATCH holds the last value to the end of the pass;
    // TOUCH lets go RELEASE_MS after the last move. Either way the old curve
    // takes over again afterwards.
    this.inPass = false;
    this.dirty = false; // the current pass wrote something
    this.snapshot = null; // the song as the current pass found it
    this.overrides = new Map(); // key -> { mode, before, last, moved }
    this.undoStack = [];
  }

  get song() {
    return this.state.song;
  }

  // Jump to `tick`: put every automated control in the state it would have
  // there, then continue playback from that point.
  chase(tick) {
    for (const id of TRACK_IDS) {
      const events = this.song.tracks[id];
      const keys = new Set(events.map((e) => e.key));
      for (const key of keys) {
        const value = valueAt(events, key, tick);
        if (value !== undefined) applyEvent(this.state, id, { key, value });
      }
      let i = 0;
      while (i < events.length && events[i].tick <= tick) i++;
      this.cursor[id] = i;
    }
  }

  // After the song was edited under playback: point each track's cursor past
  // `tick` again, without applying anything.
  resync(tick) {
    for (const id of TRACK_IDS) {
      const events = this.song.tracks[id];
      let i = 0;
      while (i < events.length && events[i].tick <= tick) i++;
      this.cursor[id] = i;
    }
  }

  // Before an arrangement edit: the song as it is, for UNDO (shared with passes).
  checkpoint() {
    this.pushUndo(snapshotOf(this.song));
  }

  // After a pattern tool rewrote a pattern: the pattern as it was.
  checkpointPattern({ id, index, before }) {
    this.pushUndo({ pattern: { id, index, before } });
  }

  pushUndo(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
  }

  // Apply events with tick <= `tick` that haven't been applied yet.
  // Returns the device ids whose pattern changed (their step position resets).
  advance(tick) {
    const changed = [];
    for (const id of TRACK_IDS) {
      const events = this.song.tracks[id];
      let i = this.cursor[id] ?? 0;
      while (i < events.length && events[i].tick <= tick) {
        const e = events[i];
        const o = this.overrides.get(e.key);
        // Overwritten by the pass being recorded.
        if (o && e.tick > o.last && trackFor(e.key) === id) {
          events.splice(i, 1);
          continue;
        }
        i++;
        applyEvent(this.state, id, e);
        if (e.key === 'pattern') changed.push(id);
      }
      this.cursor[id] = i;
    }
    return changed;
  }

  startPass(tick) {
    this.passStart = tick;
    this.inPass = true;
    this.dirty = false;
    this.snapshot = snapshotOf(this.song);
    this.overrides.clear();
  }

  // Ends the pass at `tick`: every overridden control returns to the curve it
  // had before the pass. A pass that wrote something can be undone.
  endPass(tick) {
    if (!this.inPass) return;
    for (const key of [...this.overrides.keys()]) this.release(key, tick);
    if (this.dirty) {
      this.undoStack.push(this.snapshot);
      if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
    }
    this.inPass = false;
    this.dirty = false;
    this.snapshot = null;
  }

  // TOUCH: let go of controls that stopped moving.
  releaseIdle(now, tick) {
    for (const [key, o] of this.overrides) {
      if (o.mode === 'touch' && now - o.moved >= RELEASE_MS) this.release(key, tick);
    }
  }

  // Back to the curve the control had before this pass, from `tick` on.
  release(key, tick) {
    const o = this.overrides.get(key);
    this.overrides.delete(key);
    const id = trackFor(key);
    const at = Math.max(tick, o.last + 1);
    const value = valueAt(this.snapshot.tracks[id], key, at) ?? o.before;
    if (value === undefined || value === valueAt(this.song.tracks[id], key, o.last)) return;
    this.write(id, { tick: at, key, value });
    applyEvent(this.state, id, { key, value });
  }

  canUndo() {
    return (this.inPass && this.dirty) || this.undoStack.length > 0;
  }

  // Undoes the pass being recorded if it wrote anything, else the last finished
  // one. The caller chases the new song to the current position.
  undo() {
    let snap;
    if (this.inPass && this.dirty) snap = this.snapshot;
    else snap = this.undoStack.pop();
    if (!snap) return false;
    if (snap.pattern) {
      const { id, index, before } = snap.pattern;
      this.state.device(id).patterns[index] = before;
      return true;
    }
    // A fresh object, so views caching per song see the change.
    this.state.song = structuredClone(snap);
    this.overrides.clear();
    this.dirty = false;
    if (this.inPass) this.snapshot = snapshotOf(this.song);
    return true;
  }

  clearPasses() {
    this.inPass = false;
    this.dirty = false;
    this.snapshot = null;
    this.overrides.clear();
    this.undoStack = [];
  }

  // A user move while recording: the control is overridden for the rest of the
  // pass (LATCH) or until it's let go (TOUCH). `prev` is its value before the
  // first move, for controls the song never automated.
  record(key, value, tick, { mode = 'latch', prev, now = performance.now() } = {}) {
    const id = trackFor(key);
    let o = this.overrides.get(key);
    if (!o) {
      o = { mode, before: valueAt(this.song.tracks[id], key, tick) ?? prev, last: tick };
      this.overrides.set(key, o);
    }
    if (o.last < tick) eraseRange(this.song.tracks[id], o.last + 1, tick, (k) => k === key);
    o.last = tick;
    o.moved = now;
    this.dirty = true;
    this.write(id, { tick, key, value });
  }

  write(id, event) {
    const events = this.song.tracks[id];
    writeEvent(events, event);
    this.cursor[id] = events.findIndex((e) => e.tick > event.tick);
    if (this.cursor[id] < 0) this.cursor[id] = events.length;
    this.extend(event.tick);
  }

  recordPattern(id, index, tick) {
    if (this.inPass) this.dirty = true;
    this.write(id, { tick, key: 'pattern', value: index });
  }

  extend(tick) {
    const end = (Math.floor(tick / TICKS_PER_BAR) + 1) * TICKS_PER_BAR;
    if (end <= this.song.length) return;
    if (this.song.loopEnd === this.song.length) this.song.loopEnd = end;
    this.song.length = end;
  }
}
