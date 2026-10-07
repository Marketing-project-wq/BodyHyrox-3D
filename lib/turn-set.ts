import { TURN_SET } from "@/lib/config";
import { solidifyCanvas } from "@/lib/sole-solid";
import { loadImage, measureFrame, type Foot } from "@/lib/media360";

/**
 * "Buat set putaran": choose the best pose for every angle of the turn from
 * the athlete's materials (photos and/or one video), in the browser.
 *
 * - Photos sit at the angle the admin gave them, or spread evenly in upload
 *   order (first = Front) between the ones that have an angle.
 * - With a video the turn gets TURN_SET.videoSlots evenly spaced angles; a
 *   photo competes for the angle nearest to it, the video's frames for the
 *   rest. Without a video every (usable) photo is a pose at its own angle.
 * - A pose scores on sharpness, resolution and angle error; stepping (one
 *   sole well above the other) and a colour far from the rest of the set
 *   ("different camera / light") are flagged and lose against a clean one.
 * - Every chosen pose is locked onto one canvas: same sole line, body height
 *   and centre, like scripts/video360.
 */

export type Flag = "stepping" | "mismatch" | "noFeet";

export type Candidate = {
  id: string;
  source: "photo" | "video";
  sourceId: string;
  /** File name (photo) or video name + time. */
  label: string;
  angle: number;
  cutout: Blob;
  /** The pose locked onto the turn canvas (what goes live). */
  fitted: Blob;
  /** Object URL of `fitted`, for the admin grid (revoke when done). */
  preview: string;
  foot: Foot | null;
  sharp: number;
  bodyPx: number;
  color: [number, number, number];
  standing: boolean;
};

export type SlotChoice = { c: Candidate; score: number; flags: Flag[] };
export type Slot = { angle: number; options: SlotChoice[]; pick: number };

const norm = (a: number) => ((a % 360) + 360) % 360;
/** Shortest angular distance (0..180). */
export const angDist = (a: number, b: number) => {
  const d = Math.abs(norm(a) - norm(b));
  return Math.min(d, 360 - d);
};

/**
 * Angles of the photos in upload order: an admin-given angle wins; the others
 * spread evenly between their neighbours with an angle (all of them evenly
 * from Front when none has one; `reverse` turns that order the other way).
 */
export function photoAngles(hints: (number | null)[], reverse: boolean): number[] {
  const n = hints.length;
  if (!n) return [];
  const anchors = hints.map((h, i) => (h == null ? -1 : i)).filter((i) => i >= 0);
  if (!anchors.length) return hints.map((_, k) => norm((reverse ? -1 : 1) * ((360 * k) / n)));
  const out = hints.map((h) => (h == null ? NaN : norm(h)));
  for (let a = 0; a < anchors.length; a++) {
    const i = anchors[a];
    const j = anchors[(a + 1) % anchors.length];
    const gapIdx = (j - i + n) % n || n; // photos from i to the next anchor j
    let span = norm(out[j] - out[i]);
    if (span === 0) span = 360;
    for (let s = 1; s < gapIdx; s++) out[(i + s) % n] = norm(out[i] + (span * s) / gapIdx);
  }
  return out;
}

