#!/usr/bin/env python3
"""Turn the locked pictures of fit_frames.py into the stage's picture set.

    python3 export_frames.py <fit-out-dir> <dest-dir> [count=120] [height=1260]

<fit-out-dir> is the third argument of make_360_video.sh (it holds fit/ and
feet.json). Writes <count> WebP pictures evenly round the turn (000.webp =
Front, then every 360/count degrees, Right at count/4, Back at count/2, Left
at 3*count/4) and feet.json (version 3: the soles of every picture, for the
shadows). The stage picks the picture of the scenery angle and crossfades
neighbours, so no video decoding is needed (works in every browser).
"""
import json
import os
import sys

from PIL import Image


def main():
    src, dest = sys.argv[1], sys.argv[2]
    count = int(sys.argv[3]) if len(sys.argv) > 3 else 120
    height = int(sys.argv[4]) if len(sys.argv) > 4 else 1260
    if count < 4 or count % 4:
        sys.exit("count must be a multiple of 4 (the four sides)")
    names = sorted(f for f in os.listdir(os.path.join(src, "fit")) if f.endswith(".png"))
    feet = json.load(open(os.path.join(src, "feet.json")))["feet"]
    n = len(names)
    if n % count:
        sys.exit(f"{n} pictures can't be split evenly into {count}")
    os.makedirs(dest, exist_ok=True)
    out = {}
    total = 0
    for k in range(count):
        i = k * n // count
        im = Image.open(os.path.join(src, "fit", names[i])).convert("RGBA")
        w = round(im.width * height / im.height)
        if im.height != height:
            im = im.resize((w, height), Image.LANCZOS)
        name = f"{k:03d}.webp"
        path = os.path.join(dest, name)
        im.save(path, quality=82, method=6, alpha_quality=90)
        total += os.path.getsize(path)
        toe, soles = feet[i]
        out[name] = {
            "v": 3,
            "toe": toe,
            "back": min(s[2] for s in soles),
            "left": min(s[0] for s in soles),
            "right": max(s[1] for s in soles),
            "soles": soles,
        }
    json.dump({"version": 3, "frames": out}, open(os.path.join(dest, "feet.json"), "w"), separators=(",", ":"))
    print(f"{count} pictures ({w}x{height}), {total / 1e6:.1f} MB, feet.json written to {dest}")


if __name__ == "__main__":
    main()
