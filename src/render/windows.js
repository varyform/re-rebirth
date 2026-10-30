import { drawAbout } from './about.js';
import { drawAutomation } from './automation.js';
import { drawExport } from './export.js';
import { drawLibrary } from './library.js';
import { drawMidiWindow } from './midi-window.js';
import { drawShortcuts } from './shortcuts-overlay.js';
import { drawSongInfo } from './song-info.js';

// Windows are drawn after a view's devices so their hit regions take every click while open.
export function drawWindows(ctx, w, h, state, app) {
  if (state.ui.automation) drawAutomation(ctx, w, h, state, app);
  if (state.ui.library) drawLibrary(ctx, w, h, state, app);
  if (state.ui.about) drawAbout(ctx, w, h, state, app);
  if (state.ui.songInfo) drawSongInfo(ctx, w, h, state, app);
  if (state.ui.export) drawExport(ctx, w, h, state, app);
  if (state.ui.midiWindow) drawMidiWindow(ctx, w, h, state, app);
  if (state.ui.help) drawShortcuts(ctx, w, h, state, app);
}
