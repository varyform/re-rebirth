// Song arrangement, modelled like a ReBirth song: per-track lists of timed
// controller events (pattern changes, knob moves, mutes). Positions are in
// ticks of 1/32 note: 2 per step, 32 per bar.
//
// Event: { tick, key, value }
//   key "pattern"  -> value = pattern index 0..31 (device tracks)
//   key "enabled"  -> value = 0/1
//   other keys     -> state param key (e.g. "bass1.cutoff"), value 0..1
//                     or an fx field ("fx.compTarget") with a string value

export const TICKS_PER_STEP = 2;
export const TICKS_PER_BAR = 32;
export const TRACK_IDS = ['mixer', 'bass1', 'bass2', 'r808', 'r909', 'fx'];

export function emptySong() {
  return {
    tracks: Object.fromEntries(TRACK_IDS.map((id) => [id, []])),
    length: 0, // ticks; 0 = no arrangement recorded yet
    loopStart: 0,
    loopEnd: 0,
  };
}

// Value of `key` on a track at `tick` (last event at or before it).
export function valueAt(events, key, tick) {
  let value;
  for (const e of events) {
    if (e.tick > tick) break;
    if (e.key === key) value = e.value;
  }
  return value;
}

// Insert keeping events sorted; an event at the same tick and key replaces the old one.
export function writeEvent(events, event) {
  let i = events.length;
  while (i > 0 && events[i - 1].tick > event.tick) i--;
  const same = events.findIndex((e) => e.tick === event.tick && e.key === event.key);
  if (same >= 0) events[same] = event;
  else events.splice(i, 0, event);
}

// Removes events in [from, to) for keys matching `match` (overdub punch-in).
export function eraseRange(events, from, to, match) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.tick >= from && e.tick < to && match(e.key)) events.splice(i, 1);
  }
}

// Every key the song moves (pattern changes excluded): one with two or more
// values, or a single one set after the start. ReBirth songs record a starting
// value for many knobs that then never change; those don't count. Cached per
// song until its event count changes (recording, undo, another song).
const automatedCache = new WeakMap();
export function automatedKeys(song) {
  const stamp = TRACK_IDS.map((id) => song.tracks[id].length).join(',');
  const hit = automatedCache.get(song);
  if (hit?.stamp === stamp) return hit.keys;
  const first = new Map(); // key -> its first event
  const keys = new Set();
  for (const id of TRACK_IDS) {
    for (const e of song.tracks[id]) {
      if (e.key === 'pattern' || keys.has(e.key)) continue;
      const f = first.get(e.key);
      if (!f) {
        first.set(e.key, e);
        if (e.tick > 0) keys.add(e.key);
      } else if (e.value !== f.value) keys.add(e.key);
    }
  }
  automatedCache.set(song, { stamp, keys });
  return keys;
}

export function songBars(song) {
  return Math.ceil(song.length / TICKS_PER_BAR);
}
