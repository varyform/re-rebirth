// Lookahead step scheduler on the AudioContext clock: a timer queues steps a
// little ahead with sample-accurate times, and the UI catches up per frame by
// popping steps whose time has passed — so lights match what you hear.
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const INTERVAL = 25; // ms between scheduler runs
const START_DELAY = 0.05;

export class Clock {
  constructor(state, engine) {
    this.state = state;
    this.engine = engine;
    this.pos = 0; // in steps since bar 1
    this.queue = [];
    this.timer = 0;
  }

  get t() {
    return this.state.transport;
  }

  play() {
    if (this.t.playing) return;
    const ctx = this.engine.start();
    this.t.playing = true;
    this.pos = (this.t.bar - 1) * 16;
    this.nextTime = ctx.currentTime + START_DELAY;
    this.queue = [];
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
    } else {
      this.t.bar = 1;
    }
    this.t.step = -1;
  }

  toggle() {
    if (this.t.playing) this.stop();
    else this.play();
  }

  seekBar(delta) {
    const bar = Math.max(1, this.t.bar + delta);
    this.pos = (bar - 1) * 16 + (this.pos % 16);
    this.t.bar = bar;
  }

  schedule = () => {
    const { ctx } = this.engine;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      const stepDur = this.engine.stepDuration();
      const step = this.pos % 16;
      this.engine.playStep(step, this.nextTime, stepDur);
      this.queue.push({ time: this.nextTime, step, bar: Math.floor(this.pos / 16) + 1 });
      this.pos++;
      this.nextTime += stepDur;
    }
  };

  // Per animation frame: advance the displayed position. Returns true if it moved.
  update() {
    if (!this.t.playing || !this.queue.length) return false;
    const { ctx } = this.engine;
    const heard = ctx.currentTime - (ctx.outputLatency || 0);
    let moved = false;
    while (this.queue.length && this.queue[0].time <= heard) {
      const { step, bar } = this.queue.shift();
      this.t.step = step;
      this.t.bar = bar;
      moved = true;
    }
    return moved;
  }
}
