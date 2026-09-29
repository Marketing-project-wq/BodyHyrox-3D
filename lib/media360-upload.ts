"use client";

import { issueDraftUploads } from "@/app/atlet/[id]/media-actions";
import { loadImage, measureFrame, type Foot } from "@/lib/media360";

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
    return measureFrame(await loadImage(url, false), 480);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const extOf = (b: Blob) => (b.type === "image/webp" ? "webp" : b.type === "image/png" ? "png" : "jpg");

/** PUT blobs into the athlete's private draft folder; returns their new file names. */
export async function uploadDraftBlobs(
  athleteId: string,
  blobs: Blob[],
  onProgress?: (done: number) => void,
): Promise<string[]> {
  const slots = await issueDraftUploads(athleteId, blobs.map((b, i) => `f${i}.${extOf(b)}`));
  for (let i = 0; i < blobs.length; i++) {
    const res = await fetch(slots[i].uploadUrl, {
      method: "PUT",
      headers: { "content-type": blobs[i].type || "application/octet-stream", "x-upsert": "true" },
      body: blobs[i],
    });
    if (!res.ok) throw new Error(`Upload gagal (HTTP ${res.status}) pada frame ${i + 1}.`);
    onProgress?.(i + 1);
  }
  return slots.map((s) => s.file);
}
