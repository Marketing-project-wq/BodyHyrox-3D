#!/usr/bin/env python3
"""
Normalize already-cut 360° athlete frames so the viewer's cross-fade reads as
rotation, not a double-exposure ("two heads / ghosting").

The upload flow produces transparent PNG cut-outs, but each frame keeps its own
canvas size, subject scale and position. Between frames the body slides left and
right, grows and shrinks, and the feet float at different heights — so when the
viewer cross-fades frame N into N+1 you see two offset silhouettes. This pass
re-places every frame onto ONE uniform canvas with the subject cleaned, scaled
to a common height, centered horizontally and stood on a common feet baseline.
Because the public viewer draws each frame with `object-contain` inside a fixed
box, identical canvases + identical placement render pixel-aligned → clean spin.

Pipeline (OpenCV + Pillow only — no network, no model download):
  1. Read RGBA, take the alpha channel as the cut-out mask.
  2. Clean the mask: binarize, keep only the largest connected component
     (drops stray corner specks the cutter left behind), fill interior holes.
  3. Feather the cleaned edge (small Gaussian) for a soft, halo-free alpha, and
     re-key the RGB against it so nothing outside the body leaks colour.
  4. Measure the subject's tight bounding box on the cleaned mask.
  5. Scale by HEIGHT to a common target fraction of the canvas (a standing body's
     height is the stable dimension as it rotates; width is not).
  6. Paste onto a fresh transparent canvas: subject centered in x, feet on a
     common baseline in y.
  7. Validate every output (same size, centered, plausible coverage) and emit a
     per-frame JSON log.

Everything athlete-specific is a CLI flag or derived from the frames — nothing
is hardcoded to one person. Output aspect defaults to the viewer's frame box
(config `viewer360FrameStyle`, 168:395) so `object-contain` maps 1:1.

Usage:
  python3 scripts/normalize-360.py \
      --src  public/media/atlet-360/calysta \
      --out  public/media/atlet-360/calysta \
      --pattern 'frame_*.png' \
      --log  /tmp/normalize.json

Tunables (fractions of the canvas, so nothing is athlete-specific):
  --aspect-w 168 --aspect-h 395   output canvas aspect (match the viewer box)
  --canvas-h 1580                 output canvas height in px (width derived)
  --subject-h 0.90                target subject height as a fraction of canvas
  --foot-y   0.965                feet baseline as a fraction of canvas height
  --center-x 0.5                  subject horizontal center (fraction of width)
  --feather  1.6                  edge feather sigma in px (0 disables)
  --alpha-thresh 16               alpha cutoff for the binary mask (0..255)
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image


def clean_mask(alpha: np.ndarray, thresh: int) -> np.ndarray:
    """Binarize alpha, keep the largest blob, fill interior holes. Returns 0/255."""
    _, binm = cv2.threshold(alpha, thresh, 255, cv2.THRESH_BINARY)

    # Keep only the largest connected component (removes stray specks/corners).
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binm, connectivity=8)
    if n > 1:
        # label 0 is background; pick the largest non-background by area
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        binm = np.where(labels == largest, 255, 0).astype(np.uint8)

    # Fill interior holes: flood the background from a border seed, then invert.
    h, w = binm.shape
    ff = binm.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, mask, (0, 0), 255)          # fill outside-connected bg
    holes = cv2.bitwise_not(ff)                    # interior holes only
    filled = cv2.bitwise_or(binm, holes)

    # A gentle close to smooth pinholes along the edge.
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    filled = cv2.morphologyEx(filled, cv2.MORPH_CLOSE, k)
    return filled


def feather_alpha(binm: np.ndarray, sigma: float) -> np.ndarray:
    """Soft alpha from a binary mask: pull the edge in ~1px then blur."""
    if sigma <= 0:
        return binm
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    core = cv2.erode(binm, k, iterations=1)        # kill the 1px cutter halo
    a = cv2.GaussianBlur(core, (0, 0), sigmaX=sigma, sigmaY=sigma)
    return a


def bbox_of(binm: np.ndarray):
    ys, xs = np.where(binm > 0)
    if xs.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def process(path: str, out_path: str, cfg: dict) -> dict:
    im = Image.open(path).convert("RGBA")
    src = np.array(im)                              # H,W,4 (RGBA)
    rgb = src[:, :, :3].astype(np.float32)
    alpha = src[:, :, 3]

    binm = clean_mask(alpha, cfg["alpha_thresh"])
    bb = bbox_of(binm)
    if bb is None:
        raise ValueError(f"{os.path.basename(path)}: empty mask after cleanup")
    x0, y0, x1, y1 = bb
    bw, bh = x1 - x0, y1 - y0

    soft = feather_alpha(binm, cfg["feather"]).astype(np.float32) / 255.0

    # Re-key RGB against the soft alpha so only the body carries colour, then
    # crop the subject region (RGB + its soft alpha).
    a3 = soft[:, :, None]
    keyed = (rgb * a3).astype(np.uint8)
    sub_rgb = keyed[y0:y1, x0:x1]
    sub_a = (soft[y0:y1, x0:x1] * 255.0).astype(np.uint8)

    # Uniform output canvas.
    canvas_h = cfg["canvas_h"]
    canvas_w = int(round(canvas_h * cfg["aspect_w"] / cfg["aspect_h"]))

    # Scale by HEIGHT to the common target.
    target_h = cfg["subject_h"] * canvas_h
    scale = target_h / bh
    new_w = max(1, int(round(bw * scale)))
    new_h = max(1, int(round(bh * scale)))
    # If scaling by height overflows the canvas width, clamp by width instead.
    max_w = int(cfg.get("max_subject_w", 0.98) * canvas_w)
    if new_w > max_w:
        s2 = max_w / new_w
        new_w = max(1, int(round(new_w * s2)))
        new_h = max(1, int(round(new_h * s2)))
        scale *= s2

    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
    r_rgb = cv2.resize(sub_rgb, (new_w, new_h), interpolation=interp)
    r_a = cv2.resize(sub_a, (new_w, new_h), interpolation=interp)

    # Place: center-x, feet on baseline.
    canvas = np.zeros((canvas_h, canvas_w, 4), np.uint8)
    cx = int(round(cfg["center_x"] * canvas_w))
    baseline = int(round(cfg["foot_y"] * canvas_h))
    px = cx - new_w // 2
    py = baseline - new_h

    # Clip to canvas (in case a frame is unusually tall/wide).
    sx0 = max(0, -px); sy0 = max(0, -py)
    dx0 = max(0, px); dy0 = max(0, py)
    cw = min(new_w - sx0, canvas_w - dx0)
    ch = min(new_h - sy0, canvas_h - dy0)
    if cw > 0 and ch > 0:
        region = canvas[dy0:dy0 + ch, dx0:dx0 + cw]
        region[:, :, :3] = r_rgb[sy0:sy0 + ch, sx0:sx0 + cw]
        region[:, :, 3] = r_a[sy0:sy0 + ch, sx0:sx0 + cw]

    Image.fromarray(canvas, "RGBA").save(out_path)

    coverage = float((canvas[:, :, 3] > 8).sum()) / (canvas_h * canvas_w)
    return {
        "file": os.path.basename(out_path),
        "src_size": [int(src.shape[1]), int(src.shape[0])],
        "src_bbox": [x0, y0, x1, y1],
        "src_subject_wh": [bw, bh],
        "scale": round(scale, 4),
        "out_size": [canvas_w, canvas_h],
        "placed_center_x": round((px + new_w / 2) / canvas_w, 4),
        "placed_foot_y": round((py + new_h) / canvas_h, 4),
        "coverage": round(coverage, 4),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Normalize cut-out 360 frames onto a uniform canvas.")
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--pattern", default="frame_*.png")
    ap.add_argument("--log", default="")
    ap.add_argument("--aspect-w", type=float, default=168.0)
    ap.add_argument("--aspect-h", type=float, default=395.0)
    ap.add_argument("--canvas-h", type=int, default=1580)
    ap.add_argument("--subject-h", type=float, default=0.90)
    ap.add_argument("--foot-y", type=float, default=0.965)
    ap.add_argument("--center-x", type=float, default=0.5)
    ap.add_argument("--max-subject-w", type=float, default=0.98)
    ap.add_argument("--feather", type=float, default=1.6)
    ap.add_argument("--alpha-thresh", type=int, default=16)
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.src, args.pattern)))
    if not files:
        print(f"no files match {args.pattern} in {args.src}", file=sys.stderr)
        return 2
    os.makedirs(args.out, exist_ok=True)

    cfg = dict(
        aspect_w=args.aspect_w, aspect_h=args.aspect_h, canvas_h=args.canvas_h,
        subject_h=args.subject_h, foot_y=args.foot_y, center_x=args.center_x,
        max_subject_w=args.max_subject_w, feather=args.feather,
        alpha_thresh=args.alpha_thresh,
    )

    logs = []
    for f in files:
        out_path = os.path.join(args.out, os.path.splitext(os.path.basename(f))[0] + ".png")
        rec = process(f, out_path, cfg)
        logs.append(rec)
        print(f"  {rec['file']}: scale={rec['scale']} cx={rec['placed_center_x']} "
              f"foot={rec['placed_foot_y']} cover={rec['coverage']}")

    # Validation: uniform size, tight placement, plausible coverage.
    sizes = {tuple(r["out_size"]) for r in logs}
    cxs = [r["placed_center_x"] for r in logs]
    foots = [r["placed_foot_y"] for r in logs]
    covs = [r["coverage"] for r in logs]
    ok = True
    problems = []
    if len(sizes) != 1:
        ok = False; problems.append(f"non-uniform canvas sizes: {sizes}")
    if max(cxs) - min(cxs) > 0.01:
        ok = False; problems.append(f"center-x spread too high: {max(cxs)-min(cxs):.4f}")
    if max(foots) - min(foots) > 0.01:
        ok = False; problems.append(f"foot baseline spread too high: {max(foots)-min(foots):.4f}")
    med = float(np.median(covs))
    for r in logs:
        if med > 0 and abs(r["coverage"] - med) / med > 0.6:
            problems.append(f"{r['file']}: coverage {r['coverage']} far from median {med:.3f}")

    summary = {
        "src": args.src, "out": args.out, "count": len(logs),
        "canvas": list(next(iter(sizes))),
        "center_x_spread": round(max(cxs) - min(cxs), 4),
        "foot_y_spread": round(max(foots) - min(foots), 4),
        "coverage_median": round(med, 4),
        "validation_ok": ok,
        "problems": problems,
        "frames": logs,
    }
    if args.log:
        with open(args.log, "w") as fh:
            json.dump(summary, fh, indent=2)
    print(f"\n{'OK' if ok else 'WARN'}: {len(logs)} frames → canvas {summary['canvas']}, "
          f"cx spread {summary['center_x_spread']}, foot spread {summary['foot_y_spread']}")
    for p in problems:
        print(f"  ! {p}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
