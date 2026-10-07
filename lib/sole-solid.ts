import { STAGE_SOLE } from "@/lib/config";

/**
 * "Sol padat": the bottom of each shoe made solid and slightly darker, so the
 * athlete reads as standing ON the platform instead of the platform light
 * shining through soft cut-out soles. Works on the picture's own alpha (no
 * feet data needed), column by column:
 *  - sole bottom of a column = its lowest opaque pixel near the picture's
 *    lowest point (within `spreadPct`, so a raised back shoe counts too);
 *  - inside the band `bandPct` above it, half-transparent pixels that are
 *    surrounded by shoe (no transparent pixel within `interiorPct`) become
 *    opaque, and small see-through holes (shoe on both sides and above within
 *    `holePct`) are filled with the colour next to them. The outline is left
 *    alone: nothing outside the shoe is added, the edge isn't thickened;
 *  - a soft dark gradient over the last `darkPct` (strength `darkStrength`,
 *    neutral black whatever the theme colour).
 * Sizes are shares of the picture height. Used by the viewer when it draws a
 * frame (every live frame, no re-processing) and by the pipelines that make
 * new frames (studio + scripts/video360/sole_solid.py).
 */
export function solidifySoles(data: Uint8ClampedArray, w: number, h: number, y0: number): void {
  const S = STAGE_SOLE;
  const rows = data.length / 4 / w;
  const at = (x: number, y: number) => ((y - y0) * w + x) * 4;
  const A = (x: number, y: number) => data[at(x, y) + 3];
  let toe = -1;
  for (let y = y0 + rows - 1; y >= y0 && toe < 0; y--) for (let x = 0; x < w; x++) if (A(x, y) > 200) { toe = y; break; }
  if (toe < 0) return;
  const spread = Math.round(S.spreadPct * h);
  const band = Math.max(2, Math.round(S.bandPct * h));
  const dark = Math.max(1, Math.round(S.darkPct * h));
  const r = Math.max(1, Math.round(S.interiorPct * h));
  const gap = Math.max(1, Math.round(S.holePct * h));
  const top = Math.max(y0, toe - spread - band);
  const sb = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    for (let y = toe; y >= Math.max(y0, toe - spread); y--) if (A(x, y) > 200) { sb[x] = y; break; }
  }
  const orig = new Uint8ClampedArray(data); // decisions on the untouched picture
  const oA = (x: number, y: number) => (x < 0 || x >= w || y < y0 || y >= y0 + rows ? 0 : orig[((y - y0) * w + x) * 4 + 3]);
  for (let x = 0; x < w; x++) {
    const b = sb[x];
    if (b < 0) continue;
    for (let y = Math.max(top, b - band); y <= b; y++) {
      const i = at(x, y);
      const a = orig[i + 3];
      if (a > 0 && a < 255) {
        let inside = true;
        for (let dy = -r; dy <= r && inside; dy++) for (let dx = -r; dx <= r; dx++) if (oA(x + dx, y + dy) === 0) { inside = false; break; }
        if (inside) data[i + 3] = 255;
      } else if (a === 0 && y < b) {
        // a small hole: shoe left, right and above within `gap`
        let l = -1;
        let rr = -1;
        let up = false;
        for (let k = 1; k <= gap; k++) {
          if (l < 0 && oA(x - k, y) > 200) l = x - k;
          if (rr < 0 && oA(x + k, y) > 200) rr = x + k;
          if (!up && oA(x, y - k) > 200) up = true;
        }
        if (l >= 0 && rr >= 0 && up) {
          const j = at(l, y);
          data[i] = orig[j];
          data[i + 1] = orig[j + 1];
          data[i + 2] = orig[j + 2];
          data[i + 3] = 255;
        }
      }
    }
    // soft dark gradient at the very bottom of the sole
    for (let y = Math.max(top, b - dark); y <= b; y++) {
      const i = at(x, y);
      if (data[i + 3] === 0) continue;
      const t = 1 - (b - y) / dark;
      const f = 1 - S.darkStrength * t * t;
      data[i] *= f;
      data[i + 1] *= f;
      data[i + 2] *= f;
    }
  }
}

/** Apply solidifySoles to the bottom part of a 2D canvas (best effort: an unreadable canvas is left as is). */
export function solidifyCanvas(g: CanvasRenderingContext2D, w: number, h: number): void {
  if (!STAGE_SOLE.enabled || w < 4 || h < 4) return;
  const y0 = Math.floor(h * (1 - STAGE_SOLE.scanPct));
  try {
    const img = g.getImageData(0, y0, w, h - y0);
    solidifySoles(img.data, w, h, y0);
    g.putImageData(img, 0, y0);
  } catch {
    /* tainted / unreadable canvas: draw it as is */
  }
}
