// ReBirth's compressor as an AudioWorklet, fitted to a ReBirth export (tools/fx-test-song.mjs):
// a mean-square level detector feeding a soft-knee static curve, with the
// gain smoothed in dB. DynamicsCompressorNode can't stand in for it: it reads
// peaks, so drum mixes (peaks 15-20 dB over their RMS) got squashed far harder
// than in ReBirth, and its fast attack flattened every transient.
//
// The static curve comes from the engine as AudioParams (dB); `offsetDb` converts
// this node's input level to the ReBirth export level the curve was fitted on.

// Runs in the AudioWorkletGlobalScope: no imports, no closures over module scope.
function registerCompressor() {
  const PARAMS = [
    ['thresholdDb', -20],
    ['kneeDb', 7],
    ['slope', 0], // 1 - 1/ratio
    ['makeupDb', 0],
    ['offsetDb', 0],
    ['detector', 0.015], // seconds: mean-square averaging
    ['attack', 0.03], // seconds: gain falling
    ['release', 0.037], // seconds: gain rising
  ];

  class Compressor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return PARAMS.map(([name, defaultValue]) => ({ name, defaultValue, automationRate: 'k-rate' }));
    }

    constructor() {
      super();
      this.ms = 0;
      this.g = 0; // current gain, dB
      this.sinceReport = 0;
    }

    process(inputs, outputs, p) {
      const input = inputs[0];
      const output = outputs[0];
      const nch = input.length;
      if (!nch) return true;
      const n = input[0].length;
      const coef = (t) => 1 - Math.exp(-1 / (Math.max(t, 1e-4) * sampleRate));
      const kd = coef(p.detector[0]);
      const ka = coef(p.attack[0]);
      const kr = coef(p.release[0]);
      const T = p.thresholdDb[0];
      const knee = Math.max(p.kneeDb[0], 1e-6);
      const slope = p.slope[0];
      const makeup = p.makeupDb[0];
      const offset = p.offsetDb[0];
      let { ms, g } = this;
      for (let i = 0; i < n; i++) {
        let pw = 0;
        for (let c = 0; c < nch; c++) pw += input[c][i] * input[c][i];
        ms += (pw / nch - ms) * kd;
        const over = 10 * Math.log10(ms + 1e-20) + offset - T;
        const red = over > knee / 2 ? over : over < -knee / 2 ? 0 : (over + knee / 2) ** 2 / (2 * knee);
        const target = makeup - slope * red;
        g += (target - g) * (target < g ? ka : kr);
        const gain = 10 ** (g / 20);
        for (let c = 0; c < nch; c++) output[c][i] = input[c][i] * gain;
      }
      this.ms = ms;
      this.g = g;
      // Gain reduction for the panel's meter, ~40 times a second.
      this.sinceReport += n;
      if (this.sinceReport >= 1024) {
        this.sinceReport = 0;
        this.port.postMessage(g - makeup);
      }
      return true;
    }
  }

  registerProcessor('rebirth-compressor', Compressor);
}

export const COMPRESSOR = 'rebirth-compressor';

// A Blob URL works the same in dev, the production build and headless renders.
export function loadCompressor(ctx) {
  const url = URL.createObjectURL(new Blob([`(${registerCompressor})();`], { type: 'text/javascript' }));
  return ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
}
