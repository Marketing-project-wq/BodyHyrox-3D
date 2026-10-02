#!/usr/bin/env python3
"""Turn the locked pictures of fit_frames.py into the stage's picture set.

    python3 export_frames.py <fit-out-dir> <dest-dir> [count=120] [height=1260]
    PHOTOS_AT="90=right.jpg,180=back.jpg,270=left.jpg" python3 export_frames.py ...

<fit-out-dir> is the third argument of make_360_video.sh (it holds fit/ and
feet.json). Writes <count> WebP pictures evenly round the turn (000.webp =
Front, then every 360/count degrees, Right at count/4, Back at count/2, Left
at 3*count/4) and feet.json (version 3: the soles of every picture, for the
shadows). The stage picks the picture of the scenery angle and crossfades
neighbours, so no video decoding is needed (works in every browser).

PHOTOS_AT (optional): sharp photos of the athlete standing, put in place of
the pictures at those angles (each angle must fall on a picture). The
background is removed (rembg), the body made solid and locked to the same
sole line, height and centre as every other picture.
"""
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def photo_picture(path, ff, session, cw, ch):
    """A photo cut out, made solid and locked like the fit_frames pictures (cw x ch)."""
    from rembg import remove

    cut = np.asarray(remove(Image.open(path).convert("RGB"), session=session).convert("RGBA")).copy()
    cut[:, :, 3], _ = ff.solid(cut[:, :, 3])
    b = ff.body(cut[:, :, 3])
    if not b:
        sys.exit(f"no athlete found in {path}")
    return ff.lock(Image.fromarray(cut), b, cw, ch)


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
    photos = {}
    spec = os.environ.get("PHOTOS_AT", "").strip()
    if spec:
        from rembg import new_session

        ff = load("fit_frames", os.path.join(HERE, "fit_frames.py"))
        fb = load("foot_baseline", os.path.join(HERE, "..", "foot-baseline.py"))
        session = new_session(os.environ.get("REMBG_MODEL", "birefnet-general-lite"))
        first = Image.open(os.path.join(src, "fit", names[0]))
        for item in spec.split(","):
            ang, path = item.split("=", 1)
            k = round(float(ang) * count / 360) % count
            if abs(k * 360 / count - float(ang)) > 1e-6:
                sys.exit(f"{ang} degrees is not on a picture (every {360 / count} degrees)")
            pic = photo_picture(os.path.expanduser(path), ff, session, first.width, first.height)
            m = fb.measure_mask(np.asarray(pic)[:, :, 3] >= 128)
            photos[k] = (pic, [m["toe"], m["soles"]] if m else None)
            print(f"photo at {ang} degrees (picture {k:03d}): {path}")
    os.makedirs(dest, exist_ok=True)
    out = {}
    total = 0
    for k in range(count):
        i = k * n // count
        im = photos[k][0] if k in photos else Image.open(os.path.join(src, "fit", names[i])).convert("RGBA")
        w = round(im.width * height / im.height)
        if im.height != height:
            im = im.resize((w, height), Image.LANCZOS)
        name = f"{k:03d}.webp"
        path = os.path.join(dest, name)
        im.save(path, quality=82, method=6, alpha_quality=90)
        total += os.path.getsize(path)
        toe, soles = photos[k][1] if k in photos and photos[k][1] else feet[i]
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
