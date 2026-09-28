#!/usr/bin/env python3
"""
Measure where the athlete's feet touch the ground in every 360° frame, so the
viewer can stand the figure ON the platform (feet napak) and draw a matching
contact shadow — whatever the frame's transparent margin is.

For each frame (RGBA cut-out, in rotation order) it writes, as fractions of the
image size (0..1, origin top-left):
  toe     lowest opaque row (the front-most sole touching the ground)
  back    lowest row of the other foot (higher on screen when one foot is
          behind the other, e.g. side / 3/4 views)
  left, right   horizontal extent of the feet in the bottom band
Opaque = alpha > 0.5; connected specks smaller than --min-area px are ignored so
cut-out fringe/noise can't fake a lower "floor".

Usage (reusable for any athlete):
  python3 scripts/foot-baseline.py public/media/atlet-360/<slug> [--pattern 'frame_*.webp']
Writes <folder>/feet.json:  {"version":1, "frames": {"frame_00.webp": {...}, ...}}
The viewer loads it if present; otherwise it measures the same way in the
browser at load time.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

try:  # optional: cleaner speck removal
    from scipy import ndimage  # type: ignore
except Exception:  # pragma: no cover
    ndimage = None


def measure(path: str, min_area: int, band: float) -> dict:
    a = np.array(Image.open(path).convert("RGBA"))[:, :, 3].astype(np.float32) / 255.0
    h, w = a.shape
    m = a > 0.5
    if ndimage is not None:
        lbl, n = ndimage.label(m)
        if n:
            sizes = ndimage.sum(m, lbl, range(1, n + 1))
            keep = np.isin(lbl, [i + 1 for i, s in enumerate(sizes) if s >= min_area])
            m = keep
    rows = np.where(m.any(1))[0]
    if not len(rows):
        raise ValueError(f"{path}: no opaque pixels")
    toe = int(rows.max())
    top = max(0, int(toe - band * h))
    reg = m[top : toe + 1]
    cols = np.where(reg.any(0))[0]
    left, right = int(cols.min()), int(cols.max())
    cx = int(round(cols.mean()))

    def low(sl):
        r = np.where(reg[:, sl].any(1))[0]
        return top + int(r.max()) if len(r) else toe

    feet = sorted([low(slice(left, cx)), low(slice(cx, right + 1))])
    return {
        "toe": round((toe + 1) / h, 5),
        "back": round((feet[0] + 1) / h, 5),
        "left": round(left / w, 5),
        "right": round((right + 1) / w, 5),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("--pattern", default="frame_*.webp")
    ap.add_argument("--min-area", type=int, default=40, help="Ignore opaque specks smaller than this (px).")
    ap.add_argument("--band", type=float, default=0.10, help="Height of the feet band above the toe (fraction).")
    args = ap.parse_args()
    files = sorted(glob.glob(os.path.join(args.folder, args.pattern)))
    if not files:
        print("no frames found", file=sys.stderr)
        return 1
    out = {"version": 1, "frames": {}}
    for f in files:
        out["frames"][os.path.basename(f)] = measure(f, args.min_area, args.band)
    dst = os.path.join(args.folder, "feet.json")
    with open(dst, "w") as fh:
        json.dump(out, fh, indent=1)
    toes = [v["toe"] for v in out["frames"].values()]
    print(f"{len(files)} frames -> {dst}  toe min/max {min(toes):.4f}/{max(toes):.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
