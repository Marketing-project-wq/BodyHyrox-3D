/**
 * 360 photo set: per-frame metadata shared by the admin studio and the public
 * viewer. Pure helpers (no server imports) — safe in client components.
 *
 * A frame's transform is non-destructive: the file is never changed; the
 * viewer applies it as a CSS transform around the frame's foot point, so the
 * athlete can be straightened / re-centred / resized while the feet stay on
 * the platform.
 */

/** Where the feet touch the ground, as fractions of the image (see scripts/foot-baseline.py). */
export type Foot = {
  toe: number;
  back: number;
  left: number;
  right: number;
  soles?: number[][];
  /** Top of the head (fraction of height) — admin alignment only. */
  top?: number;
  /** Body centre x (fraction of width) — admin alignment only. */
  cx?: number;
  /** Upper-body lean (deg, + = head to the right of the hips) — admin alignment only. */
  lean?: number;
  /** 3 = two-contact detection (current). Older feet are re-measured. */
  v?: number;
  /** Contact points placed by hand in the studio (never re-measured). */
  manual?: boolean;
};

/**
 * rot: degrees (clockwise), dx/dy: fraction of the frame width/height,
 * s: scale. lock (default true): the viewer keeps the feet on the platform,
 * so dy only matters with lock off.
 */
export type FrameTransform = { rot: number; dx: number; dy: number; s: number; lock?: boolean };
export const IDENTITY: FrameTransform = { rot: 0, dx: 0, dy: 0, s: 1 };

/** A previous version of a frame slot (for Undo/Restore). */
export type PrevFile = { file: string; base: string | null };
export type FrameMeta = { t?: FrameTransform; foot?: Foot; prev?: PrevFile[] };
export type FrameMetaMap = Record<string, FrameMeta>;

/**
 * A frame in the working draft. `base` = the public folder the file lives in
 * (null = still in the private draft bucket). `origin` = the published frame
 * this slot came from (replace/reorder keep it; new frames have none), so
 * zone markers and the Front/Right/Back/Left picks follow the slot on publish.
 */
export type DraftFrame = { file: string; base: string | null; origin: string | null };
/**
 * A turn set: the frames are poses all round the athlete. angles[i] = the turn
 * angle of frame i (degrees, 0 = Front, 90 = Right, strictly increasing);
 * blendShare = share of each step between two poses spent crossfading
 * (centred between them; each pose holds still for the rest). The stage
 * turns such a set (docs/STAGE_SPEC.md); other sets show the 4 sides.
 */
export type TurnSet = { v: 1; angles: number[]; blendShare?: number };

/** A valid turn set for `n` frames, or null (never trusts stored / sent data). */
export function parseTurnSet(raw: unknown, n: number): TurnSet | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { angles?: unknown; blendShare?: unknown };
  if (!Array.isArray(r.angles) || r.angles.length !== n || n < 4) return null;
  const angles = r.angles.map((a) => Number(a));
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(angles[i]) || angles[i] < 0 || angles[i] >= 360) return null;
    if (i > 0 && angles[i] <= angles[i - 1]) return null;
  }
  const b = Number(r.blendShare);
  return { v: 1, angles, ...(Number.isFinite(b) && b >= 0 && b <= 1 ? { blendShare: b } : {}) };
}

export type Media360Draft = {
  frames: DraftFrame[];
  meta: FrameMetaMap;
  /** A turn set made from the materials ("Buat set putaran"); goes live with Publish. */
  turn?: TurnSet | null;
  /** Set when the draft replaces them outright (bulk upload, version restore). */
  views?: Record<string, string> | null;
  hotspots?: unknown[];
  note?: string;
  updatedAt?: string;
};

export const isIdentity = (t?: FrameTransform | null) =>
  !t || (Math.abs(t.rot) < 1e-4 && Math.abs(t.dx) < 1e-5 && Math.abs(t.dy) < 1e-5 && Math.abs(t.s - 1) < 1e-5 && t.lock !== false);

/** Pivot of the transform: the feet (centre of the soles, on the ground line). */
export function pivotOf(foot: Foot | null | undefined): { x: number; y: number } {
  if (!foot) return { x: 0.5, y: 0.965 };
  return { x: foot.cx ?? (foot.left + foot.right) / 2, y: foot.toe };
}

/** CSS transform (+ origin) of one frame image inside its box. */
export function frameCss(t: FrameTransform | undefined, foot: Foot | null | undefined): { transform: string; transformOrigin: string } {
  const p = pivotOf(foot);
  const origin = `${(p.x * 100).toFixed(3)}% ${(p.y * 100).toFixed(3)}%`;
  if (!t || isIdentity(t)) return { transform: "none", transformOrigin: origin };
  return {
    transform: `translate(${(t.dx * 100).toFixed(3)}%, ${(t.dy * 100).toFixed(3)}%) rotate(${t.rot.toFixed(3)}deg) scale(${t.s.toFixed(4)})`,
    transformOrigin: origin,
  };
}

