// The pattern filter's 56 waves, measured from a ReBirth export that plays every
// wave through the filter (tools/fx-test-song-2.mjs, lowpass, frequency 0, amount
// 127, decay 64), one bar each. Every wave has 32 half-step slots: a number sets
// the filter envelope to that fraction of its full sweep (times the amount knob),
// null lets it keep falling at the decay knob's rate. Fitted within ~0.5 octave of
// the measured cutoff, about the tracking's own noise.
const N = 32;

// prettier-ignore
const WAVES = [
  [1, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  [1, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 1, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  [1, null, null, null, null, null, null, null, 1, null, null, null, null, null, null, null, 1, null, null, null, null, null, null, null, 1, null, null, null, null, null, null, null],
  [null, null, null, null, 1, null, null, null, null, null, 1, null, null, null, null, null, 1, null, null, null, null, null, 1, null, null, null, null, null, 1, null, null, null],
  [1, null, null, null, 1, null, null, null, 1, null, null, null, 1, null, null, null, 1, null, null, null, 1, null, null, null, 1, null, null, null, 1, null, null, null],
  [1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, null],
  [1, null, null, null, null, null, 1, null, 1, null, null, null, null, null, 1, null, 1, null, null, null, null, null, 1, null, 1, null, null, null, null, null, 1, null],
  [1, null, null, null, 1, null, null, null, 1, null, 1, null, null, null, 1, null, 1, null, null, null, 1, null, null, null, 1, null, 1, null, null, null, 1, null],
  [1, null, null, null, 1, null, null, null, null, null, 1, null, null, null, null, null, 1, null, null, null, null, null, 1, null, null, null, null, null, 1, null, null, null],
  [null, null, 1, null, null, null, null, null, 1, null, null, null, null, null, 1, null, null, null, 1, null, null, null, 1, null, null, null, null, null, 1, null, null, null],
  [1, null, 1, null, null, null, null, null, 1, null, null, null, 1, null, 1, null, null, null, 1, null, null, null, 1, null, 1, null, null, null, 1, null, null, null],
  [1, null, null, null, 1, null, null, null, null, null, 1, null, null, null, 1, null, null, null, 1, null, null, null, null, null, 1, null, null, null, 1, null, null, null],
  [null, null, null, null, 0.2, null, null, 0.2, 0.35, null, 0.4, null, 0.5, null, 0.6, null, 0.7, null, 0.6, null, 0.55, null, 0.45, null, 0.35, null, null, null, 0.2, null, null, null],
  [null, null, null, null, null, null, null, null, 0.2, null, 0.2, null, 0.25, 0.35, 0.35, null, 0.4, null, 0.5, null, 0.5, null, 0.55, null, 0.6, null, 0.65, null, 0.7, null, 0.75, null],
  [null, 0.4, 0, null, null, null, null, null, 0.15, null, 0.2, null, 0.35, null, 0.4, null, 0.5, null, 0.6, null, 0.7, null, 0.75, null, 0.7, null, 0.6, null, 0.55, null, 0.45, null],
  [0.55, null, 0.6, null, 0.65, null, 0.7, null, 0.75, null, 0.7, null, 0.65, null, 0.6, null, 0.55, null, 0.5, null, 0.5, null, 0.4, null, null, 0.35, null, null, 0.25, null, 0.3, null],
  [0.7, null, 0.6, null, 0.45, null, 0.35, null, 0.7, 0.6, 0.6, null, 0.45, null, null, null, 0.7, null, 0.6, null, 0.45, null, null, null, 0.7, null, 0.6, null, 0.45, null, null, null],
  [0.35, null, 0.75, null, 0.55, null, 0.35, null, 0.7, null, 0.55, null, 0.4, null, 0.75, null, 0.55, null, 0.35, null, 0.7, null, 0.55, null, null, null, 0.75, null, 0.55, null, 0.35, null],
  [0.3, null, null, null, null, null, null, null, 0.8, null, null, null, null, null, null, null, 0.4, null, null, null, null, null, null, null, 0.7, null, null, null, null, null, null, null],
  [null, null, 0.7, null, null, null, null, null, 0.5, null, null, null, null, null, 0.8, null, null, null, null, null, 0.95, null, null, null, null, null, 0.5, null, null, null, null, null],
  [0.65, null, null, null, 0.25, null, null, null, 0.8, null, null, null, 0.4, null, null, null, 0.7, null, null, null, 0.95, null, null, null, 0.45, null, 0.35, null, 0.65, null, null, null],
  [0.8, null, null, null, 0.65, null, 0.5, null, 0.6, null, 0.45, null, 0.9, 0.7, null, null, 0.8, null, 0.95, null, null, null, 0.75, null, 0.65, null, null, null, 0.85, null, null, null],
  [0.8, null, null, null, 0.7, null, null, null, null, null, 0.85, null, null, null, null, null, 0.6, null, null, null, null, null, 0.7, 0.6, null, null, null, null, 0.6, null, null, null],
  [0.35, null, null, null, 0.35, null, null, null, 0.6, null, null, null, null, null, null, null, null, null, null, null, 0.25, null, 0.3, null, null, null, null, null, null, null, 0.25, 0.3],
  [0.75, null, null, null, 0.6, null, null, 0.35, 0.55, null, null, null, null, null, 0.6, null, null, 0.35, null, 0.35, null, null, 0.55, 0.5, 0.75, null, null, null, 0.3, 0.35, null, null],
  [0.4, null, null, null, 0.7, null, 0.7, null, 0.55, null, null, null, 0.7, 0.6, 0.3, null, 0.8, null, null, null, 0.6, null, null, null, null, null, 0.3, null, 0.5, 0.25, 0.6, null],
  [0.6, null, 0.8, null, null, null, 0.45, null, 0.45, null, null, null, null, null, null, null, null, null, null, null, 0.5, null, 0.6, null, 0.8, null, null, null, null, null, 0.25, null],
  [null, null, null, null, 0.4, null, null, null, null, null, 0.7, null, null, null, null, null, 0.65, 0.55, 0.75, null, 0.65, null, null, null, 0.45, null, 0.8, null, null, null, 0.55, null],
  [0.8, null, null, null, null, null, 0.75, 0.65, 0.7, null, null, null, 0.5, null, null, null, null, null, 0.6, null, 0.65, null, null, null, 0.7, null, 0.8, null, null, null, null, null],
  [null, null, null, null, 0.35, null, 0.7, null, null, null, null, null, null, null, null, null, 0.6, null, null, 0.35, null, null, 0.3, null, null, null, null, null, 0.65, null, null, null],
  [0.35, null, null, null, null, null, 0.4, null, 0.55, null, null, null, null, null, 0.7, 0.6, null, null, null, 0.35, null, null, null, null, 0.5, null, null, null, 0.5, null, null, null],
  [0.8, null, null, null, 0.7, null, null, null, null, null, 0.55, null, null, null, null, null, 0.6, null, null, 0.3, null, 0.35, null, null, 0.55, 0.5, 0.75, null, null, null, null, 0.35],
  [null, null, 0.35, null, 0.3, null, null, null, null, null, null, null, 0.25, 0.3, null, null, 0.75, null, 0.45, null, 0.7, null, 0.65, null, null, null, null, null, null, null, 0.55, 0.5],
  [0.55, null, null, null, null, null, 0.6, null, null, null, null, null, 0.75, null, null, null, 0.6, null, null, null, 0.55, null, null, null, null, null, 0.6, null, null, null, 0.35, null],
  [1, 0.3, 1, 0.3, 1, 0.35, 1, 0.25, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.35, 1, 0.35, 1, 0.35, 1, 0.3, 1, 0.3, 1, 0.25, 1, 0.25, 1, 0.3, 1, 0.2],
  [1, 0.3, 1, 0.35, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.25, 1, 0.3, 1, 0.3, 1, 1, 1, 1, 1, 1, 1, 0.3, 1, 0.3, 1, 1, 1, 0.3, 1, 0.4],
  [1, 0.35, 1, 0.3, 1, 0.35, 1, 0.3, 1, 0.35, 1, 0.25, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.3, 1, 1, 1, 0.25, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.35],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 0.3, 1, 0.35, 1, 0.25, 1, 1, 1, 0.3, 1, 0.35, 1, 1, 1, 0.35, 1, 0.25, 1, 0.3, 1, 0.3, 1, 0.3],
  [1, 0.35, 1, 0.3, 1, 0.35, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.4, 1, 0.3, 1, 0.3, 1, 1, 1, 0.3, 1, 0.3, 1, 0.25, 1, 0.3, 1, 0.3],
  [1, 0.3, 1, 0.3, 1, 0.4, 1, 0.2, 1, 0.3, 1, 0.3, 1, 0.35, 1, 0.3, 1, 1, 1, 1, 1, 1, 1, 0.3, 1, 0.3, 1, 1, 1, 0.25, 1, 0.25],
  [1, 1, 1, 1, 1, 0.35, 1, 0.4, 1, 0.25, 1, 1, 1, 0.3, 1, 0.25, 1, 1, 1, 0.3, 1, 0.2, 1, 0.3, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0.3, null, null, null, null, null, 0.2, null, 0.25, null, 0.3, 0.35, 0.4, 0.4, 0.45, 0.5, 0.55, 0.55, 0.6, 0.6, 0.65, 0.7, 0.7, 0.75, 0.75, 0.8, 0.85, 0.85, 0.9, 0.95, 1, 1],
  [1, 1, 1, 1, null, 0.3, 0.3, null, null, null, 0.25, null, 0.25, 0.35, 0.4, 0.4, 0.45, 0.5, 0.55, 0.55, 0.6, 0.65, 0.65, 0.7, 0.75, 0.8, 0.8, 0.85, 0.9, 0.95, 1, 1],
  [1, 1, 0.95, 0.9, 0.9, 0.85, 0.8, 0.75, 0.75, 0.7, 0.7, 0.65, 0.6, 0.6, 0.55, 0.55, 0.5, 0.45, 0.4, 0.4, null, null, 0.3, null, 0.3, null, null, null, null, null, 0.25, null],
  [1, 0.3, 1, 0.25, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.3, 1, 0.2, 1, 0.3, 1, 0.35, 1, 0.35, 1, 0.4, 1, 0.25],
  [null, null, null, null, 1, 0, null, null, 0.95, 0.2, null, null, null, null, null, 1, 0.15, null, 1, 0.2, null, 0.35, null, 0.5, 0.5, null, 0.5, 0.5, 0.5, 0.25, 1, 0.2],
  [0.95, 1, 0, null, 0.15, 0.25, 1, 1, 0.25, null, null, null, 0.3, 1, 1, 0.25, 1, 1, 0.2, null, 0.95, 1, 1, 1, 0, null, null, null, 1, 1, 0.35, 0.4],
  [null, null, 0.65, null, 1, null, 0.3, null, 0.65, null, 1, null, 0, null, 0.65, null, 1, null, 0, null, 0.7, null, 1, null, 0.2, null, 0.65, null, 1, null, 0.3, null],
  [1, null, 0.2, null, null, null, 0.65, null, null, null, 1, null, 0.2, null, null, null, 0.65, null, null, null, 1, null, 0.2, null, null, null, 0.65, null, 0, null, 1, null],
  [0, null, 0.65, null, 1, null, 0.65, null, 0.2, null, null, null, null, null, null, null, 0.65, null, 1, null, 0.65, null, null, null, null, null, null, null, null, null, 0.65, null],
  [null, null, 1, null, 1, null, 0.65, null, 0.2, null, null, null, 1, null, 1, null, null, null, null, 0.35, 1, null, 1, null, 0.65, null, null, null, null, null, 1, null],
  [0.75, 0.65, 0.6, 0.5, null, null, 0.3, 1, 0, 1, null, 0.75, 0.65, 0.6, null, 0.4, null, null, 1, 0, 1, null, 0.75, 0.65, 0.6, 0.5, null, null, 0.35, 1, 0, 1],
  [0.4, null, null, null, 0.35, null, null, null, 0.35, null, null, null, 0.4, null, null, null, 0.45, null, null, null, 0.5, null, null, null, 0.5, null, null, null, 0.6, null, null, null],
  [0.45, null, 0.65, null, 0.65, null, 0.65, null, 0.5, null, 0.65, null, 0.65, null, 0.65, null, 0.5, null, 0.65, null, 0.65, null, 0.65, null, 0.5, null, 0.65, null, 0.65, null, 0.65, null],
  [1, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
];

export const PCF_WAVES = WAVES;
export const PCF_WAVE_COUNT = WAVES.length;
export const PCF_SLOTS = N;

// For drawing: each slot's level, falling ~30% per slot where a wave lets it fall
// (decay 64 at 120 BPM). Starts from the wave's own end, as when it loops.
export const PCF_WAVE_SHAPES = WAVES.map((w) => {
  let level = 0;
  for (let pass = 0; pass < 2; pass++) {
    const out = w.map((v) => (level = v ?? level * 0.7));
    if (pass) return out;
  }
  return [];
});
