"""Compare isolated drum hits (from tools/hits.mjs) between a reference and renders.

  node tools/hits.mjs song.rbs > hits.json
  uv run --with numpy --with scipy python tools/voice.py hits.json ref.wav \
      --render-dir /tmp/hits --ref-bar1 0.004 --voice r808.ht

Renders are expected as <render-dir>/bar-<N>.wav, each starting at bar N with
the 0.05 s lead-in from tools/render.mjs (render with --bars 2 so tails fit).
Prints, per voice: decay times per band, the attack spectrum, and the dominant
pitch over time — reference vs render.
"""

import argparse
import json

import numpy as np
from scipy.io import wavfile
from scipy.signal import stft

LEAD_IN = 0.05
BANDS = [
    ("60", 45, 90),
    ("125", 90, 180),
    ("250", 180, 355),
    ("500", 355, 710),
    ("1k", 710, 1400),
    ("2k", 1400, 2800),
    ("4k", 2800, 5600),
    ("8k", 5600, 11000),
    ("14k", 11000, 18000),
]
FRAME = 0.005
LENGTH = 0.3


def load(path):
    sr, x = wavfile.read(path)
    x = x.astype(np.float64)
    if np.abs(x).max() > 2:
        x /= 32768
    return sr, x.mean(1) if x.ndim == 2 else x


def analyse(x, sr):
    """Band envelopes (dB) and peak-frequency track for one hit."""
    hop = int(FRAME * sr)
    f, _, Z = stft(x, sr, nperseg=2048, noverlap=2048 - hop, boundary=None)
    P = np.abs(Z) ** 2
    env = np.array([P[(f >= lo) & (f < hi)].sum(0) for _, lo, hi in BANDS])
    low = (f > 40) & (f < 1500)
    peak = f[low][np.argmax(P[low], axis=0)]
    return env, peak


def summarize(envs, peaks):
    env = 10 * np.log10(np.mean(envs, axis=0) + 1e-14)
    n = env.shape[1]
    decays = []
    for row in env:
        top = row.argmax()
        below = np.where(row[top:] < row[top] - 20)[0]
        decays.append((below[0] if len(below) else n - top) * FRAME * 1000)
    attack = env[:, :4].max(1)
    pitch = np.median(peaks, axis=0)
    return env, np.array(decays), attack - attack.max(), pitch, attack.max()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("hits")
    ap.add_argument("reference")
    ap.add_argument("--render-dir", required=True)
    ap.add_argument("--ref-bar1", type=float, required=True)
    ap.add_argument("--voice", required=True)
    ap.add_argument("--bpm", type=float, required=True)
    a = ap.parse_args()
    step_sec = 60 / a.bpm / 4

    hits = [h for h in json.load(open(a.hits)) if h["voice"] == a.voice]
    sr, R = load(a.reference)
    ref_e, ref_p, our_e, our_p = [], [], [], []
    for h in hits:
        t = a.ref_bar1 + h["time"]
        seg = R[int(t * sr) : int((t + LENGTH) * sr)]
        e, p = analyse(seg, sr)
        ref_e.append(e)
        ref_p.append(p)
        _, O = load(f"{a.render_dir}/bar-{h['bar']}.wav")
        t = LEAD_IN + (h["step"] - 1) * step_sec
        seg = O[int(t * sr) : int((t + LENGTH) * sr)]
        e, p = analyse(seg, sr)
        our_e.append(e)
        our_p.append(p)
    n = min(x.shape[1] for x in ref_e + our_e)
    R_ = summarize([x[:, :n] for x in ref_e], [x[:n] for x in ref_p])
    O_ = summarize([x[:, :n] for x in our_e], [x[:n] for x in our_p])
    print(
        f"{a.voice}: {len(hits)} hits; attack level render - reference {O_[4] - R_[4]:+.1f} dB"
    )
    print("band          " + "".join(f"{b[0]:>7}" for b in BANDS))
    print("attack ref    " + "".join(f"{v:7.0f}" for v in R_[2]))
    print("attack render " + "".join(f"{v:7.0f}" for v in O_[2]))
    print("decay ms ref  " + "".join(f"{v:7.0f}" for v in R_[1]))
    print("decay ms rend " + "".join(f"{v:7.0f}" for v in O_[1]))
    idx = [0, 2, 4, 8, 12, 20, 30, 45]
    idx = [i for i in idx if i < n]
    print("pitch Hz at   " + "".join(f"{i * FRAME * 1000:>5.0f}ms" for i in idx))
    print("  reference   " + "".join(f"{R_[3][i]:7.0f}" for i in idx))
    print("  render      " + "".join(f"{O_[3][i]:7.0f}" for i in idx))


if __name__ == "__main__":
    main()