/** Sharpness, resolution, mean colour and feet of a cut-out. */
export async function measureCutout(cutout: Blob): Promise<{ foot: Foot | null; sharp: number; bodyPx: number; color: [number, number, number] }> {
  const url = URL.createObjectURL(cutout);
  try {
    const img = await loadImage(url, false);
    const foot = measureFrame(img);
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const top = foot?.top ?? 0;
    const toe = foot?.toe ?? 1;
    const bodyPx = Math.max(1, (toe - top) * H);
    // The body redrawn at a fixed height, so sharpness compares across sources.
    const k = TURN_SET.sharpBodyPx / bodyPx;
    const cw = Math.max(8, Math.round(W * k));
    const ch = Math.max(8, Math.round(H * k));
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) throw new Error("canvas");
    g.drawImage(img, 0, 0, cw, ch);
    const px = g.getImageData(0, 0, cw, ch).data;
    const lum = new Float32Array(cw * ch);
    let r = 0;
    let gg = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < cw * ch; i++) {
      lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      if (px[i * 4 + 3] > 200) {
        r += px[i * 4];
        gg += px[i * 4 + 1];
        b += px[i * 4 + 2];
        n++;
      }
    }
    // Light 3x3 blur first, so compression noise (video) doesn't count as detail.
    const sm = new Float32Array(cw * ch);
    for (let y = 1; y < ch - 1; y++)
      for (let x = 1; x < cw - 1; x++) {
        const i = y * cw + x;
        sm[i] = (4 * lum[i] + 2 * (lum[i - 1] + lum[i + 1] + lum[i - cw] + lum[i + cw]) + lum[i - cw - 1] + lum[i - cw + 1] + lum[i + cw - 1] + lum[i + cw + 1]) / 16;
      }
    // Mean |Laplacian| inside the body (away from the cut-out edge).
    let lap = 0;
    let m = 0;
    for (let y = 1; y < ch - 1; y++) {
      for (let x = 1; x < cw - 1; x++) {
        const i = y * cw + x;
        if (px[i * 4 + 3] < 250 || px[(i - 1) * 4 + 3] < 250 || px[(i + 1) * 4 + 3] < 250 || px[(i - cw) * 4 + 3] < 250 || px[(i + cw) * 4 + 3] < 250) continue;
        lap += Math.abs(4 * sm[i] - sm[i - 1] - sm[i + 1] - sm[i - cw] - sm[i + cw]);
        m++;
      }
    }
    return { foot, sharp: m ? lap / m : 0, bodyPx, color: n ? [r / n, gg / n, b / n] : [0, 0, 0] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function isStanding(foot: Foot | null, source: Candidate["source"]): boolean {
  if (!foot || foot.top == null) return false;
  const h = foot.toe - foot.top;
  return h > 0 && (foot.toe - foot.back) / h <= TURN_SET.standMaxSpread[source];
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * The angles of the turn and, per angle, every candidate that may fill it
 * (best first). `slotAngles` null = photos only: each distinct photo angle is
 * a slot (at most TURN_SET.maxPoses, keeping the evenest spread).
 */
export function buildSlots(cands: Candidate[], hasVideo: boolean): Slot[] {
  if (!cands.length) return [];
  let angles: number[];
  if (hasVideo) {
    angles = Array.from({ length: TURN_SET.videoSlots }, (_, k) => (360 * k) / TURN_SET.videoSlots);
  } else {
    angles = Array.from(new Set(cands.map((c) => Math.round(c.angle * 10) / 10))).sort((a, b) => a - b);
    // Two photos within 2 degrees compete for one slot.
    angles = angles.filter((a, i) => i === 0 || a - angles[i - 1] >= 2);
    while (angles.length > TURN_SET.maxPoses) {
      // Drop the angle with the smallest gap to its neighbour (evenest spread).
      let best = 0;
      let bestGap = Infinity;
      for (let i = 0; i < angles.length; i++) {
        const gap = norm(angles[(i + 1) % angles.length] - angles[i]) || 360;
        if (gap < bestGap) {
          bestGap = gap;
          best = (i + 1) % angles.length;
        }
      }
      angles.splice(best, 1);
    }
  }
  const step = 360 / angles.length;
  const maxSharp = Math.max(1e-6, ...cands.map((c) => c.sharp));
  const clean = cands.filter((c) => c.standing);
  const ref = (clean.length ? clean : cands).map((c) => c.color);
  const mid: [number, number, number] = [median(ref.map((c) => c[0])), median(ref.map((c) => c[1])), median(ref.map((c) => c[2]))];
  const w = TURN_SET.weights;
  const scored = (c: Candidate, slot: number): SlotChoice => {
    const flags: Flag[] = [];
    if (!c.foot) flags.push("noFeet");
    else if (!c.standing) flags.push("stepping");
    const dist = Math.hypot(c.color[0] - mid[0], c.color[1] - mid[1], c.color[2] - mid[2]);
    if (dist > TURN_SET.colorMax) flags.push("mismatch");
    const score =
      w.sharp * (c.sharp / maxSharp) +
      w.res * Math.min(1, c.bodyPx / TURN_SET.fullResBodyPx) -
      w.angle * (angDist(c.angle, slot) / (step / 2)) -
      w.mismatch * (flags.includes("mismatch") ? 1 : 0) -
      (flags.includes("stepping") || flags.includes("noFeet") ? 5 : 0);
    return { c, score, flags };
  };
  const slots: Slot[] = angles.map((a) => ({
    angle: a,
    options: cands
      .filter((c) => angDist(c.angle, a) <= step / 2 + 1e-6)
      .map((c) => scored(c, a))
      .sort((x, y) => y.score - x.score),
    pick: 0,
  }));
  // One picture fills one slot at most: best (slot, candidate) pairs first.
  const pairs = slots.flatMap((s, si) => s.options.map((o, oi) => ({ si, oi, score: o.score, id: o.c.id })));
  pairs.sort((a, b) => b.score - a.score);
  const usedSlot = new Set<number>();
  const usedCand = new Set<string>();
  for (const p of pairs) {
    if (usedSlot.has(p.si) || usedCand.has(p.id)) continue;
    slots[p.si].pick = p.oi;
    usedSlot.add(p.si);
    usedCand.add(p.id);
  }
  return slots.filter((s, i) => s.options.length > 0 && usedSlot.has(i));
}

/**
 * Lock one cut-out onto the turn canvas by its own feet: sole line, body
 * height and centre land on TURN_SET.fit (WebP, PNG fallback).
 */
export async function fitPose(cutout: Blob, foot: Foot | null): Promise<Blob> {
  const { canvas, fit } = TURN_SET;
  const url = URL.createObjectURL(cutout);
  try {
    const img = await loadImage(url, false);
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    let k: number;
    let x: number;
    let y: number;
    if (foot && foot.top != null && foot.cx != null && foot.toe > foot.top) {
      k = ((fit.toe - fit.top) * canvas.h) / ((foot.toe - foot.top) * sh);
      x = fit.cx * canvas.w - foot.cx * sw * k;
      y = fit.toe * canvas.h - foot.toe * sh * k;
    } else {
      k = Math.min(canvas.w / sw, canvas.h / sh);
      x = (canvas.w - sw * k) / 2;
      y = canvas.h - sh * k;
    }
    const c = document.createElement("canvas");
    c.width = canvas.w;
    c.height = canvas.h;
    const g = c.getContext("2d");
    if (!g) throw new Error("canvas");
    g.imageSmoothingQuality = "high";
    g.drawImage(img, x, y, sw * k, sh * k);
    solidifyCanvas(g, c.width, c.height); // "sol padat": new frames ship with solid soles
    const webp = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", 0.92));
    const blob = webp && webp.type === "image/webp" ? webp : await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
    if (!blob) throw new Error("canvas");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Front / Right / Back / Left = the poses nearest to 0, 90, 180 and 270 degrees. */
export function sidesByAngle(files: string[], angles: number[]): { front: string; right: string; back: string; left: string } {
  const near = (t: number) => {
    let best = 0;
    for (let i = 1; i < angles.length; i++) if (angDist(angles[i], t) < angDist(angles[best], t)) best = i;
    return files[best];
  };
  return { front: near(0), right: near(90), back: near(180), left: near(270) };
}
