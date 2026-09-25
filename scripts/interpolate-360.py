#!/usr/bin/env python3
"""
Interpolate 360° athlete frames to a higher count for smoother rotation.

Image-sequence rotation only looks fluid with enough angles. A 12-shot turntable
(30°/frame) always steps; this synthesizes in-between frames with OpenCV DIS
optical flow (bidirectional warp + blend of both RGB and alpha) to reach e.g. 36
frames (10°/frame). No GPU/model download — runs anywhere OpenCV runs. It is a
best-effort synthesis: quality tracks the source (aligned, background-free frames
interpolate cleanest), so preview before shipping.

Input frames must be the STABILIZED cut-outs (aligned + transparent), in rotation
order. With `--hotspots-in`, it also produces hotspots on the new frame grid by
linearly interpolating each zone between adjacent keyframes that both define it
(so the sticker zones ride the synthetic frames and vanish where a zone isn't
visible). Nothing here is athlete-specific — the factor and paths are arguments.

Usage:
  python3 scripts/interpolate-360.py \
      --src public/media/atlet-360/<slug>/_src \
      --out public/media/atlet-360/<slug> \
      --pattern 'frame_*.png' --factor 3 \
      --hotspots-in /tmp/hot12.json --hotspots-out /tmp/hot36.json
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


def load_rgba(p):
    im = np.array(Image.open(p).convert("RGBA"))
    return im[:, :, :3].astype(np.float32), im[:, :, 3].astype(np.float32) / 255.0


def despeckle(rgb, a, max_area=60, dark=60):
    """Inpaint SMALL dark specks sitting on the body (low-res cut-out noise that
    the flow would otherwise smear into migrating blobs). Large dark regions
    (clothing) are kept: only tiny connected dark components are removed."""
    body = (a > 0.5).astype(np.uint8)
    gray = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2GRAY)
    darkmask = ((gray < dark) & (body > 0)).astype(np.uint8)
    ncomp, lbl, stats, _ = cv2.connectedComponentsWithStats(darkmask, 8)
    speck = np.zeros_like(darkmask)
    for c in range(1, ncomp):
        if stats[c, cv2.CC_STAT_AREA] <= max_area:
            speck[lbl == c] = 255
    if speck.any():
        speck = cv2.dilate(speck, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)), 1)
        rgb = cv2.inpaint(rgb.astype(np.uint8), speck, 3, cv2.INPAINT_TELEA).astype(np.float32)
    return rgb


def flow_pair(rgbA, aA, rgbB, aB):
    """DIS optical flow both ways, computed on the alpha-masked (on-black) image
    so the (now irrelevant) studio background can't pull the flow."""
    gA = cv2.cvtColor((rgbA * aA[:, :, None]).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    gB = cv2.cvtColor((rgbB * aB[:, :, None]).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    return dis.calc(gA, gB, None), dis.calc(gB, gA, None)


def synth(rgbA, aA, rgbB, aB, F01, F10, t, grid):
    X, Y = grid
    m0 = (X - t * F01[:, :, 0], Y - t * F01[:, :, 1])
    m1 = (X - (1 - t) * F10[:, :, 0], Y - (1 - t) * F10[:, :, 1])
    w0 = cv2.remap(rgbA, m0[0], m0[1], cv2.INTER_LINEAR)
    w1 = cv2.remap(rgbB, m1[0], m1[1], cv2.INTER_LINEAR)
    a0 = cv2.remap(aA, m0[0], m0[1], cv2.INTER_LINEAR)
    a1 = cv2.remap(aB, m1[0], m1[1], cv2.INTER_LINEAR)
    rgb = np.clip((1 - t) * w0 + t * w1, 0, 255).astype(np.uint8)
    a = (np.clip((1 - t) * a0 + t * a1, 0, 1) * 255).astype(np.uint8)
    return np.dstack([rgb, a])


def interp_hotspots(hots, n_key, factor):
    """Place each zone on the factor*n_key grid, interpolating linearly between
    adjacent (in rotation, incl. wrap) keyframes that both define it."""
    out = []
    for h in hots:
        pts_in = {int(k): (float(v["x"]), float(v["y"])) for k, v in h["points"].items()}
        keys = sorted(pts_in)
        new_pts = {}
        for k in keys:  # keyframe k (1-based) -> new index
            new_pts[str((k - 1) * factor + 1)] = {"x": round(pts_in[k][0], 4), "y": round(pts_in[k][1], 4)}
        for a in keys:  # interpolate across each adjacent visible pair
            b = a + 1 if a < n_key else 1
            if b not in pts_in:
                continue
            (ax, ay), (bx, by) = pts_in[a], pts_in[b]
            base = (a - 1) * factor + 1
            for j in range(1, factor):
                t = j / factor
                new_pts[str(base + j)] = {"x": round(ax + (bx - ax) * t, 4), "y": round(ay + (by - ay) * t, 4)}
        out.append({"label": h["label"], "athlete_zone_id": h["athlete_zone_id"], "points": new_pts})
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Interpolate 360 frames (OpenCV DIS flow) for smoother rotation.")
    ap.add_argument("--src", required=True, help="Folder of stabilized keyframes.")
    ap.add_argument("--out", required=True, help="Folder for the interpolated display frames.")
    ap.add_argument("--pattern", default="frame_*.png")
    ap.add_argument("--factor", type=int, default=3, help="Frames per keyframe gap (3 => 12 -> 36).")
    ap.add_argument("--despeckle", action="store_true", help="Inpaint tiny dark cut-out specks before flow.")
    ap.add_argument("--hotspots-in", default="")
    ap.add_argument("--hotspots-out", default="")
    args = ap.parse_args()

    paths = sorted(glob.glob(os.path.join(args.src, args.pattern)))
    if len(paths) < 2:
        print(f"Need >=2 keyframes in {args.src}", file=sys.stderr)
        return 1
    n = len(paths)
    frames = [load_rgba(p) for p in paths]
    if args.despeckle:
        frames = [(despeckle(rgb, a), a) for rgb, a in frames]
    h, w = frames[0][1].shape
    X, Y = np.meshgrid(np.arange(w), np.arange(h))
    grid = (X.astype(np.float32), Y.astype(np.float32))
    os.makedirs(args.out, exist_ok=True)

    total = n * args.factor
    written = 0
    for i in range(n):
        a_rgb, a_a = frames[i]
        b_rgb, b_a = frames[(i + 1) % n]
        F01, F10 = flow_pair(a_rgb, a_a, b_rgb, b_a)
        for j in range(args.factor):
            idx = i * args.factor + j  # 0-based display index
            if j == 0:
                rgba = np.dstack([a_rgb.astype(np.uint8), (a_a * 255).astype(np.uint8)])  # keyframe verbatim
            else:
                rgba = synth(a_rgb, a_a, b_rgb, b_a, F01, F10, j / args.factor, grid)
            Image.fromarray(rgba, "RGBA").save(os.path.join(args.out, f"frame_{idx + 1:02d}.png"))
            written += 1
        print(f"gap {i+1}->{(i % n)+2 if i < n-1 else 1}: wrote {args.factor} frames", file=sys.stderr)
    print(f"{written}/{total} display frames -> {args.out}", file=sys.stderr)

    if args.hotspots_in:
        hots = json.load(open(args.hotspots_in))
        new = interp_hotspots(hots, n, args.factor)
        js = json.dumps(new)
        if args.hotspots_out:
            open(args.hotspots_out, "w").write(js)
            print(f"hotspots ({n} -> {total}-grid) -> {args.hotspots_out}", file=sys.stderr)
        else:
            print(js)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
