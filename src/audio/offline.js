// Offline rendering with the real engine: a song (or the current patterns) to
// an AudioBuffer, faster than real time. Used by EXPORT WAV and by the
// calibration tools (tools/render.html).
import { Rack } from '../render/rack.js';
import { Clock } from '../sequencer/clock.js';
import { applySession } from '../song/session.js';
import { State } from '../state.js';
import { AudioEngine } from './engine.js';

const SLICE = 0.1; // seconds scheduled per step of the render, like the live lookahead

// session: a serialized session. prepare(state) may adjust it before playing.
// onProgress(0..1) is called as the render goes. stem: see AudioEngine.stem.
export async function renderSession(session, { startBar = 1, bars = 16, sampleRate = 48000, tail = 1, prepare, onProgress, stem = null } = {}) {
  const state = new State();
  const engine = new AudioEngine(state);
  engine.stem = stem;
  const clock = new Clock(state, engine);
  // Controls register parameter defaults: build the rack before loading.
  new Rack(state, { clock, engine, files: {} });
  applySession(state, session);
  prepare?.(state);

  const seconds = (bars * 16 * 60) / state.transport.tempo / 4 + tail;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  // The scheduler reads currentTime to know how far ahead to queue; an offline
  // context's own clock only moves while rendering, so drive it by hand.
  let now = 0;
  Object.defineProperty(ctx, 'currentTime', { get: () => now });
  engine.build(ctx);
  await engine.ready;
  engine.start = () => ctx;

  state.transport.bar = startBar;
  // play() would start the live scheduler timer; the render drives it instead.
  const realSetInterval = window.setInterval;
  window.setInterval = () => 0;
  clock.play();
  window.setInterval = realSetInterval;

  // Schedule in slices while rendering (suspend/resume), like live playback.
  // Scheduling everything up front keeps every hit's nodes in the graph for
  // the whole render, which makes long renders quadratically slow.
  const end = seconds - tail;
  const scheduleUntil = (t) => {
    now = Math.min(t, end);
    clock.schedule();
  };
  scheduleUntil(SLICE);
  for (let t = SLICE; t < end; t += SLICE) {
    ctx.suspend(t).then(() => {
      scheduleUntil(t + SLICE);
      onProgress?.(t / end);
      ctx.resume();
    });
  }
  const buffer = await ctx.startRendering();
  return { buffer, tempo: state.transport.tempo };
}

// Loudest sample, in dBFS.
export function peakDb(buffer) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) for (const s of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(s));
  return 20 * Math.log10(peak || 1e-9);
}

// Interleaved 16-bit PCM, clipped to full scale.
export function pcm16(buffer) {
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const pcm = new Int16Array(L.length * 2);
  for (let i = 0; i < L.length; i++) {
    pcm[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767;
    pcm[i * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767;
  }
  return pcm;
}

export function wavBlob(buffer) {
  return new Blob(wavParts(buffer), { type: 'audio/wav' });
}

// A WAV file's bytes as [header, samples].
export function wavParts(buffer) {
  const pcm = pcm16(buffer);
  const header = new DataView(new ArrayBuffer(44));
  const ascii = (o, s) => [...s].forEach((c, i) => header.setUint8(o + i, c.charCodeAt(0)));
  const rate = buffer.sampleRate;
  ascii(0, 'RIFF');
  header.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, 'WAVEfmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 2, true);
  header.setUint32(24, rate, true);
  header.setUint32(28, rate * 4, true);
  header.setUint16(32, 4, true);
  header.setUint16(34, 16, true);
  ascii(36, 'data');
  header.setUint32(40, pcm.byteLength, true);
  return [new Uint8Array(header.buffer), new Uint8Array(pcm.buffer)];
}
