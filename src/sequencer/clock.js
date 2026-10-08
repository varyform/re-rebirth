// Visual 16th-note clock driven by requestAnimationFrame. Placeholder until the
// audio engine schedules steps from the AudioContext clock.
export class Clock {
  constructor(state, onTick) {
    this.state = state;
    this.onTick = onTick;
    this.pos = 0; // in steps since bar 1
    this.raf = 0;
  }

  get t() {
    return this.state.transport;
  }

  play() {
    if (this.t.playing) return;
    this.t.playing = true;
    this.pos = (this.t.bar - 1) * 16;
    this.t.step = -1;
    this.last = performance.now();
    this.sync();
    this.raf = requestAnimationFrame(this.frame);
  }

  // Stop twice to rewind to the start, like a hardware transport.
  stop() {
    if (this.t.playing) {
      this.t.playing = false;
      cancelAnimationFrame(this.raf);
    } else {
      this.t.bar = 1;
    }
    this.t.step = -1;
    this.onTick();
  }

  toggle() {
    if (this.t.playing) this.stop();
    else this.play();
  }

  seekBar(delta) {
    const bar = Math.max(1, this.t.bar + delta);
    this.pos = (bar - 1) * 16 + (this.pos % 16);
    this.t.bar = bar;
    if (this.t.playing) this.sync();
    else this.onTick();
  }

  frame = (now) => {
    this.pos += (now - this.last) / (60000 / this.t.tempo / 4);
    this.last = now;
    this.sync();
    this.raf = requestAnimationFrame(this.frame);
  };

  sync() {
    const n = Math.floor(this.pos);
    const step = n % 16;
    const bar = Math.floor(n / 16) + 1;
    if (step === this.t.step && bar === this.t.bar) return;
    this.t.step = step;
    this.t.bar = bar;
    this.onTick();
  }
}
