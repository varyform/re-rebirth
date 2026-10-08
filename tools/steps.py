"""Step-level comparison of renders against a full-song reference recording.

All commands fold several bars that share a pattern, so single hits stand out
from the mix. Bars are song bars; renders are expected to start at bar
--render-start with the usual 0.05 s lead-in (tools/render.mjs).

  # per-step band energy, render minus reference
  uv run --with numpy --with scipy python tools/steps.py fold ref.wav render.wav \
      --bpm 143 --ref-bar1 0.004 --render-start 9 --bars 14,15,16

  # 1/3-octave spectrum of the first 40 ms of given steps
  ... tools/steps.py spectrum ref.wav render.wav ... --bars 14,15 --steps 3,7,11

  # energy at given frequencies per 1/32 note (e.g. which bass octave sounds when)
  ... tools/steps.py track ref.wav render.wav ... --bars 14,15 --freqs 108,180,216

  # one-number per-step shape error per section: render.wav:renderStart:fromBar:count
  ... tools/steps.py score ref.wav --bpm 143 --ref-bar1 0.004 a.wav:13:13:8 b.wav:33:33:8
"""

import argparse

import numpy as np
from scipy.io import wavfile
from scipy.signal import stft

FOLD_BANDS = [
    ("sub", 30, 60),
    ("kick", 60, 120),
    ("body", 120, 300),
    ("low", 300, 800),
    ("mid", 800, 2000),
    ("pres", 2000, 5000),
    ("hi", 5000, 9000),
    ("air", 9000, 16000),
]
LEAD_IN = 0.05


def load(path):
    sr, x = wavfile.read(path)
    x = x.astype(np.float64)
    if np.abs(x).max() > 2:
        x /= 32768
    return sr, x.mean(1) if x.ndim == 2 else x


def crop(x, sr, starts, length):
    """Cut out just the span covering `starts` + `length` (STFTs of a whole song are slow)."""
    lo = max(0, int((min(starts) - 0.1) * sr))
    hi = min(len(x), int((max(starts) + length + 0.1) * sr))
    return x[lo:hi], [t - lo / sr for t in starts]


def band_power(x, sr, bands, nper=1024, hop=64):
    f, _, Z = stft(x, sr, nperseg=nper, noverlap=nper - hop)
    P = np.abs(Z) ** 2
    return np.array([P[(f >= lo) & (f < hi)].sum(0) for lo, hi in bands]), hop / sr


def folded(x, sr, starts, bar, bands):
    x, starts = crop(x, sr, starts, bar)
    B, dt = band_power(x, sr, bands)
    n = int(bar / dt)
    acc = np.zeros((len(bands), n))
    for t0 in starts:
        k = int(round(t0 / dt))
        acc += B[:, k : k + n]
    return acc / len(starts), dt


def cmd_fold(a, bar):
    step = bar / 16
    bands = [(lo, hi) for _, lo, hi in FOLD_BANDS]
    sr, R = load(a.reference)
    _, O = load(a.render)
    fr, dt = folded(R, sr, [a.ref_bar1 + (b - 1) * bar for b in a.bars], bar, bands)
    fo, _ = folded(
        O, sr, [LEAD_IN + (b - a.render_start) * bar for b in a.bars], bar, bands
    )
    hit, whole = int(0.06 / dt), int(step / dt)
    names = " ".join(f"{n:>5}" for n, *_ in FOLD_BANDS)
    print(
        f"step | reference hit dB {' ' * 30}| render - reference (hit, first 60 ms) {' ' * 9}| (rest of step)"
    )
    print(f"     | {names} | {names} | {names}")
    for s in range(16):
        k = int(s * step / dt)
        db = lambda f, a0, a1: 10 * np.log10(f[:, a0:a1].mean(1) + 1e-12)
        rh, oh = db(fr, k, k + hit), db(fo, k, k + hit)
        rt, ot = db(fr, k + hit, k + whole), db(fo, k + hit, k + whole)
        print(
            f"{s + 1:>4} | "
            + " ".join(f"{v:5.0f}" for v in rh)
            + " | "
            + " ".join(f"{v:+5.1f}" for v in oh - rh)
            + " | "
            + " ".join(f"{v:+5.1f}" for v in ot - rt)
        )


