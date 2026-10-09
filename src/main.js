import './style.css';
import { AudioEngine } from './audio/engine.js';
import { loadDemo } from './demo.js';
import { MAX_STRETCH, Rack, RACK_H, RACK_W } from './render/rack.js';
import { Clock } from './sequencer/clock.js';
import { Files } from './song/files.js';
import { State } from './state.js';
import { hits } from './ui/hits.js';
import { attachPointer } from './ui/pointer.js';

const canvas = document.getElementById('rack');
const ctx = canvas.getContext('2d');
const state = new State();
const engine = new AudioEngine(state);
const clock = new Clock(state, engine);
const files = new Files(state, {
  beforeLoad: () => clock.t.playing && clock.stop(),
  onLoaded: () => {
    notify(state.info.title || state.info.file || 'Loaded');
    requestRender();
  },
  onError: (err, file) => {
    console.error(err);
    notify(`Can't open ${file?.name ?? 'file'}: ${err.message}`);
  },
});
const app = { clock, engine, files };
// Controls register their parameter defaults here, so build the rack before loading.
let rack = new Rack(state, app);

if (!files.restore()) loadDemo(state);

let frame = 0;

function requestRender() {
  if (!frame) frame = requestAnimationFrame(render);
}

function notify(message) {
  state.notice = { text: message.toUpperCase(), until: performance.now() + 4000 };
  setTimeout(requestRender, 4100);
  requestRender();
}

function render() {
  frame = 0;
  // Draw in rack design units; the transform handles window scale + HiDPI.
  ctx.setTransform(canvas.width / rack.width, 0, 0, canvas.height / rack.height, 0, 0);
  hits.clear();
  rack.draw(ctx);
}

// Pushes knob changes to the audio graph and pulls playhead/meter updates back.
function animate() {
  engine.sync();
  const moved = clock.update();
  const metered = engine.updateMeters();
  if (moved || metered) requestRender();
  requestAnimationFrame(animate);
}

// Fill the window: one uniform scale (fit the tighter dimension, never below
// 1:1), and the rack is rebuilt wider or taller to use the rest, up to
// MAX_STRETCH. Smaller windows scroll, like the original rack did.
function resize() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const scale = Math.max(1, Math.min(W / RACK_W, H / RACK_H));
  const width = Math.round(Math.min(RACK_W * MAX_STRETCH.w, Math.max(RACK_W, W / scale)));
  const height = Math.round(Math.min(RACK_H * MAX_STRETCH.h, Math.max(RACK_H, H / scale)));
  if (width !== rack.width || height !== rack.height) rack = new Rack(state, app, width, height);
  const cssW = Math.floor(rack.width * scale);
  const cssH = Math.floor(rack.height * scale);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  render();
}

// Moving the window to a display with a different pixel ratio doesn't fire resize.
function watchPixelRatio() {
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
    'change',
    () => {
      resize();
      watchPixelRatio();
    },
    { once: true },
  );
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  e.preventDefault();
  clock.toggle();
  requestRender();
});

// Every user edit goes through the pointer; autosave is debounced.
attachPointer(canvas, () => {
  requestRender();
  files.autosave();
});
files.acceptDrops(window);
window.addEventListener('resize', resize);
watchPixelRatio();
resize();
animate();