/**
 * The feet as the viewer should see them after the transform: x moved with
 * dx and the scale about the pivot; the ground line follows dy only when the
 * feet are not locked to the platform.
 */
export function transformFoot(foot: Foot, t: FrameTransform | undefined): Foot {
  if (!t || isIdentity(t)) return foot;
  const p = pivotOf(foot);
  const X = (x: number) => p.x + (x - p.x) * t.s + t.dx;
  const Y = (y: number) => p.y + (y - p.y) * t.s + (t.lock === false ? 0 : t.dy);
  return {
    ...foot,
    toe: Y(foot.toe),
    back: Y(foot.back),
    left: X(foot.left),
    right: X(foot.right),
    soles: foot.soles?.map(([x0, x1, b, ...rest]) => [X(x0), X(x1), Y(b), ...rest]),
    top: foot.top == null ? undefined : Y(foot.top),
    cx: foot.cx == null ? undefined : X(foot.cx),
    lean: foot.lean == null ? undefined : foot.lean + t.rot,
  };
}

/**
 * Measure the feet (and, for the admin, head/centre/lean) of a decoded image.
 * Same rules as scripts/foot-baseline.py. Throws nothing; null when the image
 * can't be read (cross-origin without CORS) or has no opaque pixels.
 */
export function measureFrame(img: HTMLImageElement, maxW = 0): Foot | null {
  try {
    // Full resolution by default so the numbers match the script exactly.
    const nw = img.naturalWidth;
    const W = maxW > 0 ? Math.min(maxW, nw) : nw;
    const H = W === nw ? img.naturalHeight : Math.round((W * img.naturalHeight) / nw);
    if (!W || !H) return null;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const m = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) m[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
    return measureMask(m, W, H);
  } catch {
    return null;
  }
}

/** Shared feet-detection constants (mirror scripts/foot-baseline.py). */
export const FEET = {
  band: 0.1, // feet band above the toe (front soles, extents)
  backBand: 0.2, // how far above the toe a hidden back shoe may be
  contact: 0.012, // sole contact tolerance (share of height)
  bridge: 0.02, // column gaps up to this share of width join one shoe
  gap: 0.004, // min transparent gap under a hidden back shoe (share of height)
  minBackW: 0.04, // min width of a hidden back shoe (share of width)
} as const;

/** Column runs where values[x] >= 0, joining gaps up to `bridge` columns. */
function colRuns(values: Int32Array, lo: number, hi: number, bridge: number): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1, end = -1, gap = 0;
  for (let x = lo; x <= hi + 1; x++) {
    if (x <= hi && values[x] >= 0) {
      if (start < 0) start = x;
      end = x;
      gap = 0;
    } else if (start >= 0) {
      gap += 1;
      if (gap > bridge || x > hi) {
        runs.push([start, end]);
        start = -1;
        gap = 0;
      }
    }
  }
  return runs;
}

function soleOf(values: Int32Array, x0: number, x1: number, tol: number, W: number, H: number): number[] {
  let b = -1;
  for (let x = x0; x <= x1; x++) b = Math.max(b, values[x]);
  let n0 = x1, n1 = x0;
  for (let x = x0; x <= x1; x++) if (values[x] >= b - tol) { n0 = Math.min(n0, x); n1 = Math.max(n1, x); }
  return [n0 / W, (n1 + 1) / W, (b + 1) / H];
}

/**
 * Feet from an opaque mask (1 = alpha >= 128), row-major W x H. Same integer
 * rules as scripts/foot-baseline.py measure_mask(): keep the two in sync.
 */
