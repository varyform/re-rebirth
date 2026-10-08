// 56 step-shape presets for the pattern-controlled filter (the count matches
// ReBirth's wave selector). Shapes are generated, not copied: ramps, pulses,
// triangles and seeded random curves, each 16 values in 0..1.
const N = 16;
const FLOOR = 0.12;

const ramp = (period, up) =>
  Array.from({ length: N }, (_, i) => {
    const p = (i % period) / Math.max(1, period - 1);
    return up ? p : 1 - p;
  });
const pulse = (period, duty, offset = 0) => Array.from({ length: N }, (_, i) => ((i + offset) % period < duty ? 1 : FLOOR));
const triangle = (period) =>
  Array.from({ length: N }, (_, i) => {
    const p = (i % period) / period;
    return p < 0.5 ? p * 2 : 2 - p * 2;
  });
const seeded = (seed) => {
  let s = seed;
  return Array.from({ length: N }, () => {
    s = (s * 16807) % 2147483647;
    return FLOOR + (1 - FLOOR) * (s / 2147483647);
  });
};

const shapes = [
  ...[16, 8, 4, 2].map((p) => ramp(p, false)),
  ...[16, 8, 4].map((p) => ramp(p, true)),
  ...[[2, 1], [4, 1], [4, 2], [8, 1], [8, 2], [8, 4], [16, 1], [16, 4], [16, 8], [3, 1], [6, 2], [5, 1]].map(([p, d]) => pulse(p, d)),
  ...[[4, 1, 2], [4, 1, 3], [8, 1, 4], [8, 2, 4]].map(([p, d, o]) => pulse(p, d, o)),
  ...[16, 8, 4].map(triangle),
];
for (let seed = 1; shapes.length < 56; seed++) shapes.push(seeded(seed * 7919));

export const PCF_WAVES = shapes;
export const PCF_WAVE_COUNT = shapes.length;
