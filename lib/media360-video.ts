"use client";

import { VIDEO_360 } from "@/lib/config";
import { loadImage, setReference, type Foot } from "@/lib/media360";
import { solidifyCanvas } from "@/lib/sole-solid";

/**
 * 360 set from one video, entirely in the browser: the file is decoded by a
 * hidden <video>, sampled evenly along the turn and drawn frame by frame.
 * Nothing but the finished frames is uploaded.
 */

export type OpenVideo = { video: HTMLVideoElement; duration: number; close: () => void };

/** Load a video file (muted + playsinline so iOS decodes it without a tap). */
export async function openVideo(file: Blob): Promise<OpenVideo> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  v.preload = "auto";
  const close = () => {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  };
  try {
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("video_unreadable"));
      v.src = url;
    });
    if (!v.videoWidth || !v.videoHeight || !Number.isFinite(v.duration)) throw new Error("video_unreadable");
    // iOS Safari only paints a seeked frame after the video has played once.
    try {
      await v.play();
      v.pause();
    } catch {
      /* autoplay refused: seeking still works on the other browsers */
    }
    return { video: v, duration: v.duration, close };
  } catch (e) {
    close();
    throw e;
  }
}

/** Seek and wait until the frame at `t` can be drawn. */
export function seek(v: HTMLVideoElement, t: number): Promise<void> {
  const target = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.001));
  return new Promise((res) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeEventListener("seeked", onSeeked);
      res();
    };
    // The frame at the new time is ready to draw when "seeked" fires (a
    // hidden, detached <video> never runs requestVideoFrameCallback).
    const onSeeked = () => finish();
    if (Math.abs(v.currentTime - target) < 1e-4 && v.readyState >= 2) return finish();
    v.addEventListener("seeked", onSeeked);
    v.currentTime = target;
    setTimeout(finish, 3000); // never hang on a stubborn decoder
  });
}

/**
 * How the athlete turns through the video, measured on small thumbnails:
 * - `diffs`: change from the previous thumbnail; below `hold` counts as
 *   standing still (and duplicated frames);
 * - `cum`: the accumulated change without the still moments, so a turn that
 *   speeds up, slows down or pauses still maps evenly onto angles;
 * - `pair`: the two side profiles (silhouette narrowest across the
 *   shoulders), anchored at 90° and 270°; null without two clear profiles.
 * With `thumbs` > 0 it also keeps that many small JPEG thumbnails, evenly
 * spread over the video (the timeline strip).
 */
export type TurnAnalysis = {
  duration: number;
  times: number[];
  diffs: number[];
  hold: number;
  cum: number[];
  total: number;
  pair: [number, number] | null;
  thumbs: { t: number; url: string }[];
};

export async function analyzeTurn(
  v: HTMLVideoElement,
  onProgress?: (fraction: number) => void,
  opts: { thumbs?: number } = {},
): Promise<TurnAnalysis> {
  const { analysisFps, maxSamples, thumbW, holdRelative, background, shoulderBand, profileDepth } = VIDEO_360;
  const dur = v.duration;
  const step = Math.max(1 / analysisFps, dur / maxSamples);
  const W = thumbW;
  const H = Math.max(1, Math.round((thumbW * v.videoHeight) / v.videoWidth));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("canvas");
  const times: number[] = [];
  const diffs: number[] = [];
  const widths: number[] = [];
  const thumbs: { t: number; url: string }[] = [];
  const nThumbs = opts.thumbs ?? 0;
  let prev: Float32Array | null = null;
  for (let t = 0; t < dur; t += step) {
    await seek(v, t);
    g.drawImage(v, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data;
    const grey = new Float32Array(W * H);
    for (let i = 0; i < grey.length; i++) grey[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    let d = 0;
    if (prev) {
      for (let i = 0; i < grey.length; i++) d += Math.abs(grey[i] - prev[i]);
      d /= grey.length;
    }
    prev = grey;
    times.push(t);
    diffs.push(d);
    widths.push(shoulderWidth(px, W, H, background, shoulderBand));
    if (nThumbs > 0 && thumbs.length < nThumbs && t >= (dur * thumbs.length) / nThumbs) thumbs.push({ t, url: c.toDataURL("image/jpeg", 0.7) });
    onProgress?.(Math.min(1, t / dur));
  }
  const n = times.length;

  // Accumulated change, pauses removed.
  const moving = diffs.filter((d) => d > 0).sort((a, b) => a - b);
  const hold = moving.length ? moving[Math.floor(moving.length / 2)] * holdRelative : 0;
  const cum: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0 && diffs[i] >= hold) total += diffs[i];
    cum.push(total);
  }

  // Side profiles: the two narrowest views, at least a quarter turn apart.
  const sm = widths.map((_, i) => {
    const a = widths.slice(Math.max(0, i - 3), i + 4).filter((w) => w > 0);
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  });
  const widest = Math.max(...sm);
  const minima: number[] = [];
  for (let i = 1; i < n - 1; i++) if (sm[i] > 0 && sm[i] <= sm[i - 1] && sm[i] <= sm[i + 1] && sm[i] < profileDepth * widest) minima.push(i);
  let pair: [number, number] | null = null;
  let best = Infinity;
  for (const a of minima)
    for (const b of minima)
      if (b > a && cum[b] - cum[a] > 0.25 * total && cum[a] > 0 && cum[b] < total && sm[a] + sm[b] < best) {
        best = sm[a] + sm[b];
        pair = [a, b];
      }
  return { duration: dur, times, diffs, hold, cum, total, pair, thumbs };
}

