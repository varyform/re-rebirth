// Lookahead step scheduler on the AudioContext clock: a timer queues steps a
// little ahead with sample-accurate times, and the UI catches up per frame by
// popping steps whose time has passed, so lights match what you hear.
//
// Each device keeps its own position because pattern lengths (1–16) differ.
// Pattern picks made while playing wait for the end of the current pattern.
import { SongPlayer } from '../song/player.js';
import { TICKS_PER_BAR, TICKS_PER_STEP, valueAt } from '../song/song.js';
import { DEVICE_IDS } from '../state.js';

const LOOKAHEAD = 0.12; // seconds scheduled ahead
const INTERVAL = 25; // ms between scheduler runs
const START_DELAY = 0.05;

// Song-file controls only; local monitoring (mute/solo, master) isn't recorded.
const UNRECORDED = /^(master\.|song\.|mixer\.(master|delayReturn)|mixer\.\w+\.(mute|solo))/;

export class Clock {
  constructor(state, engine) {
    this.state = state;
    this.engine = engine;
    this.player = new SongPlayer(state);
    this.pos = 0; // song position in steps
    this.devPos = {};
    this.queue = [];
    this.timer = 0;
    state.on((type, d) => this.onStateChange(type, d));
  }

  get t() {
    return this.state.transport;
  }

  get songMode() {
    return this.t.mode === 'song';
  }

  get recording() {
    return this.t.playing && this.t.rec && this.songMode;
  }

  play() {
    if (this.t.playing) return;
    const ctx = this.engine.start();
    this.t.playing = true;
    this.jump((this.t.bar - 1) * 16);
    this.nextTime = ctx.currentTime + START_DELAY;
    this.queue = [];
    this.endAt = null;
    this.schedule();
    this.timer = setInterval(this.schedule, INTERVAL);
  }

  // Stop twice to rewind to the start, like a hardware transport.
  stop() {
    if (this.t.playing) {
      this.t.playing = false;
      clearInterval(this.timer);
      this.queue = [];
      this.engine.stop();
      for (const id of DEVICE_IDS) this.state.device(id).queued = null;
    } else {
      this.t.bar = 1;
      if (this.songMode) this.player.chase(0);
    }
    this.t.step = -1;
    this.t.rec = false;
  }

  toggle() {
    if (this.t.playing) this.stop();
    else this.play();
  }

  seekBar(delta) {
    // While playing, the displayed bar trails the scheduler by the lookahead, so
    // repeated seeks (held REW/FF) count from the scheduler's position.
    const from = this.t.playing ? Math.floor(this.pos / 16) + 1 : this.t.bar;
    const song = this.state.song;
    const last = this.songMode && song.length ? Math.ceil(song.length / TICKS_PER_BAR) : Infinity;
    const bar = Math.min(last, Math.max(1, from + delta));
    this.t.bar = bar;
    if (this.t.playing) {
      // Steps already queued still play; the jump lands right after them.
      this.jump((bar - 1) * 16);
    } else if (this.songMode) {
      this.player.chase((bar - 1) * 16 * TICKS_PER_STEP);
    }
  }

  setMode(mode) {
    if (this.t.mode === mode) return;
    this.t.mode = mode;
    if (mode === 'song') this.player.chase(this.pos * TICKS_PER_STEP);
    else this.t.rec = false;
  }

  jump(pos) {
    this.pos = pos;
    for (const id of DEVICE_IDS) this.devPos[id] = 0;
    if (this.songMode) this.player.chase(pos * TICKS_PER_STEP);
  }

  schedule = () => {
    const { ctx } = this.engine;
    const { state } = this;
    const song = state.song;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD && this.endAt === null) {
      let tick = this.pos * TICKS_PER_STEP;
      // While recording the song grows with the take instead of ending.
      if (this.recording) this.player.extend(tick);
      else if (this.songMode && song.length) {
        const loop = this.t.loop && song.loopEnd > song.loopStart;
        if (loop && tick >= song.loopEnd) {
          this.jump(song.loopStart / TICKS_PER_STEP);
          tick = this.pos * TICKS_PER_STEP;
        } else if (!loop && tick >= song.length) {
          this.endAt = this.nextTime;
          break;
        }
      }
      if (this.songMode) for (const id of this.player.advance(tick)) this.devPos[id] = 0;
      for (const id of DEVICE_IDS) this.applyQueued(id, tick);

      const stepDur = this.engine.stepDuration();
      const positions = { ...this.devPos };
      this.engine.playStep(positions, this.nextTime, stepDur);
      this.queue.push({ time: this.nextTime, pos: this.pos, positions });

      for (const id of DEVICE_IDS) this.devPos[id] = (this.devPos[id] + 1) % state.pattern(id).length;
      this.pos++;
      this.nextTime += stepDur;
    }
  };

  applyQueued(id, tick) {
    const dev = this.state.device(id);
    if (dev.queued === null || this.devPos[id] !== 0) return;
    const index = dev.queued;
    this.state.selectPattern(id, index);
    if (this.recording) this.player.recordPattern(id, index, Math.floor(tick / TICKS_PER_BAR) * TICKS_PER_BAR);
  }

  // Overdub user moves into the song while recording.
  onStateChange(type, d) {
    if (type === 'reset') {
      this.pos = 0;
      this.t.bar = 1;
      if (this.songMode) this.player.chase(0);
      return;
    }
    if (type !== 'param' || d.source !== 'user' || !this.recording || UNRECORDED.test(d.key)) return;
    this.player.record(d.key, d.value, this.heardTick());
  }

  // Arming REC switches to song mode. Devices without a pattern event yet get
  // their current pattern written at this bar so the take plays back as heard.
  setRec(on) {
    this.t.rec = on;
    if (!on) return;
    this.setMode('song');
    const bar = Math.max(0, this.t.bar - 1) * TICKS_PER_BAR;
    for (const id of DEVICE_IDS) {
      if (valueAt(this.state.song.tracks[id], 'pattern', bar) === undefined) {
        this.player.recordPattern(id, this.state.patternIndex(id), bar);
      }
    }
  }

  heardTick() {
    return Math.max(0, this.t.bar - 1) * TICKS_PER_BAR + Math.max(0, this.t.step) * TICKS_PER_STEP;
  }

  // Per animation frame: advance the displayed position. Returns true if it moved.
  update() {
    if (!this.t.playing) return false;
    const { ctx } = this.engine;
    const heard = ctx.currentTime - (ctx.outputLatency || 0);
    if (this.endAt !== null && heard >= this.endAt) {
      this.stop();
      return true;
    }
    let moved = false;
    while (this.queue.length && this.queue[0].time <= heard) {
      const { pos, positions } = this.queue.shift();
      this.t.step = pos % 16;
      this.t.bar = Math.floor(pos / 16) + 1;
      this.t.positions = positions;
      moved = true;
    }
    return moved;
  }
}
