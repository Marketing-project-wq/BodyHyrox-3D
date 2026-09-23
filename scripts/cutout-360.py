#!/usr/bin/env python3
"""
Reusable background cutout for 360° athlete frames.

Turns plain-background studio shots (e.g. a person on a flat grey wall) into
transparent PNGs so the athlete stands directly on the neon stage — no grey box.
Designed for the *production* workflow too: every athlete's 360 photos are shot
on a plain backdrop, so the same command cuts any new set.

Pipeline (OpenCV only — no network, no ML model download):
  1. GrabCut with a rectangle init (person is centered with a margin) to get a
     first foreground/background split.
  2. Keep the largest connected component (drops stray specks).
  3. Suppress leftover backdrop colour connected to the subject (the soft floor
     shadow near the feet) by comparing against the sampled border colour in Lab.
  4. Morphological clean-up, pull the edge in 1px to kill the grey halo, then a
     light feather for a smooth alpha.

Usage:
  python3 scripts/cutout-360.py \
      --src public/media/atlet-360/rani-pratiwi \
      --out public/media/atlet-360/rani-pratiwi \
      --pattern 'frame_*.jpg'

Output files keep the same basename with a .png extension. Tunables are CLI
flags (nothing about a specific athlete or frame is hardcoded here).
"""
from __future__ import annotations

import argparse
import glob
import os
import sys

import cv2
import numpy as np


def sample_border_lab(bgr: np.ndarray, ring: int = 4) -> np.ndarray:
    """Median Lab colour of the outer `ring` px — the plain backdrop."""
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    h, w = lab.shape[:2]
    mask = np.zeros((h, w), bool)
    mask[:ring, :] = mask[-ring:, :] = True
    mask[:, :ring] = mask[:, -ring:] = True
    return np.median(lab[mask].reshape(-1, 3), axis=0)


def cutout(bgr: np.ndarray, args) -> np.ndarray:
    h, w = bgr.shape[:2]

    # 1) GrabCut with a rectangle inset from the borders.
    mx, my = int(w * args.margin_x), int(h * args.margin_y)
    rect = (mx, my, w - 2 * mx, h - 2 * my)
    gc = np.zeros((h, w), np.uint8)
    cv2.grabCut(bgr, gc, rect, np.zeros((1, 65), np.float64),
                np.zeros((1, 65), np.float64), args.iters, cv2.GC_INIT_WITH_RECT)
    fg = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    # 3) Suppress backdrop-coloured pixels still attached to the subject
    #    (soft floor shadow near the feet). Neutral grey wall is close to the
    #    sampled border colour AND low-saturation; skin/clothing are not.
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    ref = sample_border_lab(bgr).astype(np.float32)
    dist = np.linalg.norm(lab - ref, axis=2)              # Lab distance to backdrop
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1]
    backdrop = (dist < args.bg_dist) & (sat < args.bg_sat)
    fg[backdrop] = 0

    # 3b) Re-fill holes that are ENCLOSED by the body. Backdrop suppression can
    #     punch specks out of pale-skin highlights; those specks are surrounded
    #     by foreground, so a border flood-fill leaves them as "holes" to restore.
    #     An external shadow shard is border-connected, so it stays removed.
    ff = (255 - fg).copy()
    ffmask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, ffmask, (0, 0), 0)  # border-connected background -> 0
    fg[ff > 0] = 255                        # remaining 255 = enclosed holes -> fill

    # 4) Clean: close pinholes, then open to sever thin bridges that connect any
    #    leftover shadow shard to the body.
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, k, iterations=2)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, k, iterations=1)

    # 2) Keep the largest component *after* opening, so severed shards drop off.
    ncomp, lbl, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if ncomp > 1:
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        fg = np.where(lbl == biggest, 255, 0).astype(np.uint8)

    # Pull the edge in 1px (kill grey halo), then feather for a smooth alpha.
    fg = cv2.erode(fg, k, iterations=1)
    alpha = cv2.GaussianBlur(fg, (3, 3), 0)

    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return np.dstack([rgb, alpha])


def main() -> int:
    ap = argparse.ArgumentParser(description="Cut athletes out of plain-background 360 frames.")
    ap.add_argument("--src", required=True, help="Input folder with frames.")
    ap.add_argument("--out", required=True, help="Output folder for transparent PNGs.")
    ap.add_argument("--pattern", default="frame_*.jpg", help="Glob for input frames.")
    ap.add_argument("--margin-x", type=float, default=0.04, help="Horizontal rect inset (0..0.5).")
    ap.add_argument("--margin-y", type=float, default=0.03, help="Vertical rect inset (0..0.5).")
    ap.add_argument("--iters", type=int, default=6, help="GrabCut iterations.")
    ap.add_argument("--bg-dist", type=float, default=28.0, help="Lab distance under which a pixel counts as backdrop.")
    ap.add_argument("--bg-sat", type=int, default=48, help="Max HSV saturation for a backdrop pixel.")
    args = ap.parse_args()

    from PIL import Image  # local import: only needed for the alpha PNG save

    paths = sorted(glob.glob(os.path.join(args.src, args.pattern)))
    if not paths:
        print(f"No frames matched {args.pattern} in {args.src}", file=sys.stderr)
        return 1
    os.makedirs(args.out, exist_ok=True)

    for p in paths:
        bgr = cv2.imread(p)
        if bgr is None:
            print(f"skip (unreadable): {p}", file=sys.stderr)
            continue
        rgba = cutout(bgr, args)
        name = os.path.splitext(os.path.basename(p))[0] + ".png"
        dst = os.path.join(args.out, name)
        Image.fromarray(rgba, "RGBA").save(dst)
        cov = float((rgba[:, :, 3] > 8).mean())
        print(f"{os.path.basename(p)} -> {name}  (subject covers {cov*100:.0f}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