/** Estimated angle (0..360) of the athlete at sample i. */
export function angleAtSample(a: TurnAnalysis, i: number): number {
  const { cum, total, pair } = a;
  if (!pair) return (360 * cum[i]) / total;
  const [p1, p2] = pair;
  if (i <= p1) return (90 * cum[i]) / cum[p1];
  if (i <= p2) return 90 + (180 * (cum[i] - cum[p1])) / (cum[p2] - cum[p1]);
  return 270 + (90 * (cum[i] - cum[p2])) / (total - cum[p2]);
}

/** Times of `count` frames evenly spaced along the turn (frame 1 = the start, facing the camera). */
export function timesFromAnalysis(a: TurnAnalysis, count: number): number[] {
  const n = a.times.length;
  if (a.total <= 0) return Array.from({ length: count }, (_, j) => (a.duration * j) / count);
  const out: number[] = [];
  let i = 0;
  for (let j = 0; j < count; j++) {
    const target = (360 * j) / count;
    while (i < n - 1 && angleAtSample(a, i) < target) i++;
    out.push(a.times[i]);
  }
  return out;
}

/** Times of `count` frames evenly spaced along the turn (see analyzeTurn / timesFromAnalysis). */
export async function pickTimes(v: HTMLVideoElement, count: number, onProgress?: (fraction: number) => void): Promise<number[]> {
  return timesFromAnalysis(await analyzeTurn(v, onProgress), count);
}

/**
 * Where the athlete (nearly) stands still for at least `minSec`, as time
 * ranges; e.g. the pause before the turn or a stop facing the back. Uses its
 * own measure, apart from `hold`: the change smoothed by a rolling median
 * (`stillWindow` samples, which also hides duplicated video frames) below
 * `stillRelative` x the 75th percentile of all changes, so slow shifting
 * on the spot also counts as still.
 */
