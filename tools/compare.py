"""Compare a render against a reference recording, bar by bar.

    uv run --with numpy --with scipy python tools/compare.py proper.wav render.wav \
        --bpm 143 --ref-start 3.15 --bars 24

--ref-start / --start: time (s) of bar 1 in each file (renders start at 0.05 s).
Prints per-2-bar loudness by band (render minus reference) and the overall
1/3-octave spectrum difference, plus stereo balance.
"""

import argparse

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt, welch

BANDS = [
    ("sub", 20, 60),
    ("kick", 60, 150),
    ("lowmid", 150, 400),
    ("mid", 400, 1500),
    ("himid", 1500, 5000),
    ("hats", 5000, 18000),
]


def load(path):
    sr, x = wavfile.read(path)
    x = x.astype(np.float64)
    if np.abs(x).max() > 2:  # integer PCM
        x /= 32768
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    return sr, x


def db(y):
    return 10 * np.log10(np.mean(y**2) + 1e-12)


def band_rows(x, sr, start, bar, bars):
    mono = x.mean(1)
    filt = {
        n: sosfiltfilt(butter(4, [lo, hi], btype="band", fs=sr, output="sos"), mono)
        for n, lo, hi in BANDS
    }
    rows = []
    for b in range(0, bars, 2):
        a = int((start + b * bar) * sr)
        e = a + int(2 * bar * sr)
        if e > len(mono):
            break
        rows.append([db(mono[a:e])] + [db(filt[n][a:e]) for n, *_ in BANDS])
    return np.array(rows)


def third_octaves(x, sr, start, end):
    seg = x[int(start * sr) : int(end * sr)].mean(1)
    f, p = welch(seg, sr, nperseg=8192)
    centers = 31.25 * 2 ** (np.arange(0, 30) / 3)
    centers = centers[centers < 16000]
    vals = [
        10 * np.log10(p[(f >= c / 2 ** (1 / 6)) & (f < c * 2 ** (1 / 6))].sum() + 1e-20)
        for c in centers
    ]
    return centers, np.array(vals)


def stereo(x, sr, start, end):
    s = x[int(start * sr) : int(end * sr)]
    l, r = np.sqrt(np.mean(s[:, 0] ** 2)), np.sqrt(np.mean(s[:, 1] ** 2))
    mid, side = (s[:, 0] + s[:, 1]) / 2, (s[:, 0] - s[:, 1]) / 2
    return 20 * np.log10(r / l), 10 * np.log10(np.mean(side**2) / np.mean(mid**2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reference")
    ap.add_argument("render")
    ap.add_argument("--bpm", type=float, required=True)
    ap.add_argument("--ref-start", type=float, required=True)
    ap.add_argument("--start", type=float, default=0.05)
    ap.add_argument("--bars", type=int, default=16)
    a = ap.parse_args()

    bar = 16 * 60 / a.bpm / 4
    sr_r, ref = load(a.reference)
    sr_o, ours = load(a.render)
    assert sr_r == sr_o, "sample rates differ"

    rr = band_rows(ref, sr_r, a.ref_start, bar, a.bars)
    ro = band_rows(ours, sr_o, a.start, bar, a.bars)
    n = min(len(rr), len(ro))
    print(
        "bars    "
        + "".join(f"{h:>8}" for h in ["total"] + [b[0] for b in BANDS])
        + "   (render - reference, dB)"
    )
    for i in range(n):
        print(
            f"{i * 2 + 1:>3}-{i * 2 + 2:<3} "
            + "".join(f"{v:+8.1f}" for v in ro[i] - rr[i])
        )

    span = n * 2 * bar
    c, sr_ = third_octaves(ref, sr_r, a.ref_start, a.ref_start + span)
    _, so = third_octaves(ours, sr_o, a.start, a.start + span)
    print("\n1/3-octave (render - reference, dB)")
    print("Hz   " + "".join(f"{v:>6.0f}" for v in c))
    print("diff " + "".join(f"{v:+6.0f}" for v in so - sr_))

    rl, rw = stereo(ref, sr_r, a.ref_start, a.ref_start + span)
    ol, ow = stereo(ours, sr_o, a.start, a.start + span)
    print(
        f"\nstereo  R-L: reference {rl:+.1f} dB, render {ol:+.1f} dB | side/mid: reference {rw:.1f} dB, render {ow:.1f} dB"
    )


if __name__ == "__main__":
    main()
