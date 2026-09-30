"use client";

import { issueDraftUploads } from "@/app/atlet/[id]/media-actions";
import { ActionFailure, unwrap } from "@/lib/action-result";
import { loadImage, measureFrame, normalizeToSet, setReference, type Foot } from "@/lib/media360";

/** Downscale a blob so cutout inference is fast and uploads stay small. */
export async function shrink(blob: Blob, maxPx: number): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url, false);
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
    if (scale >= 1) return blob;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b || blob), "image/jpeg", 0.9));
  } catch {
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type RemoveBg = (input: Blob) => Promise<Blob>;
let removeBgPromise: Promise<RemoveBg> | null = null;

/**
 * The in-browser background remover (@imgly/background-removal from a CDN,
 * loaded once; never enters the app bundle). Throws if it can't load.
 */
export function loadBackgroundRemover(): Promise<RemoveBg> {
  if (!removeBgPromise) {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const cdnImport = new Function("u", "return import(u)") as (u: string) => Promise<{ removeBackground: RemoveBg }>;
    removeBgPromise = cdnImport("https://esm.sh/@imgly/background-removal@1").then((m) => m.removeBackground);
    removeBgPromise.catch(() => {
      removeBgPromise = null;
    });
  }
  return removeBgPromise;
}

/** Photo -> upload-ready blob (transparent PNG when cutout is on). */
export async function preparePhoto(file: Blob, cutout: boolean): Promise<Blob> {
  if (!cutout) return file;
  const removeBackground = await loadBackgroundRemover();
  const small = await shrink(file, 1100); // faster inference + smaller upload
  return await removeBackground(small);
}

export async function measureBlob(blob: Blob): Promise<Foot | null> {
  const url = URL.createObjectURL(blob);
  try {
    return measureFrame(await loadImage(url, false));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** True when the image has transparent pixels (a cut-out), checked on a small copy. */
function hasTransparency(img: HTMLImageElement): boolean {
  const k = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return false;
  g.drawImage(img, 0, 0, c.width, c.height);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) return true;
  return false;
}

/**
 * Pixel size, cut-out or not, and feet/head/centre of an image (blob or URL);
 * null if it can't load. Only cut-outs are measured: on an opaque photo the
 * "body" would be the whole picture.
 */
export async function inspectImage(
  src: Blob | string,
): Promise<{ w: number; h: number; cutout: boolean; foot: Foot | null } | null> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = await loadImage(url, typeof src === "string");
    const cutout = hasTransparency(img);
    return { w: img.naturalWidth, h: img.naturalHeight, cutout, foot: cutout ? measureFrame(img) : null };
  } catch {
    return null;
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}

/** The most common canvas size of a set (ties: the larger one). */
export function commonSize(sizes: ({ w: number; h: number } | null)[]): { w: number; h: number } | null {
  const count = new Map<string, number>();
  for (const s of sizes) if (s) count.set(`${s.w}x${s.h}`, (count.get(`${s.w}x${s.h}`) ?? 0) + 1);
  let best: { w: number; h: number } | null = null;
  let bestCount = 0;
  for (const [k, c] of Array.from(count.entries())) {
    const [w, h] = k.split("x").map(Number);
    if (!best || c > bestCount || (c === bestCount && w * h > best.w * best.h)) {
      best = { w, h };
      bestCount = c;
    }
  }
  return best;
}

/**
 * Fit every photo of a new set onto one canvas (the most common size) with
 * the same body height, centre and ground line (WebP, PNG fallback), then
 * measure the result. Photos without a cut-out are only contained whole.
 */
export async function normalizeBlobs(
  blobs: Blob[],
  onProgress?: (done: number) => void,
): Promise<{ blobs: Blob[]; feet: (Foot | null)[] }> {
  const info: Awaited<ReturnType<typeof inspectImage>>[] = [];
  for (const b of blobs) info.push(await inspectImage(b));
  const size = commonSize(info);
  if (!size) return { blobs, feet: info.map((i) => i?.foot ?? null) };
  const ref = setReference(info.map((i) => i?.foot));
  const out: Blob[] = [];
  const feet: (Foot | null)[] = [];
  for (let i = 0; i < blobs.length; i++) {
    const norm = await normalizeToSet(blobs[i], size.w, size.h, info[i]?.cutout ? ref : null);
    out.push(norm);
    feet.push(await measureBlob(norm));
    onProgress?.(i + 1);
  }
  return { blobs: out, feet };
}

const extOf = (b: Blob) => (b.type === "image/webp" ? "webp" : b.type === "image/png" ? "png" : "jpg");

/** PUT blobs into the athlete's private draft folder; returns their new file names. */
export async function uploadDraftBlobs(
  athleteId: string,
  blobs: Blob[],
  onProgress?: (done: number) => void,
): Promise<string[]> {
  const { slots } = unwrap(await issueDraftUploads(athleteId, blobs.map((b, i) => `f${i}.${extOf(b)}`)));
  for (let i = 0; i < blobs.length; i++) {
    const res = await fetch(slots[i].uploadUrl, {
      method: "PUT",
      headers: { "content-type": blobs[i].type || "application/octet-stream", "x-upsert": "true" },
      body: blobs[i],
    });
    if (!res.ok) throw new ActionFailure("upload_failed");
    onProgress?.(i + 1);
  }
  return slots.map((s) => s.file);
}
