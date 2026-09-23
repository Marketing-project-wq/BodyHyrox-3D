#!/usr/bin/env python3
"""
Stabilize 360° athlete frames so the subject stays put between frames.

Handheld/non-turntable studio shots drift: the body slides horizontally and
bobs vertically frame to frame, which makes the viewer's cross-fade look like a
double-exposure ("two heads") and the rotation feel steppy. This re-centers each
transparent cut-out on a common vertical axis and a common feet baseline
(translation only — no scaling, so poses aren't distorted), so adjacent frames
line up and the cross-fade reads as rotation, not sliding.

It also emits the per-frame pixel offset it applied (JSON on stdout, or to
--offsets) so the sticker-zone hotspots can be shifted by the same amount and
stay glued to the body.

Usage:
  python3 scripts/stabilize-360.py \
      --src public/media/atlet-360/rani-pratiwi \
      --out public/media/atlet-360/rani-pratiwi \
      --pattern 'frame_*.png' --offsets /tmp/offsets.json

Anchors are fractions of the frame (so nothing is hardcoded to one athlete):
  --center-x 0.5   target horizontal center (fraction of width)
  --foot-y   0.962 target feet baseline     (fraction of height)
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

import numpy as np
from PIL import Image


def bbox(alpha: np.ndarray, thr: int):
    ys, xs = np.where(alpha > thr)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())


def main() -> int:
    ap = argparse.ArgumentParser(description="Re-center 360 cut-out frames on a common axis + baseline.")
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--pattern", default="frame_*.png")
    ap.add_argument("--center-x", type=float, default=0.5, help="Target horizontal center (fraction of width).")
    ap.add_argument("--foot-y", type=float, default=0.962, help="Target feet baseline (fraction of height).")
    ap.add_argument("--alpha-thr", type=int, default=24, help="Alpha above which a pixel counts as subject.")
    ap.add_argument("--offsets", default="", help="Write per-frame {dx,dy} offsets here (else stdout).")
    args = ap.parse_args()

    paths = sorted(glob.glob(os.path.join(args.src, args.pattern)))
    if not paths:
        print(f"No frames matched {args.pattern} in {args.src}", file=sys.stderr)
        return 1
    os.makedirs(args.out, exist_ok=True)

    offsets = {}
    for p in paths:
        im = Image.open(p).convert("RGBA")
        w, h = im.size
        a = np.array(im)[:, :, 3]
        bb = bbox(a, args.alpha_thr)
        if bb is None:
            print(f"skip (empty alpha): {p}", file=sys.stderr)
            continue
        x0, x1, y0, y1 = bb
        cx = (x0 + x1) / 2.0                        # silhouette center (stable vs. centroid)
        dx = int(round(args.center_x * w - cx))
        dy = int(round(args.foot_y * h - y1))       # anchor feet to a common baseline
        shifted = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        shifted.paste(im, (dx, dy), im)
        name = os.path.basename(p)
        shifted.save(os.path.join(args.out, name))
        offsets[name] = {"dx": dx, "dy": dy, "w": w, "h": h}
        print(f"{name}: dx={dx:+d} dy={dy:+d}", file=sys.stderr)

    out_json = json.dumps(offsets, indent=2)
    if args.offsets:
        with open(args.offsets, "w") as f:
            f.write(out_json)
        print(f"offsets -> {args.offsets}", file=sys.stderr)
    else:
        print(out_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
