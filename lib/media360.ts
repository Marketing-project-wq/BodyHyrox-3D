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
export type Media360Draft = {
  frames: DraftFrame[];
  meta: FrameMetaMap;
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
    soles: foot.soles?.map(([x0, x1, b]) => [X(x0), X(x1), Y(b)]),
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
export function measureFrame(img: HTMLImageElement, maxW = 160): Foot | null {
  try {
    const W = Math.min(maxW, img.naturalWidth || maxW);
    const H = Math.round((W * img.naturalHeight) / img.naturalWidth) || Math.round(W * 2.35);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const op = (x: number, y: number) => d[(y * W + x) * 4 + 3] > 127;
    const rowCount = (y: number, x0 = 0, x1 = W) => {
      let n = 0;
      for (let x = x0; x < x1; x++) if (op(x, y)) n++;
      return n;
    };
    let toe = -1;
    for (let y = H - 1; y >= 0; y--) if (rowCount(y) >= 2) { toe = y; break; } // ignore 1px specks
    if (toe < 0) return null;
    let top = 0;
    for (let y = 0; y < toe; y++) if (rowCount(y) >= 2) { top = y; break; }
    const band = Math.max(0, Math.round(toe - 0.1 * H));
    let left = W, right = -1, sum = 0, cnt = 0;
    for (let y = band; y <= toe; y++)
      for (let x = 0; x < W; x++)
        if (op(x, y)) { left = Math.min(left, x); right = Math.max(right, x); sum += x; cnt++; }
    const fcx = cnt ? Math.round(sum / cnt) : W / 2;
    const low = (x0: number, x1: number) => {
      for (let y = toe; y >= band; y--) if (rowCount(y, x0, x1) >= 1) return y;
      return toe;
    };
    const back = Math.min(low(left, fcx), low(fcx, right + 1));
    const colBot: number[] = [];
    for (let x = left; x <= right; x++) {
      colBot[x] = -1;
      for (let y = toe; y >= band; y--) if (op(x, y)) { colBot[x] = y; break; }
    }
    const runs: [number, number][] = [];
    const bridge = Math.max(2, Math.round(0.02 * W));
    let start = -1, end = -1, gap = 0;
    for (let x = left; x <= right + 1; x++) {
      if (x <= right && colBot[x] >= 0) {
        if (start < 0) start = x;
        end = x;
        gap = 0;
      } else if (start >= 0 && (++gap > bridge || x > right)) {
        runs.push([start, end]);
        start = -1;
        gap = 0;
      }
    }
    const soles = runs
      .sort((p, q) => q[1] - q[0] - (p[1] - p[0]))
      .slice(0, 2)
      .sort((p, q) => p[0] - q[0])
      .map(([x0, x1]) => {
        let b = -1;
        for (let x = x0; x <= x1; x++) b = Math.max(b, colBot[x]);
        let n0 = x1, n1 = x0;
        for (let x = x0; x <= x1; x++) if (colBot[x] >= b - 0.012 * H) { n0 = Math.min(n0, x); n1 = Math.max(n1, x); }
        return [n0 / W, (n1 + 1) / W, (b + 1) / H];
      });

    // Body centre + upper-body lean: row centroids from the head to ~45% of
    // the body height (torso; arms and legs move too much while turning).
    const h = toe - top;
    const y0 = top + Math.round(0.08 * h);
    const y1 = top + Math.round(0.45 * h);
    let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0, bodySum = 0, bodyCnt = 0;
    for (let y = top; y <= toe; y++) {
      let rs = 0, rc = 0;
      for (let x = 0; x < W; x++) if (op(x, y)) { rs += x; rc++; }
      if (!rc) continue;
      bodySum += rs;
      bodyCnt += rc;
      if (y >= y0 && y <= y1) {
        const cxr = rs / rc;
        sx += y; sy += cxr; sxx += y * y; sxy += y * cxr; n++;
      }
    }
    const slope = n > 2 ? (n * sxy - sx * sy) / (n * sxx - sx * sx || 1) : 0; // dx per dy (px)
    const lean = (-Math.atan(slope) * 180) / Math.PI; // head right of hips = +
    return {
      toe: (toe + 1) / H,
      back: (back + 1) / H,
      left: left / W,
      right: (right + 1) / W,
      soles,
      top: top / H,
      cx: bodyCnt ? bodySum / bodyCnt / W : 0.5,
      lean: Number.isFinite(lean) ? lean : 0,
    };
  } catch {
    return null;
  }
}

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
