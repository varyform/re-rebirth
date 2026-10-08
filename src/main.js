import './style.css';
import { Rack } from './render/rack.js';
import { Clock } from './sequencer/clock.js';
import { State } from './state.js';
import { hits } from './ui/hits.js';
import { attachPointer } from './ui/pointer.js';

const canvas = document.getElementById('rack');
const ctx = canvas.getContext('2d');
const state = new State();
const clock = new Clock(state, requestRender);
const rack = new Rack(state, clock);

let frame = 0;

function requestRender() {
  if (!frame) frame = requestAnimationFrame(render);
}

function render() {
  frame = 0;
  // Draw in rack design units; the transform handles window scale + HiDPI.
  ctx.setTransform(canvas.width / rack.width, 0, 0, canvas.height / rack.height, 0, 0);
  hits.clear();
  rack.draw(ctx);
}

// Scale to fit the window while keeping the aspect ratio, never below 1:1.
// Smaller windows scroll, like the original rack did.
function resize() {
  const scale = Math.max(1, Math.min(window.innerWidth / rack.width, window.innerHeight / rack.height));
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
});

attachPointer(canvas, requestRender);
window.addEventListener('resize', resize);
watchPixelRatio();
resize();
