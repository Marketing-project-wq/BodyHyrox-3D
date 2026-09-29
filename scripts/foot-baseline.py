#!/usr/bin/env python3
"""
Measure where the athlete's feet touch the ground in every 360° frame, so the
viewer can stand the figure ON the platform (feet napak) and draw a contact
shadow under EACH foot — whatever the frame's transparent margin is.

For each frame (RGBA cut-out, in rotation order) it writes, as fractions of the
image size (0..1, origin top-left):
  toe     lowest opaque row (the sole nearest the camera; the viewer anchors it
          on the platform)
  back    bottom row of the other foot (higher on screen when it stands behind)
  left, right   horizontal extent of the feet in the bottom band
  soles   one entry per shoe (max 2): [x0, x1, b] = the sole's contact span
          (columns whose bottom is within the contact tolerance of that shoe's
          bottom) and its bottom row. In side views the back shoe is usually
          hidden behind the front one in the same columns; it is found as the
          second bottom edge above a transparent gap.
  top, cx head row / body centre x (admin alignment)
  v       3 (this algorithm)

The same rules are implemented in lib/media360.ts (measureFrame), so the
browser and this script produce the same numbers (keep them in sync):
  opaque = alpha >= 128; toe = lowest row with >= 2 opaque px; tolerances are
  whole pixels (round(fraction * size)).

Usage (reusable for any athlete):
  python3 scripts/foot-baseline.py public/media/atlet-360/<slug> [--pattern 'frame_*.webp']
Writes <folder>/feet.json:  {"version":3, "frames": {"frame_00.webp": {...}, ...}}
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import sys

import numpy as np
from PIL import Image

# Shared constants (mirror lib/media360.ts FEET).
BAND = 0.10  # feet band above the toe (front soles, extents)
BACK_BAND = 0.20  # how far above the toe a hidden back shoe may be
CONTACT = 0.012  # sole contact tolerance (share of height)
BRIDGE = 0.02  # column gaps up to this share of width join one shoe
GAP = 0.004  # min transparent gap under a hidden back shoe (share of height)
MIN_BACK_W = 0.04  # min width of a hidden back shoe (share of width)


def px(v: float) -> int:
    """Round half up (same as Math.round in lib/media360.ts)."""
    return int(math.floor(v + 0.5))


def _runs(values: list[int], lo: int, hi: int, bridge: int) -> list[tuple[int, int]]:
    """Column runs where values[x] >= 0, joining gaps up to `bridge` columns."""
    runs: list[tuple[int, int]] = []
    start = -1
    end = -1
    gap = 0
    for x in range(lo, hi + 2):
        if x <= hi and values[x] >= 0:
            if start < 0:
                start = x
            end = x
            gap = 0
        elif start >= 0:
            gap += 1
            if gap > bridge or x > hi:
                runs.append((start, end))
                start = -1
                gap = 0
    return runs


def _sole(values: list[int], x0: int, x1: int, tol: int, w: int, h: int) -> list[float]:
    b = max(values[x0 : x1 + 1])
    near = [x for x in range(x0, x1 + 1) if values[x] >= b - tol]
    return [min(near) / w, (max(near) + 1) / w, (b + 1) / h]


def measure_mask(m: np.ndarray) -> dict | None:
    h, w = m.shape
    counts = m.sum(1)
    rows = np.where(counts >= 2)[0]
    if not len(rows):
        return None
    toe = int(rows.max())
    top = int(rows.min())
    band = max(0, toe - px(BAND * h))
    reg = m[band : toe + 1]
    cols = np.where(reg.any(0))[0]
    left, right = int(cols.min()), int(cols.max())
    tol = px(CONTACT * h)
    bridge = max(2, px(BRIDGE * w))

    # Front contacts: the lowest opaque pixel per column in the feet band.
    colbot = [-1] * w
    for x in range(left, right + 1):
        r = np.where(reg[:, x])[0]
        if len(r):
            colbot[x] = band + int(r.max())
    runs = _runs(colbot, left, right, bridge)
    runs = sorted(sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[:2])
    soles = [_sole(colbot, x0, x1, tol, w, h) for x0, x1 in runs]

    # Hidden back shoe (side views): above the lowest run of a column, after a
    # transparent gap, the next opaque pixel is the bottom of the shoe behind.
    if len(soles) == 1:
        lim = max(0, toe - px(BACK_BAND * h))
        gap_min = max(2, px(GAP * h))
        upper = [-1] * w
        for x in range(w):
            y = toe
            while y >= lim and not m[y, x]:
                y -= 1
            if y < lim:
                continue
            while y >= lim and m[y, x]:
                y -= 1
            g = 0
            while y >= lim and not m[y, x]:
                g += 1
                y -= 1
            if y >= lim and g >= gap_min:
                upper[x] = y
        uruns = [r for r in _runs(upper, 0, w - 1, bridge) if r[1] - r[0] + 1 >= px(MIN_BACK_W * w)]
        if uruns:
            x0, x1 = max(uruns, key=lambda r: r[1] - r[0])
            soles.append(_sole(upper, x0, x1, tol, w, h))
            soles.sort(key=lambda s: s[0])

    ys, xs = np.nonzero(m)
    return {
        "toe": (toe + 1) / h,
        "back": min(s[2] for s in soles),
        "left": left / w,
        "right": (right + 1) / w,
        "soles": soles,
        "top": top / h,
        "cx": float(xs.mean()) / w,
        "v": 3,
    }


def measure(path: str) -> dict:
    a = np.array(Image.open(path).convert("RGBA"))[:, :, 3]
    out = measure_mask(a >= 128)
    if out is None:
        raise ValueError(f"{path}: no opaque pixels")
    r = lambda v: round(v, 5)  # noqa: E731
    out = {k: (r(v) if isinstance(v, float) else v) for k, v in out.items()}
    out["soles"] = [[r(v) for v in s] for s in out["soles"]]
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("--pattern", default="frame_*.webp")
    args = ap.parse_args()
    files = sorted(glob.glob(os.path.join(args.folder, args.pattern)))
    if not files:
        print("no frames found", file=sys.stderr)
        return 1
    out = {"version": 3, "frames": {}}
    for f in files:
        out["frames"][os.path.basename(f)] = measure(f)
    dst = os.path.join(args.folder, "feet.json")
    with open(dst, "w") as fh:
        json.dump(out, fh, indent=1)
    two = sum(1 for v in out["frames"].values() if len(v["soles"]) == 2)
    print(f"{len(files)} frames -> {dst}  (two soles found in {two})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