export function measureMask(m: Uint8Array, W: number, H: number): Foot | null {
  const at = (x: number, y: number) => m[y * W + x] === 1;
  const rowCount = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) n += m[y * W + x];
    rowCount[y] = n;
  }
  let toe = -1;
  for (let y = H - 1; y >= 0; y--) if (rowCount[y] >= 2) { toe = y; break; } // ignore 1px specks
  if (toe < 0) return null;
  let top = 0;
  for (let y = 0; y <= toe; y++) if (rowCount[y] >= 2) { top = y; break; }
  const band = Math.max(0, toe - Math.round(FEET.band * H));
  let left = W, right = -1;
  for (let y = band; y <= toe; y++)
    for (let x = 0; x < W; x++) if (at(x, y)) { if (x < left) left = x; if (x > right) right = x; }
  const tol = Math.round(FEET.contact * H);
  const bridge = Math.max(2, Math.round(FEET.bridge * W));

  // Front contacts: the lowest opaque pixel per column in the feet band.
  const colBot = new Int32Array(W).fill(-1);
  for (let x = left; x <= right; x++)
    for (let y = toe; y >= band; y--) if (at(x, y)) { colBot[x] = y; break; }
  const soles = colRuns(colBot, left, right, bridge)
    .sort((p, q) => q[1] - q[0] - (p[1] - p[0]))
    .slice(0, 2)
    .sort((p, q) => p[0] - q[0] || p[1] - q[1])
    .map(([x0, x1]) => soleOf(colBot, x0, x1, tol, W, H));

  // Back shoe beside the front one but touching it in the mask (overlapping
  // in the picture, or joined by a cut-out halo): inside the one run, a
  // stretch of columns higher than the front sole with a flat bottom of its
  // own, and a dip between the two (the mask rises between two shoes; a toe
  // curving up rises steadily instead).
  if (soles.length === 1) {
    const [r0, r1] = colRuns(colBot, left, right, bridge).sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
    const b = Math.round(soles[0][2] * H) - 1;
    const n0 = Math.round(soles[0][0] * W), n1 = Math.round(soles[0][1] * W) - 1;
    const minW = Math.round(FEET.minBackW * W);
    const high = new Int32Array(W).fill(-1);
    for (let x = r0; x <= r1; x++) if ((x < n0 || x > n1) && colBot[x] >= 0 && colBot[x] < b - tol) high[x] = colBot[x];
    let best: number[] | null = null;
    for (const [a0, a1] of colRuns(high, r0, r1, 1)) {
      // The dip: highest point of the mask bottom in this stretch, the one
      // nearest the front sole; the back shoe is what lies beyond it.
      const right = a0 > n1;
      let d = right ? a0 : a1;
      for (let x = a0; x <= a1; x++) if (colBot[x] < colBot[d] || (colBot[x] === colBot[d] && (right ? x < d : x > d))) d = x;
      const [p0, p1] = right ? [d + 1, a1] : [a0, d - 1];
      if (p1 - p0 + 1 < minW) continue;
      const s = soleOf(high, p0, p1, tol, W, H);
      const w = Math.round(s[1] * W) - Math.round(s[0] * W);
      if (colBot[d] >= Math.round(s[2] * H) - 1 - tol || w < minW) continue;
      if (!best || w > Math.round(best[1] * W) - Math.round(best[0] * W)) best = s;
    }
    if (best) {
      soles.push(best);
      soles.sort((p, q) => p[0] - q[0]);
    }
  }

  // Hidden back shoe (side views): above the lowest run of a column, after a
  // transparent gap, the next opaque pixel is the bottom of the shoe behind.
  if (soles.length === 1) {
    const lim = Math.max(0, toe - Math.round(FEET.backBand * H));
    const gapMin = Math.max(2, Math.round(FEET.gap * H));
    const upper = new Int32Array(W).fill(-1);
    for (let x = 0; x < W; x++) {
      let y = toe;
      while (y >= lim && !at(x, y)) y--;
      if (y < lim) continue;
      while (y >= lim && at(x, y)) y--;
      let gp = 0;
      while (y >= lim && !at(x, y)) { gp++; y--; }
      if (y >= lim && gp >= gapMin) upper[x] = y;
    }
    const minW = Math.round(FEET.minBackW * W);
    const uruns = colRuns(upper, 0, W - 1, bridge).filter(([a, b]) => b - a + 1 >= minW);
    if (uruns.length) {
      let best = uruns[0];
      for (const r of uruns) if (r[1] - r[0] > best[1] - best[0]) best = r;
      const s = soleOf(upper, best[0], best[1], tol, W, H);
      // v4: a contact only a few columns wide is a sock or trouser edge, not a shoe.
      if (Math.round(s[1] * W) - Math.round(s[0] * W) >= Math.round(minW / 2)) {
        soles.push(s);
        soles.sort((p, q) => p[0] - q[0]);
      }
    }
  }

  // Body centre (all opaque pixels) + upper-body lean: row centroids from the
  // head to ~45% of the body height (torso; arms and legs move while turning).
  const h = toe - top;
  const y0 = top + Math.round(0.08 * h);
  const y1 = top + Math.round(0.45 * h);
  let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0, bodySum = 0, bodyCnt = 0;
  for (let y = 0; y < H; y++) {
    if (!rowCount[y]) continue;
    let rs = 0;
    for (let x = 0; x < W; x++) if (m[y * W + x]) rs += x;
    bodySum += rs;
    bodyCnt += rowCount[y];
    if (y >= y0 && y <= y1) {
      const cxr = rs / rowCount[y];
      sx += y; sy += cxr; sxx += y * y; sxy += y * cxr; n++;
    }
  }
  const slope = n > 2 ? (n * sxy - sx * sy) / (n * sxx - sx * sx || 1) : 0; // dx per dy (px)
  const lean = (-Math.atan(slope) * 180) / Math.PI; // head right of hips = +
  return {
    toe: (toe + 1) / H,
    back: Math.min(...soles.map((s) => s[2])),
    left: left / W,
    right: (right + 1) / W,
    soles,
    top: top / H,
    cx: bodyCnt ? bodySum / bodyCnt / W : 0.5,
    lean: Number.isFinite(lean) ? lean : 0,
    v: 4,
  };
}

