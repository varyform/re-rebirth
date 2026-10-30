// Focus stages: the one instrument being worked on, as large as the window
// allows, in its stacked layout (full-width step grid; the drum machines
// always show all lanes). Around it, chrome that keeps one size whatever the
// stage or instrument: the stage bar on top, the instrument rail down the
// left, and in AUTOMATE the loop timeline above the instrument.
import { BASS_IDS } from '../state.js';
import { BASS_STACKED_MIN, Bassline } from './devices/bassline.js';
import { CHANNELS } from '../channels.js';
import { Arrange } from './devices/arrange.js';
import { ChannelStrip, STRIP_W } from './devices/channel-strip.js';
import { DRUM_STACKED_MIN, DrumMachine, R808, R909 } from './devices/drum-machine.js';
import { EffectsColumn } from './devices/effects.js';
import { PatternPicker } from './devices/pattern-picker.js';
import { Rail, RAIL_STRIPS, RAIL_W } from './devices/rail.js';
import { keysHint, STAGE_BAR_H, STAGE_BAR_MIN_W, StageBar } from './devices/stage-bar.js';
import { Timeline, TIMELINE_H } from './devices/timeline.js';
import { MONO, restoreLineScale, rgba, rrect, setLineScale, setPanelRadiusScale, text, textWidth } from './primitives.js';
import { drawRackRail, RACK_RAIL_W } from './rack-rail.js';
import { C } from './theme.js';
import { drawWindows } from './windows.js';

const MARGIN = 6;
const GAP = 6;
// Chrome left of the instrument (the instrument rail), and on top of it. The
// rack's metal rails and its top and bottom margins frame all of it, at the
// rack's own scale (main.js resize passes the frame in).
const CHROME_LEFT = RAIL_W;
const BAR_BOTTOM = STAGE_BAR_H;
const DRUMS = { r808: R808, r909: R909 };
// The stage bar, rail and timeline at this share of the size PATTERNS with a bass
// line would give them: smaller than the instrument, which keeps the room.
const CHROME_SIZE = 0.75;

// Kept as a list: the layout code stacks any number of devices.
export const shownDevices = (state) => [RAIL_STRIPS.some(([id]) => id === state.ui.show) ? state.ui.show : RAIL_STRIPS[0][0]];
const minSize = (id) => (DRUMS[id] ? DRUM_STACKED_MIN : BASS_STACKED_MIN);
// Devices only; the chrome is sized apart (see main.js resize).
function devicesSize(ids) {
  const sizes = ids.map(minSize);
  const w = Math.max(...sizes.map((s) => s.w)) + MARGIN * 2;
  const h = sizes.reduce((sum, s) => sum + GAP + s.h, 0) + MARGIN;
  return { w, h };
}

class FocusView {
  static timeline = false;

  static key(state) {
    return `${this.stage}:${shownDevices(state).join('+')}`;
  }

  // The body's minimum size, margins included (the instrument shown, here).
  static minBody(state) {
    return devicesSize(shownDevices(state));
  }

  static chromeH() {
    return BAR_BOTTOM + (this.timeline ? GAP + TIMELINE_H : 0);
  }

  // Two scales. The chrome takes the scale PATTERNS with one bass line would
  // get, whatever the stage or instrument, so it never changes size; the
  // devices take whatever scale fits the room left beside and under this
  // stage's chrome. Either way they then stretch to fill the window.
  static size(state) {
    const bass = devicesSize(['bass1']);
    return {
      min: this.minBody(state),
      chrome: this.chromeH(),
      chromeLeft: CHROME_LEFT,
      chromeW: STAGE_BAR_MIN_W,
      reference: { w: CHROME_LEFT + bass.w, h: BAR_BOTTOM + bass.h },
      rackFrame: true,
      stretch: { w: Infinity, h: Infinity },
      // Under the AUTOMATE timeline a short window can need a bit under 1:1;
      // still bigger than in the rack.
      minScale: 0.5,
      chromeSize: CHROME_SIZE,
    };
  }

  // chromeScale: chrome units per view unit. frame: the rack rails' width and the
  // top/bottom margin, in view units.
  constructor(state, app, width, height, chromeScale = 1, frame = { x: 0, y: 0 }) {
    const V = this.constructor;
    Object.assign(this, { state, app, width, height, frame, key: V.key(state) });
    const innerW = width - frame.x * 2;
    const innerH = height - frame.y * 2;
    // A narrow canvas (stretch limit) can't fit the chrome at full size: shrink it.
    const k = Math.min(chromeScale, innerW / STAGE_BAR_MIN_W);
    this.chromeScale = chromeScale;
    this.k = k;
    const ids = shownDevices(state);
    state.ui.show = ids[0]; // a choice saved by an older version ("1 + 2")

    // Chrome, in chrome units from the frame's inner corner: the bar across, the
    // rail from under it to the bottom, the timeline right of the rail.
    const W = innerW / k;
    const H = innerH / k;
    const rightX = CHROME_LEFT + GAP;
    this.chrome = [new StageBar(state, app, 0, 0, W), new Rail(state, app, 0, BAR_BOTTOM + GAP, RAIL_W, H - BAR_BOTTOM - GAP)];
    if (V.timeline) this.chrome.push(new Timeline(state, app, rightX, BAR_BOTTOM + GAP, W - rightX, TIMELINE_H, ids));

    // The body: everything right of the rail and under the chrome, up to the
    // frame. Its gaps are in chrome units, so they match the chrome's own.
    const x = frame.x + (CHROME_LEFT + GAP) * k;
    const y = frame.y + (V.chromeH() + GAP) * k;
    this.body = { x, y, w: width - frame.x - x, h: height - frame.y - y };
    this.devices = this.buildBody(this.body);
  }

