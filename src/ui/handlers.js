// Handler factories for hit regions.
//
// Handler shape: { cursor, key?, down(ev) -> session?, wheel?(ev), dblclick?() }
// Session shape: { move?(ev), up?() }
// ev: { p, p0, prev (local units), ddy (CSS px since last move), fine (shift held), delta (wheel) }

const KNOB_PX = 200; // CSS pixels of vertical drag for a full sweep
const FINE = 6;

const scaled = (px, fine) => px / (KNOB_PX * (fine ? FINE : 1));

export function knobDrag(state, param) {
  return {
    cursor: 'ns-resize',
    down: () => ({ move: (ev) => state.set(param, state.get(param) - scaled(ev.ddy, ev.fine)) }),
    wheel: (ev) => state.set(param, state.get(param) - scaled(ev.delta, ev.fine) / 4),
    dblclick: () => state.reset(param),
  };
}

// Drags in local units so the cap stays under the pointer at any zoom.
export function faderDrag(state, param, travel) {
  return {
    cursor: 'ns-resize',
    down: () => ({
      move: (ev) => state.set(param, state.get(param) - (ev.p.y - ev.prev.y) / (travel * (ev.fine ? FINE : 1))),
    }),
    wheel: (ev) => state.set(param, state.get(param) - scaled(ev.delta, ev.fine) / 4),
    dblclick: () => state.reset(param),
  };
}

export function click(fn, key) {
  return {
    cursor: 'pointer',
    key,
    down: (ev) => {
      fn(ev);
      return {};
    },
  };
}

export const toggle = (state, param, key) => click(() => state.toggle(param), key);

const REPEAT_DELAY = 400; // ms before a held button starts repeating
const REPEAT_EVERY = 120; // ms between repeats
// Repeats per tick by seconds held: speeds up the longer the button is down.
const REPEAT_RAMP = [
  [0, 1],
  [1.2, 2],
  [2.4, 4],
  [3.6, 8],
];

// Button that acts once on press, then repeats with growing steps while held.
// fn(count) receives how many units to move this time.
export function repeat(fn, key) {
  return {
    cursor: 'pointer',
    key,
    down(ev) {
      fn(1);
      const start = performance.now();
      let timer = setTimeout(function tick() {
        const held = (performance.now() - start) / 1000;
        const count = REPEAT_RAMP.findLast(([from]) => held >= from)[1];
        fn(count);
        ev.redraw?.();
        timer = setTimeout(tick, REPEAT_EVERY);
      }, REPEAT_DELAY);
      return { up: () => clearTimeout(timer) };
    },
  };
}

const stepIndex = (x, x0, stepW, count) => {
  const i = Math.floor((x - x0) / stepW);
  return i >= 0 && i < count ? i : -1;
};

// Click a step to flip it; keep dragging to paint the same value across steps.
// Fast drags can skip steps between move events, so fill the whole span.
export function paintSteps({ x0, stepW, count = 16, get, set, after }) {
  return {
    cursor: 'pointer',
    down(ev) {
      const i = stepIndex(ev.p.x, x0, stepW, count);
      if (i < 0) return null;
      const value = !get(i);
      set(i, value);
      after?.(i);
      let last = i;
      return {
        move(ev) {
          const j = stepIndex(ev.p.x, x0, stepW, count);
          if (j < 0 || j === last) return;
          const dir = Math.sign(j - last);
          for (let k = last + dir; k !== j + dir; k += dir) set(k, value);
          after?.(j);
          last = j;
        },
      };
    },
  };
}

// Click/drag along a row to pick a step.
export function scrubSteps({ x0, stepW, count = 16, pick }) {
  const at = (ev) => {
    const i = stepIndex(ev.p.x, x0, stepW, count);
    if (i >= 0) pick(i);
  };
  return {
    cursor: 'pointer',
    down(ev) {
      at(ev);
      return { move: at };
    },
  };
}
