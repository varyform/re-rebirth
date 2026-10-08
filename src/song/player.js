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

export class SongPlayer {
  constructor(state) {
    this.state = state;
    this.cursor = {};
    this.lastWrite = new Map();
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
    this.lastWrite.clear();
  }

  // Apply events with tick <= `tick` that haven't been applied yet.
  // Returns the device ids whose pattern changed (their step position resets).
  advance(tick) {
    const changed = [];
    for (const id of TRACK_IDS) {
      const events = this.song.tracks[id];
      let i = this.cursor[id] ?? 0;
      while (i < events.length && events[i].tick <= tick) {
        const e = events[i++];
        applyEvent(this.state, id, e);
        if (e.key === 'pattern') changed.push(id);
      }
      this.cursor[id] = i;
    }
    return changed;
  }

  // Overdub: a user move writes an event and wipes this key's older automation
  // between the previous write and now, like riding a fader over a take.
  record(key, value, tick) {
    const id = trackFor(key);
    const events = this.song.tracks[id];
    const from = this.lastWrite.get(key);
    if (from !== undefined && from < tick) eraseRange(events, from + 1, tick, (k) => k === key);
    writeEvent(events, { tick, key, value });
    this.lastWrite.set(key, tick);
    this.cursor[id] = events.findIndex((e) => e.tick > tick);
    if (this.cursor[id] < 0) this.cursor[id] = events.length;
    this.extend(tick);
  }

  recordPattern(id, index, tick) {
    const events = this.song.tracks[id];
    writeEvent(events, { tick, key: 'pattern', value: index });
    this.cursor[id] = events.findIndex((e) => e.tick > tick);
    if (this.cursor[id] < 0) this.cursor[id] = events.length;
    this.extend(tick);
  }

  extend(tick) {
    const end = (Math.floor(tick / TICKS_PER_BAR) + 1) * TICKS_PER_BAR;
    if (end <= this.song.length) return;
    if (this.song.loopEnd === this.song.length) this.song.loopEnd = end;
    this.song.length = end;
  }
}
