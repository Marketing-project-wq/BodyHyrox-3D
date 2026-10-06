import { STAGE_MEDIA } from "@/lib/config";

/**
 * Stage frame media: shared types + pure link helpers (no server imports, safe
 * in client components). The server re-checks every link (see
 * app/atlet/[id]/stage-media-actions.ts) before it is stored.
 */

export type StageMediaKind = "youtube" | "video" | "image";

export type StageMediaSlot = {
  /** Screen index 0..STAGE_MEDIA.slots-1. */
  slot: number;
  kind: StageMediaKind;
  /** Normalized https link (YouTube: https://www.youtube.com/watch?v=<id>). */
  url: string;
  ytId: string | null;
  /** Picture shown on the screen: path inside the public 360 bucket (thumbnail, image copy or video poster). */
  thumb: string | null;
  w: number | null;
  h: number | null;
  title: string | null;
  checkedAt: string | null;
};

export type StageMedia = { v: 1; slots: StageMediaSlot[] };

export const EMPTY_STAGE_MEDIA: StageMedia = { v: 1, slots: [] };

export type LinkProblem = "empty" | "invalid" | "too_long" | "https" | "drive" | "social" | "unsupported";
export type LinkClass = { ok: true; kind: StageMediaKind; url: string; ytId: string | null } | { ok: false; problem: LinkProblem };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const SOCIAL = /(^|\.)(instagram\.com|instagr\.am|tiktok\.com|facebook\.com|fb\.watch|x\.com|twitter\.com|vimeo\.com)$/i;
const DRIVE = /(^|\.)(drive\.google\.com|docs\.google\.com|dropbox\.com|onedrive\.live\.com|1drv\.ms)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** True for hosts that are an IP literal or a local name (never fetched or embedded). */
export function isLocalOrIpHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  return h.includes(":"); // IPv6 literal
}

/** YouTube video id from any common YouTube link form, or null. */
export function youtubeId(u: URL): string | null {
  const host = u.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (YT_HOSTS.has(host)) {
    const parts = u.pathname.split("/").filter(Boolean);
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else if (["shorts", "live", "embed", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
  }
  return id && YT_ID.test(id) ? id : null;
}

/** First-pass check of a pasted link: what it is and its normalized form. */
export function classifyLink(raw: string): LinkClass {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, problem: "empty" };
  if (text.length > STAGE_MEDIA.maxUrlLength) return { ok: false, problem: "too_long" };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, problem: "invalid" };
  }
  if (u.protocol === "http:") return { ok: false, problem: "https" };
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return { ok: false, problem: "invalid" };
  if (isLocalOrIpHost(u.hostname)) return { ok: false, problem: "invalid" };
  const host = u.hostname.toLowerCase();
  const yt = youtubeId(u);
  if (yt) return { ok: true, kind: "youtube", url: `https://www.youtube.com/watch?v=${yt}`, ytId: yt };
  if (host === "youtu.be" || YT_HOSTS.has(host)) return { ok: false, problem: "unsupported" };
  if (DRIVE.test(host)) return { ok: false, problem: "drive" };
  if (SOCIAL.test(host)) return { ok: false, problem: "social" };
  u.hash = "";
  if (VIDEO_EXT.test(u.pathname)) return { ok: true, kind: "video", url: u.toString(), ytId: null };
  if (IMAGE_EXT.test(u.pathname)) return { ok: true, kind: "image", url: u.toString(), ytId: null };
  return { ok: false, problem: "unsupported" };
}

/** The official, privacy-enhanced YouTube player for the lightbox (built from the id only). */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);

/**
 * Stored stage media (draft or published jsonb) → clean value. Anything that
 * doesn't pass the link check again is dropped, so a bad row never reaches
 * the stage. `athleteId` restricts picture paths to that athlete's folder.
 */
export function parseStageMedia(raw: unknown, athleteId?: string): StageMedia {
  const r = raw as { slots?: unknown } | null;
  if (!r || typeof r !== "object" || !Array.isArray(r.slots)) return EMPTY_STAGE_MEDIA;
  const used = new Set<number>();
  const slots: StageMediaSlot[] = [];
  for (const it of r.slots as Record<string, unknown>[]) {
    if (!it || typeof it !== "object") continue;
    const slot = Number(it.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= STAGE_MEDIA.slots || used.has(slot)) continue;
    const c = classifyLink(String(it.url ?? ""));
    if (!c.ok || c.kind !== it.kind) continue;
    let thumb = str(it.thumb, 300);
    if (thumb && (!/^[0-9a-f-]{36}\/stage-media\/[0-9a-z]+\.(jpg|png|webp)$/.test(thumb) || (athleteId && !thumb.startsWith(`${athleteId}/`)))) thumb = null;
    used.add(slot);
    slots.push({
      slot,
      kind: c.kind,
      url: c.url,
      ytId: c.ytId,
      thumb,
      w: num(it.w),
      h: num(it.h),
      title: str(it.title, STAGE_MEDIA.maxTitle),
      checkedAt: str(it.checkedAt, 40),
    });
  }
  slots.sort((a, b) => a.slot - b.slot);
  return { v: 1, slots };
}

/** Public URL of a stored picture (thumb path) in the public 360 bucket. */
export function stageMediaPictureUrl(supabaseUrl: string, path: string | null): string | null {
  return path ? `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${STAGE_MEDIA.bucket}/${path}` : null;
}

/** One screen as the public stage needs it (picture already a public URL). */
export type StageScreen = {
  slot: number;
  kind: StageMediaKind;
  picture: string | null;
  ytId: string | null;
  /** Direct video / image link (lightbox). */
  url: string;
  title: string | null;
};

export function stageScreens(media: StageMedia, supabaseUrl: string): StageScreen[] {
  return media.slots
    .filter((s) => s.thumb || s.kind === "video")
    .map((s) => ({ slot: s.slot, kind: s.kind, picture: stageMediaPictureUrl(supabaseUrl, s.thumb), ytId: s.ytId, url: s.url, title: s.title }));
}
