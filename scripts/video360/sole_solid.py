"""
"Sol padat" for scripts/video360: the bottom of each shoe made solid and a
little darker, so the athlete stands ON the platform (the platform light no
longer shows through soft cut-out soles). Same rules and defaults as
lib/sole-solid.ts + STAGE_SOLE in lib/config.ts (keep them in step):

- sole bottom of a column = its lowest opaque pixel (alpha > 200) near the
  picture's lowest point (within SPREAD, so a raised back shoe counts too);
- in the BAND above it, half-transparent pixels with no transparent pixel
  within INTERIOR become opaque, and holes up to HOLE wide (shoe left, right
  and above) are filled with the colour next to them. The outline is kept:
  nothing is added outside the shoe, the edge is not thickened;
- a soft dark gradient over the last DARK (strength DARK_STRENGTH).

Sizes are shares of the picture height.
"""
import numpy as np
from PIL import Image

SPREAD, BAND, INTERIOR, HOLE, DARK, DARK_STRENGTH = 0.16, 0.045, 0.0012, 0.0025, 0.016, 0.35


def solidify(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert("RGBA")).copy()
    h, w = a.shape[:2]
    alpha = a[:, :, 3]
    rows = np.where((alpha > 200).any(axis=1))[0]
    if rows.size == 0:
        return im
    toe = int(rows.max())
    spread = round(SPREAD * h)
    band = max(2, round(BAND * h))
    dark = max(1, round(DARK * h))
    r = max(1, round(INTERIOR * h))
    gap = max(1, round(HOLE * h))
    orig = a.copy()
    oa = orig[:, :, 3].astype(int)
    pad = np.pad(oa, r, constant_values=0)
    # min alpha in a (2r+1)^2 window (only needs "any zero nearby")
    zero = (pad == 0).astype(np.uint8)
    win = np.zeros_like(oa, dtype=np.uint8)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            win |= zero[r + dy : r + dy + h, r + dx : r + dx + w]
    lo = max(0, toe - spread)
    for x in range(w):
        col = np.where(oa[lo : toe + 1, x] > 200)[0]
        if col.size == 0:
            continue
        b = lo + int(col.max())
        for y in range(max(0, b - band), b + 1):
            v = oa[y, x]
            if 0 < v < 255 and not win[y, x]:
                a[y, x, 3] = 255
            elif v == 0 and y < b:
                left = next((x - k for k in range(1, gap + 1) if x - k >= 0 and oa[y, x - k] > 200), -1)
                right = next((x + k for k in range(1, gap + 1) if x + k < w and oa[y, x + k] > 200), -1)
                up = any(y - k >= 0 and oa[y - k, x] > 200 for k in range(1, gap + 1))
                if left >= 0 and right >= 0 and up:
                    a[y, x, :3] = orig[y, left, :3]
                    a[y, x, 3] = 255
        for y in range(max(0, b - dark), b + 1):
            if a[y, x, 3] == 0:
                continue
            t = 1 - (b - y) / dark
            a[y, x, :3] = (a[y, x, :3] * (1 - DARK_STRENGTH * t * t)).astype(np.uint8)
    return Image.fromarray(a, "RGBA")