/** Feet measured with the current algorithm (or placed by hand) — otherwise re-measure. */
export const footIsCurrent = (f: Foot | null | undefined): f is Foot => !!f && (f.v === FOOT_VERSION || f.manual === true);
/** Version of the feet rules (v4: a back shoe touching the front one in the mask counts as its own sole). */
export const FOOT_VERSION = 4;
/** Sole entry: [x0, x1, bottom, lifted?] — lifted = 1 (set by hand in the studio). */
export const soleLifted = (s: number[]) => s[3] === 1;

export function loadImage(src: string, crossOrigin = true): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`load failed: ${src}`));
    img.src = src;
  });
}

const median = (a: number[]) => {
  const s = [...a].sort((p, q) => p - q);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

/**
 * Suggested transform so a frame lines up with its neighbours (as they look
 * after their own transforms): same body height, same centre x, same lean.
 */
export function autoAlign(self: Foot, neighbours: Foot[]): FrameTransform {
  const ns = neighbours.filter((f) => f.top != null && f.cx != null);
  if (!ns.length || self.top == null || self.cx == null) return { ...IDENTITY };
  const hSelf = self.toe - self.top;
  const hRef = median(ns.map((f) => f.toe - (f.top as number)));
  const s = hSelf > 0 && hRef > 0 ? Math.min(1.3, Math.max(0.7, hRef / hSelf)) : 1;
  const p = pivotOf(self);
  const cxAfterScale = p.x + ((self.cx as number) - p.x) * s;
  const dx = median(ns.map((f) => f.cx as number)) - cxAfterScale;
  const rot = median(ns.map((f) => f.lean ?? 0)) - (self.lean ?? 0);
  const r = (v: number, k: number) => Math.round(v * k) / k;
  return { rot: r(Math.max(-15, Math.min(15, rot)), 10), dx: r(dx, 1000), dy: 0, s: r(s, 1000) };
}

/**
 * Fit a (cut-out) photo onto the set's canvas so it matches the other frames:
 * same canvas size, body height and centre, feet on the common ground line.
 * `ref` = median metrics of the other frames. Returns the new image blob.
 */
export async function normalizeToSet(
  blob: Blob,
  canvasW: number,
  canvasH: number,
  ref: { toe: number; top: number; cx: number } | null,
): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url, false);
    const m = measureFrame(img, Math.min(600, img.naturalWidth));
    const c = document.createElement("canvas");
    c.width = canvasW;
    c.height = canvasH;
    const g = c.getContext("2d");
    if (!g) return blob;
    if (!m || m.top == null || m.cx == null || !ref) {
      // No transparency to measure: contain the whole photo.
      const k = Math.min(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
      const w = img.naturalWidth * k;
      const h = img.naturalHeight * k;
      g.drawImage(img, (canvasW - w) / 2, canvasH - h, w, h);
    } else {
      const bodyPx = (m.toe - m.top) * img.naturalHeight;
      const k = ((ref.toe - ref.top) * canvasH) / bodyPx;
      const w = img.naturalWidth * k;
      const h = img.naturalHeight * k;
      const x = ref.cx * canvasW - m.cx * w;
      const y = ref.toe * canvasH - m.toe * h;
      g.drawImage(img, x, y, w, h);
    }
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", 0.92));
    if (out && out.type === "image/webp") return out;
    return (await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"))) || blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Median head/feet/centre of a set of frames (for normalizeToSet). */
export function setReference(feet: (Foot | null | undefined)[]): { toe: number; top: number; cx: number } | null {
  const ok = feet.filter((f): f is Foot => !!f && f.top != null && f.cx != null);
  if (!ok.length) return null;
  return { toe: median(ok.map((f) => f.toe)), top: median(ok.map((f) => f.top as number)), cx: median(ok.map((f) => f.cx as number)) };
}
