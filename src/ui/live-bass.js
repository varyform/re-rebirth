// Playing the bass lines live from MIDI keys: a note sounds while its key is
// down, mono with the last key winning. A key pressed while another is still
// down glides to its note without restarting the envelopes (a slide); letting go
// of it glides back to the key still held. Velocity above ACCENT_VELOCITY
// accents (the caller decides).
//
// In PATTERNS, with the pattern playing and live recording armed (R), what's
// played is written into the shown pattern as it goes round, each note on the
// step it's nearest to: a key held over several steps becomes a held note
// (slide + ties), a legato key a slide into the next note. Steps not played keep
// what they had, so takes overdub. One undo per pattern for each armed take.
import { stepTarget } from './step-keys.js';

export class LiveBass {
  constructor(state, engine, clock) {
    Object.assign(this, { state, engine, clock });
    this.keys = new Map(); // bass id -> [{ midi, step }] held, oldest first
    this.takes = new Map(); // bass id -> the note being recorded: { pos, time, stepDur }
    this.saved = new Set(); // "id:index" patterns with an undo point this take
  }

  get armed() {
    return !!this.state.ui.liveRec;
  }

  // R in PATTERNS. Arming starts a new take: the next write leaves an undo point.
  toggleRec() {
    this.state.ui.liveRec = !this.armed;
    this.saved.clear();
  }

  recording(id) {
    return this.armed && this.state.transport.playing && stepTarget(this.state) === id;
  }

  noteOn(id, midi, step) {
    const held = this.keys.get(id) ?? [];
    this.keys.set(id, held);
    const legato = held.length > 0;
    held.push({ midi, step });
    this.engine.liveBass(id, step, legato);
    if (this.recording(id)) this.record(id, step, legato);
  }

  noteOff(midi) {
    for (const [id, held] of this.keys) {
      const i = held.findIndex((k) => k.midi === midi);
      if (i < 0) continue;
      const top = i === held.length - 1;
      held.splice(i, 1);
      if (!top) continue;
      if (held.length) {
        const { step } = held.at(-1);
        this.engine.liveBass(id, step, true);
        if (this.recording(id)) this.record(id, step, true);
      } else {
        this.engine.liveBassOff(id);
        this.endTake(id, this.engine.heardTime());
      }
    }
  }

  record(id, step, legato) {
    const at = this.clock.nearestStep(id, this.engine.heardTime());
    if (!at) return;
    const pattern = this.writable(id);
    const take = this.takes.get(id);
    if (legato && take) this.holdUntil(id, take, at.pos, true);
    pattern.steps[at.pos] = { ...pattern.steps[at.pos], note: step.note, octave: step.octave, accent: step.accent, gate: true, tie: false, slide: false };
    this.takes.set(id, at);
  }

  // The note being recorded is let go at audio time `time`: held over at least
  // one and a half steps, it becomes a held note across the steps it covered.
  endTake(id, time) {
    const take = this.takes.get(id);
    this.takes.delete(id);
    if (!take || !this.recording(id)) return;
    const steps = Math.round((time - take.time) / take.stepDur);
    if (steps < 2) return;
    const len = this.state.pattern(id).length;
    this.holdUntil(id, take, (take.pos + Math.min(steps, len - 1)) % len, false);
  }

  // Ties after the take's note up to step `pos` (not included); with `slideInto`,
  // the last of them slides into the note at `pos`.
  holdUntil(id, take, pos, slideInto) {
    const pattern = this.writable(id);
    const len = pattern.length;
    const gap = (pos - take.pos + len) % len;
    if (gap === 0) return;
    const at = (k) => pattern.steps[(take.pos + k) % len];
    for (let k = 1; k < gap; k++) Object.assign(at(k), { gate: true, tie: true, accent: false, slide: false });
    // Each step but the last holds on into the next (a tie follows a slide).
    for (let k = 0; k < gap - 1; k++) at(k).slide = true;
    at(gap - 1).slide = slideInto;
  }

  // The shown pattern, with an undo point the first time this take writes to it.
  writable(id) {
    const index = this.state.patternIndex(id);
    const pattern = this.state.pattern(id);
    const key = `${id}:${index}`;
    if (!this.saved.has(key)) {
      this.saved.add(key);
      this.state.emit('patternEdit', { id, index, before: structuredClone(pattern) });
    }
    return pattern;
  }
}
