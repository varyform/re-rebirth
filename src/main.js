import './style.css';
import { AudioEngine } from './audio/engine.js';
import { loadDemo } from './demo.js';
import { addedMessage, closeLibrary, openLibrary, SEARCH_PLACEHOLDER } from './render/library.js';
import { MAX_STRETCH, Rack, RACK_H, RACK_W } from './render/rack.js';
import { Clock } from './sequencer/clock.js';
import { Files } from './song/files.js';
import { collectDropped, Library } from './song/library.js';
import { State } from './state.js';
import { hits } from './ui/hits.js';
import { canvasInput } from './ui/canvas-input.js';
import { attachPointer } from './ui/pointer.js';

const canvas = document.getElementById('rack');
const ctx = canvas.getContext('2d');
const state = new State();
const engine = new AudioEngine(state);
const clock = new Clock(state, engine);
const library = new Library(() => requestRender());
// Every song that's opened or dropped ends up in the library too.
const remember = async (file) => {
  const { ids } = await library.add([file]);
  return ids[0];
};
const files = new Files(state, {
  beforeLoad: () => clock.t.playing && clock.stop(),
  onLoaded: (_, file) => {
    notify(state.info.title || state.info.file || 'Loaded');
    library.current = null;
    if (file) remember(file).then((id) => (library.current = id));
    requestRender();
  },
  onError: (err, file) => {
    console.error(err);
    // The song display fits ~50 characters: show the reason, not the file name.
    notify(`Can't open: ${err.message}`);
    if (file instanceof Blob) remember(file);
  },
});
const app = { clock, engine, files, library, notify };
// Controls register their parameter defaults here, so build the rack before loading.
let rack = new Rack(state, app);

if (!files.restore()) loadDemo(state);

let frame = 0;

const search = canvasInput(canvas, {
  placeholder: SEARCH_PLACEHOLDER,
  onInput: (value) => {
    if (!state.ui.library) return;
    Object.assign(state.ui.library, { query: value, y: 0 });
    requestRender();
  },
});

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
  const lib = state.ui.library;
  search.place(lib?.search ?? null, rack.width, lib?.query ?? '');
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
  // Typing in the search field: Escape clears it first, other keys are just text.
  if (e.target === search.input) {
    if (e.code !== 'Escape') return;
    if (search.input.value) {
      e.preventDefault();
      search.input.value = '';
      search.input.dispatchEvent(new Event('input'));
      return;
    }
  }
  if (e.code === 'Escape' && (state.ui.about || state.ui.library || state.ui.automation)) {
    if (state.ui.about) state.ui.about = false;
    else if (state.ui.library) closeLibrary(state);
    else state.ui.automation = null;
    requestRender();
    return;
  }
  // Only reaches us in full screen when Escape is locked (see toggleFullscreen).
  if (e.code === 'Escape' && isFullscreen()) {
    toggleFullscreen();
    return;
  }
  if (e.code === 'KeyF' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
    toggleFullscreen();
    return;
  }
  if (e.code !== 'Space' || e.repeat) return;
  e.preventDefault();
  clock.toggle();
  requestRender();
});

const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

// Safari before 16.4 only has the prefixed API; iPhone has none for pages.
// Chromium can lock Escape in full screen, so it closes our windows first and
// leaves full screen only from the rack (holding Escape still always exits).
// Elsewhere Escape leaves full screen straight away, as the browser decides.
function toggleFullscreen() {
  const root = document.documentElement;
  if (isFullscreen()) {
    (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document);
    return;
  }
  const entered = (root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root);
  Promise.resolve(entered)
    .then(() => navigator.keyboard?.lock?.(['Escape']))
    .catch(() => { });
}

// Every user edit goes through the pointer; autosave is debounced.
// A click on the rack (say, a song in the library) leaves the search field, so
// Space plays again.
canvas.addEventListener('pointerdown', () => search.input.blur());
attachPointer(canvas, () => {
  requestRender();
  files.autosave();
});
// Drop anywhere: one song file opens it; several files or folders go to the library.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const { files: dropped, folders } = await collectDropped(e.dataTransfer);
  if (!dropped.length) return notify(folders ? 'No songs in the dropped folder' : 'Nothing to open');
  if (!folders && dropped.length === 1) return files.open(dropped[0]);
  openLibrary(state);
  notify(addedMessage(await library.add(dropped)));
});
// iOS only lets audio start inside a completed tap, and our buttons act on
// pointerdown; resume a suspended engine when the finger lifts.
canvas.addEventListener('pointerup', () => {
  if (engine.ctx?.state === 'suspended') engine.ctx.resume();
});
window.addEventListener('resize', resize);
watchPixelRatio();
resize();
animate();