  // The instrument(s) shown, stacked; extra height in proportion to their
  // minimum heights.
  buildBody({ x, y, w, h: bodyH }) {
    const { state, app } = this;
    const V = this.constructor;
    const ids = shownDevices(state);
    const mins = ids.map((id) => minSize(id).h);
    const room = bodyH - GAP * (ids.length - 1);
    const total = mins.reduce((a, b) => a + b, 0);
    return ids.map((id, i) => {
      const h = (room * mins[i]) / total;
      const d = DRUMS[id]
        ? new DrumMachine(state, app, x, y, w, h, DRUMS[id], { stacked: true })
        : new Bassline(state, app, x, y, w, h, {
          id,
          number: BASS_IDS.indexOf(id) + 1,
          stacked: true,
          // Typing notes works in PATTERNS: say how, where the subtitle goes.
          subtitle: V.stage === 'patterns' ? () => keysHint(state) : null,
        });
      y += h + GAP;
      return d;
    });
  }

  // chromeScale: device pixels per chrome unit (see main.js render).
  draw(ctx, { chromeScale }) {
    const { state } = this;
    ctx.fillStyle = C.rackBg;
    ctx.fillRect(0, 0, this.width, this.height);
    // The rack's rails, at the rack's scale.
    const { frame, k } = this;
    if (frame.x) {
      const r = frame.x / RACK_RAIL_W; // view units per rack unit
      const s = (chromeScale / k) * r;
      ctx.save();
      ctx.setTransform(s, 0, 0, s, 0, 0);
      const railLines = setLineScale(ctx);
      drawRackRail(ctx, 0, this.height / r);
      drawRackRail(ctx, this.width / r - RACK_RAIL_W, this.height / r);
      restoreLineScale(railLines);
      ctx.restore();
    }
    ctx.save();
    ctx.setTransform(chromeScale, 0, 0, chromeScale, (frame.x * chromeScale) / k, (frame.y * chromeScale) / k);
    const lines = setLineScale(ctx);
    for (const d of this.chrome) drawAt(ctx, d);
    restoreLineScale(lines);
    ctx.restore();
    // The pattern picker takes the instrument's place (see rail.js). Panel
    // corners round like the chrome's.
    const radius = setPanelRadiusScale(this.k);
    if (state.ui.picker) {
      const { x, y, w, h } = this.body;
      drawAt(ctx, new PatternPicker(state, this.app, x, y, w, h, shownDevices(state)[0]));
    } else {
      for (const d of this.devices) drawAt(ctx, d);
    }
    setPanelRadiusScale(radius);
    // Notices (the rack shows them in its song display), at chrome size.
    const notice = state.notice && performance.now() < state.notice.until ? state.notice.text : null;
    if (notice) {
      ctx.save();
      ctx.setTransform(chromeScale, 0, 0, chromeScale, 0, 0);
      const toastLines = setLineScale(ctx);
      drawToast(ctx, notice, this.width / this.k, this.height / this.k);
      restoreLineScale(toastLines);
      ctx.restore();
    }
    drawWindows(ctx, this.width, this.height, state, this.app);
  }
}

function drawToast(ctx, message, w, h) {
  const opts = { size: 7, weight: 800, family: MONO, color: C.lcdGreenOn };
  const tw = Math.min(w - 40, textWidth(ctx, message, opts) + 20);
  const x = (w - tw) / 2;
  const y = h - 34;
  rrect(ctx, x, y, tw, 20, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fill();
  ctx.strokeStyle = rgba(C.lcdGreenOn, 0.5);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  text(ctx, message, w / 2, y + 10.5, opts);
}

function drawAt(ctx, d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  d.draw(ctx);
  ctx.restore();
}

export class PatternsView extends FocusView {
  static stage = 'patterns';
}

// ARRANGE: the song's pattern rows; the device scale is PATTERNS' own.
export class ArrangeView extends FocusView {
  static stage = 'arrange';

  static key() {
    return 'arrange';
  }

  static minBody() {
    return devicesSize(['bass1']);
  }

  buildBody({ x, y, w, h }) {
    return [new Arrange(this.state, this.app, x, y, w, h)];
  }
}

export class AutomateView extends FocusView {
  static stage = 'automate';
  static timeline = true;
}

// MIX & MASTER: the four channel strips side by side, long faders, and the
// effects and master column beside them, as large as the window allows. The
// rail stays for ON switches and meters.
const MIX_STRIPS_W = STRIP_W * 4 + GAP * 3;
const MIX_FX_W = 300;
const MIX_MIN = { w: MIX_STRIPS_W + GAP + MIX_FX_W, h: 480 };

export class MixView extends FocusView {
  static stage = 'mix';

  static key() {
    return 'mix';
  }

  static minBody() {
    return { w: MIX_MIN.w + MARGIN * 2, h: MIX_MIN.h + MARGIN };
  }

  // Strips keep their width (their controls don't spread); the effects column
  // takes the extra width, and everything the extra height. The effects get
  // the column's rows like the rack's instrument rows: master, pattern filter,
  // delay over distortion (a double row), compressor.
  buildBody({ x, y, w, h }) {
    const { state } = this;
    const devices = CHANNELS.map(([id, label], index) => new ChannelStrip(state, x + index * (STRIP_W + GAP), y, STRIP_W, h, { id, label, index, solo: true }));
    const fx = x + MIX_STRIPS_W + GAP;
    const row = (h - GAP * 3) / 5;
    const bands = [row, row, row * 2 + GAP, row].reduce((out, bh) => {
      const by = out.length ? out.at(-1).y + out.at(-1).h + GAP : 0;
      return [...out, { y: by, h: bh }];
    }, []);
    devices.push(new EffectsColumn(state, fx, y, x + w - fx, h, bands, GAP));
    return devices;
  }
}