export function stillBands(a: TurnAnalysis, minSec: number): { from: number; to: number }[] {
  const { stillWindow, stillRelative } = VIDEO_360;
  const n = a.times.length;
  if (n < 3) return [];
  const sorted = a.diffs.slice(1).sort((x, y) => x - y);
  const limit = sorted[Math.floor(0.75 * (sorted.length - 1))] * stillRelative;
  const half = Math.floor(stillWindow / 2);
  const still = a.diffs.map((_, i) => {
    const w = a.diffs.slice(Math.max(1, i - half), Math.min(n, i + half + 1)).sort((x, y) => x - y);
    return w.length > 0 && w[Math.floor(w.length / 2)] < limit;
  });
  const out: { from: number; to: number }[] = [];
  let i = 1;
  while (i < n) {
    if (!still[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && still[j + 1]) j++;
    const from = a.times[i - 1];
    const to = j + 1 < n ? a.times[j] : a.duration;
    if (to - from >= minSec) out.push({ from, to });
    i = j + 1;
  }
  return out;
}

/** The admin's marks on the timeline (seconds): one full turn and its 4 sides. */
export type TurnMarks = { start: number; front: number; right: number; back: number; left: number; end: number };
export const MARK_ORDER: (keyof TurnMarks)[] = ["start", "front", "right", "back", "left", "end"];

/**
 * First guess for the marks: the turn starts at the last still moment before
 * the athlete moves and ends where the change stops adding up; the sides are
 * where the estimated angle reaches 0°, 90°, 180° and 270°.
 */
export function suggestMarks(a: TurnAnalysis): TurnMarks {
  const n = a.times.length;
  const last = a.times[n - 1] ?? 0;
  if (a.total <= 0 || n < 2) {
    const q = a.duration / 4;
    return { start: 0, front: 0, right: q, back: 2 * q, left: 3 * q, end: a.duration };
  }
  let i0 = 0;
  while (i0 < n - 1 && a.cum[i0] <= 0) i0++;
  let i1 = n - 1;
  while (i1 > 0 && a.cum[i1 - 1] >= a.total) i1--;
  const reach = (deg: number) => {
    for (let i = 0; i < n; i++) if (angleAtSample(a, i) >= deg) return a.times[i];
    return last;
  };
  const start = a.times[Math.max(0, i0 - 1)];
  return { start, front: start, right: reach(90), back: reach(180), left: reach(270), end: a.times[i1] };
}

/**
 * The marks as the JSON file the Mac script (scripts/video360) reads: times in
 * seconds (3 decimals), plus the standing-still bands to leave out.
 */
export function marksFile(
  m: TurnMarks,
  stills: { from: number; to: number }[],
  info: { video: string; duration: number },
): string {
  const r = (s: number) => Math.round(s * 1000) / 1000;
  return JSON.stringify(
    {
      video: info.video,
      duration: r(info.duration),
      start: r(m.start),
      front: r(m.front),
      right: r(m.right),
      back: r(m.back),
      left: r(m.left),
      end: r(m.end),
      stills: stills.map((b) => ({ from: r(b.from), to: r(b.to) })),
    },
    null,
    2,
  );
}

/** Marks must follow the turn: start ≤ front < right < back < left < end. */
export function marksInOrder(m: TurnMarks): boolean {
  return m.start <= m.front && m.front < m.right && m.right < m.back && m.back < m.left && m.left < m.end;
}

/**
 * Silhouette width across the shoulders, as a share of the body height (0 =
 * nothing found). The background colour is taken from the four corners.
 */
function shoulderWidth(px: Uint8ClampedArray, W: number, H: number, limit: number, band: readonly [number, number]): number {
  const corner = [0, W - 1, (H - 1) * W, H * W - 1];
  const bg = [0, 1, 2].map((k) => {
    const v = corner.map((p) => px[p * 4 + k]).sort((a, b) => a - b);
    return (v[1] + v[2]) / 2;
  });
  const fg = (x: number, y: number) => {
    const o = (y * W + x) * 4;
    return Math.abs(px[o] - bg[0]) + Math.abs(px[o + 1] - bg[1]) + Math.abs(px[o + 2] - bg[2]) > limit;
  };
  let top = -1;
  let bot = -1;
  for (let y = 0; y < H; y++) {
    let any = false;
    for (let x = 0; x < W; x++) if (fg(x, y)) {
      any = true;
      break;
    }
    if (any) {
      if (top < 0) top = y;
      bot = y;
    }
  }
  if (top < 0) return 0;
  const h = bot - top + 1;
  let sum = 0;
  let rows = 0;
  for (let y = Math.floor(top + band[0] * h); y <= Math.floor(top + band[1] * h); y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < W; x++) if (fg(x, y)) {
      if (l < 0) l = x;
      r = x;
    }
    if (l >= 0) {
      sum += r - l + 1;
      rows++;
    }
  }
  return rows ? sum / rows / h : 0;
}

/** The frame at time `t` as a JPEG (input for the background remover). */
export async function grabFrame(v: HTMLVideoElement, t: number): Promise<Blob> {
  await seek(v, t);
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas");
  g.drawImage(v, 0, 0);
  const b = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.95));
  if (!b) throw new Error("canvas");
  return b;
}

/**
 * Fit the cut-out frames onto the standard canvas with ONE transform for the
 * whole set (median body height / ground line / centre of the frames), so
 * the athlete keeps the natural motion of the video without per-frame jumps.
 * WebP (PNG fallback). Frames without a measurement are fitted the same way.
 */
export async function fitVideoFrames(cutouts: Blob[], feet: (Foot | null)[], onProgress?: (done: number) => void): Promise<Blob[]> {
  const { canvas, fit } = VIDEO_360;
  const ref = setReference(feet);
  const out: Blob[] = [];
  for (let i = 0; i < cutouts.length; i++) {
    const url = URL.createObjectURL(cutouts[i]);
    try {
      const img = await loadImage(url, false);
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      let k: number;
      let x: number;
      let y: number;
      if (ref && ref.toe > ref.top) {
        k = ((fit.toe - fit.top) * canvas.h) / ((ref.toe - ref.top) * sh);
        x = fit.cx * canvas.w - ref.cx * sw * k;
        y = fit.toe * canvas.h - ref.toe * sh * k;
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
      g.drawImage(img, x, y, sw * k, sh * k);
      solidifyCanvas(g, c.width, c.height); // "sol padat": new frames ship with solid soles
      const webp = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", 0.92));
      const blob = webp && webp.type === "image/webp" ? webp : await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
      if (!blob) throw new Error("canvas");
      out.push(blob);
    } finally {
      URL.revokeObjectURL(url);
    }
    onProgress?.(i + 1);
  }
  return out;
}

/** Front / Right / Back / Left = the frames at 0°, 90°, 180° and 270° of the turn. */
export function sidesOf(files: string[]): { front: string; right: string; back: string; left: string } {
  const n = files.length;
  const at = (q: number) => files[Math.round((n * q) / 4) % n];
  return { front: at(0), right: at(1), back: at(2), left: at(3) };
}