def cmd_spectrum(a, bar):
    step = bar / 16
    centers = 31.25 * 2 ** (np.arange(0, 30) / 3)
    centers = centers[(centers > 200) & (centers < 16000)]
    bands = [(c / 2 ** (1 / 6), c * 2 ** (1 / 6)) for c in centers]
    sr, R = load(a.reference)
    _, O = load(a.render)
    fr, dt = folded(R, sr, [a.ref_bar1 + (b - 1) * bar for b in a.bars], bar, bands)
    fo, _ = folded(
        O, sr, [LEAD_IN + (b - a.render_start) * bar for b in a.bars], bar, bands
    )
    win = int(a.window / dt)
    rows = []
    for s in a.steps:
        k = int((s - 1) * step / dt)
        rows.append(
            (
                10 * np.log10(fr[:, k : k + win].mean(1) + 1e-12),
                10 * np.log10(fo[:, k : k + win].mean(1) + 1e-12),
            )
        )
    r = np.mean([x for x, _ in rows], axis=0)
    o = np.mean([y for _, y in rows], axis=0)
    print(
        f"steps {a.steps}, first {a.window * 1000:.0f} ms, levels relative to each file's peak band"
    )
    print("Hz        " + "".join(f"{c:>6.0f}" for c in centers))
    print("reference " + "".join(f"{v:6.0f}" for v in r - r.max()))
    print("render    " + "".join(f"{v:6.0f}" for v in o - o.max()))
    print("diff      " + "".join(f"{v:+6.0f}" for v in (o - o.max()) - (r - r.max())))
    print(f"absolute level difference at peak: {o.max() - r.max():+.1f} dB")


def cmd_track(a, bar):
    sr, R = load(a.reference)
    _, O = load(a.render)
    out = []
    for name, x, starts in [
        ("ref", R, [a.ref_bar1 + (b - 1) * bar for b in a.bars]),
        ("render", O, [LEAD_IN + (b - a.render_start) * bar for b in a.bars]),
    ]:
        x, starts = crop(x, sr, starts, bar)
        f, _, Z = stft(x, sr, nperseg=8192, noverlap=8192 - 128)
        P = np.abs(Z) ** 2
        dt = 128 / sr
        for hz in a.freqs:
            e = P[(f > hz * 0.97) & (f < hz * 1.03)].sum(0)
            acc = np.zeros(32)
            for t0 in starts:
                for k in range(32):
                    i = int((t0 + k * bar / 32) / dt)
                    acc[k] += e[i : i + max(1, int(bar / 32 / dt))].mean()
            v = 10 * np.log10(acc / len(starts) + 1e-12)
            out.append((name, hz, v - v.max()))
    print(
        "1/32 note:     "
        + "".join(f"{k // 2 + 1:>4}" if k % 2 == 0 else "   ." for k in range(32))
    )
    for name, hz, v in out:
        print(f"{name:>6} {hz:6.0f}Hz " + "".join(f"{x:4.0f}" for x in v))


def step_matrix(x, sr, t0, bars, bar):
    x, (t0,) = crop(x, sr, [t0], bars * bar)
    bands = [(lo, hi) for _, lo, hi in FOLD_BANDS]
    B, dt = band_power(x, sr, bands, nper=2048, hop=128)
    step = bar / 16
    rows = []
    for s in range(bars * 16):
        k = int((t0 + s * step) / dt)
        rows.append(10 * np.log10(B[:, k : k + int(step / dt)].mean(1) + 1e-12))
    return np.array(rows)


def cmd_score(a, bar):
    sr, R = load(a.reference)
    errs = []
    for spec in a.sections:
        path, render_start, start, count = spec.rsplit(":", 3)
        render_start, start, count = int(render_start), int(start), int(count)
        _, O = load(path)
        r = step_matrix(R, sr, a.ref_bar1 + (start - 1) * bar, count, bar)
        o = step_matrix(O, sr, LEAD_IN + (start - render_start) * bar, count, bar)
        # Overall level per band is removed: this scores rhythm and tone only.
        d = (o - o.mean(0)) - (r - r.mean(0))
        err = float(np.sqrt(np.mean(d**2)))
        errs.append(err)
        print(f"  bars {start}-{start + count - 1}: {err:.2f} dB")
    print(f"  mean {np.mean(errs):.2f} dB")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ["fold", "spectrum", "track"]:
        p = sub.add_parser(name)
        p.add_argument("reference")
        p.add_argument("render")
        p.add_argument("--render-start", type=int, required=True)
        p.add_argument(
            "--bars", type=lambda s: [int(v) for v in s.split(",")], required=True
        )
        if name == "spectrum":
            p.add_argument(
                "--steps", type=lambda s: [int(v) for v in s.split(",")], required=True
            )
            p.add_argument("--window", type=float, default=0.04)
        if name == "track":
            p.add_argument(
                "--freqs",
                type=lambda s: [float(v) for v in s.split(",")],
                required=True,
            )
    p = sub.add_parser("score")
    p.add_argument("reference")
    p.add_argument("sections", nargs="+")
    for p in sub.choices.values():
        p.add_argument("--bpm", type=float, required=True)
        p.add_argument("--ref-bar1", type=float, required=True)
    a = ap.parse_args()
    bar = 16 * 60 / a.bpm / 4
    commands = {
        "fold": cmd_fold,
        "spectrum": cmd_spectrum,
        "track": cmd_track,
        "score": cmd_score,
    }
    commands[a.cmd](a, bar)


if __name__ == "__main__":
    main()
