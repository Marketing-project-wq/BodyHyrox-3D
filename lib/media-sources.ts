import { MEDIA_SOURCES } from "@/lib/config";

/** "Bahan 360": shared types + browser helpers (no server imports). */

export type SourceKind = "photo" | "video";

/** One uploaded material as the admin list shows it. */
export type SourceItem = {
  id: string;
  kind: SourceKind;
  originalName: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  /** Angle the admin set for a photo (0 = Front, 90 = Right), null = automatic. */
  angleHint: number | null;
  uploadedByName: string | null;
  createdAt: string;
  /** Signed URL of the small preview, null when there is none (e.g. HEIC the browser can't read). */
  thumbUrl: string | null;
};

export type SourceUploadSlot = { file: string; uploadUrl: string; thumb: string | null; thumbUploadUrl: string | null };

/** A picked file, checked and measured in the browser before upload. */
export type PreparedSource = {
  file: File;
  kind: SourceKind;
  mime: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  thumb: Blob | null;
};

/** The MIME type to store (some browsers give HEIC / MOV files an empty type). */
export function mimeOf(f: File): string {
  if (f.type) return f.type === "image/jpg" ? "image/jpeg" : f.type;
  const ext = (f.name.split(".").pop() ?? "").toLowerCase();
  const byExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };
  return byExt[ext] ?? "";
}

export function kindOfMime(mime: string): SourceKind | null {
  if ((MEDIA_SOURCES.photoMime as readonly string[]).includes(mime)) return "photo";
  if ((MEDIA_SOURCES.videoMime as readonly string[]).includes(mime)) return "video";
  return null;
}

/** Draw a source (image or video frame) into a small WebP preview. */
async function toThumb(src: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  if (!w || !h) return null;
  const k = Math.min(1, MEDIA_SOURCES.thumbPx / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext("2d");
  if (!g) return null;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, c.width, c.height);
  return await new Promise<Blob | null>((res) => c.toBlob((b) => res(b), "image/webp", 0.82));
}

async function preparePhoto(file: File, mime: string): Promise<PreparedSource> {
  try {
    const bmp = await createImageBitmap(file);
    const thumb = await toThumb(bmp, bmp.width, bmp.height);
    const out = { file, kind: "photo" as const, mime, width: bmp.width, height: bmp.height, durationSec: null, thumb };
    bmp.close();
    return out;
  } catch {
    // A format this browser can't decode (HEIC outside Safari): stored as is, no preview.
    return { file, kind: "photo", mime, width: null, height: null, durationSec: null, thumb: null };
  }
}

async function prepareVideo(file: File, mime: string): Promise<PreparedSource> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  v.preload = "auto";
  try {
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("video_unreadable"));
      v.src = url;
    });
    const duration = Number.isFinite(v.duration) ? v.duration : null;
    // Preview from a moment in (the very first frame is often black).
    await new Promise<void>((res) => {
      const done = () => res();
      v.addEventListener("seeked", done, { once: true });
      setTimeout(done, 1500);
      v.currentTime = Math.min(0.5, (duration ?? 1) / 2);
    });
    const thumb = await toThumb(v, v.videoWidth, v.videoHeight).catch(() => null);
    return { file, kind: "video", mime, width: v.videoWidth || null, height: v.videoHeight || null, durationSec: duration, thumb };
  } catch {
    // Unreadable here (e.g. HEVC in Chrome): stored as is, no preview or duration.
    return { file, kind: "video", mime, width: null, height: null, durationSec: null, thumb: null };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

export type PrepareError = { name: string; reason: "type" | "big" | "long" };

/** Check + measure the picked files; returns the usable ones and what was refused. */
export async function prepareSources(list: File[]): Promise<{ ok: PreparedSource[]; refused: PrepareError[] }> {
  const ok: PreparedSource[] = [];
  const refused: PrepareError[] = [];
  for (const file of list) {
    const mime = mimeOf(file);
    const kind = kindOfMime(mime);
    if (!kind) {
      refused.push({ name: file.name, reason: "type" });
      continue;
    }
    const maxMB = kind === "photo" ? MEDIA_SOURCES.maxPhotoMB : MEDIA_SOURCES.maxVideoMB;
    if (file.size > maxMB * 1024 * 1024) {
      refused.push({ name: file.name, reason: "big" });
      continue;
    }
    const p = kind === "photo" ? await preparePhoto(file, mime) : await prepareVideo(file, mime);
    if (p.kind === "video" && p.durationSec != null && p.durationSec > MEDIA_SOURCES.maxVideoSec) {
      refused.push({ name: file.name, reason: "long" });
      continue;
    }
    ok.push(p);
  }
  return { ok, refused };
}

/** PUT one blob to a signed upload URL (one retry on a network error). */
export async function putSigned(url: string, body: Blob, type: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { method: "PUT", headers: { "content-type": type || "application/octet-stream", "x-upsert": "true" }, body });
      if (res.ok) return true;
    } catch {
      /* network error: one more try */
    }
  }
  return false;
}

export function formatBytes(n: number, locale?: string): string {
  const mb = n / (1024 * 1024);
  if (mb >= 1) return `${mb.toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(n / 1024)).toLocaleString(locale)} KB`;
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
