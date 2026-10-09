import { STAGE_MEDIA } from "@/lib/config";

/**
 * Stage frame media: shared types + pure link helpers (no server imports, safe
 * in client components). The server re-checks every link (see
 * app/atlet/[id]/stage-media-actions.ts) before it is stored.
 */

export type StageMediaKind = "youtube" | "video" | "image" | "instagram";

export type StageMediaSlot = {
  /** Screen index 0..STAGE_MEDIA.slots-1. */
  slot: number;
  kind: StageMediaKind;
  /** Normalized https link (YouTube: https://www.youtube.com/watch?v=<id>; Instagram: https://www.instagram.com/<p|reel|tv>/<code>/). */
  url: string;
  /**
   * Where a click on the screen goes: the athlete's Instagram post / reel
   * (normalized like `url`), or null (the screen is not clickable). For an
   * Instagram-only screen (kind "instagram") it is that post. Optional in
   * stored rows (added 2026-10-09, same jsonb, no SQL).
   */
  ig: string | null;
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

export type LinkProblem = "empty" | "invalid" | "too_long" | "https" | "drive" | "social" | "unsupported" | "video_host";
export type LinkClass = { ok: true; kind: StageMediaKind; url: string; ytId: string | null } | { ok: false; problem: LinkProblem };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const SOCIAL = /(^|\.)(instagr\.am|tiktok\.com|facebook\.com|fb\.watch|x\.com|twitter\.com|vimeo\.com)$/i;
const IG_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const IG_CODE = /^[A-Za-z0-9_-]{5,40}$/;
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

/**
 * Instagram post / reel / IGTV from any common link form (also
 * instagram.com/<user>/p/<code>/), normalized to https://www.instagram.com/<type>/<code>/.
 */
export function instagramUrl(u: URL): string | null {
  if (!IG_HOSTS.has(u.hostname.toLowerCase())) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const i = parts.findIndex((x) => ["p", "reel", "reels", "tv"].includes(x));
  if (i < 0 || i > 1 || !parts[i + 1] || !IG_CODE.test(parts[i + 1])) return null;
  const type = parts[i] === "reels" ? "reel" : parts[i];
  return `https://www.instagram.com/${type}/${parts[i + 1]}/`;
}

/** May a video file from this host play on the stage (STAGE_MEDIA.videoHosts)? */
export function videoHostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return (STAGE_MEDIA.videoHosts as readonly string[]).includes(h);
}

/** A pasted Instagram post / reel link, normalized; null when it isn't one. */
export function instagramLink(raw: string): string | null {
  const text = String(raw ?? "").trim();
  if (!text || text.length > STAGE_MEDIA.maxUrlLength) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return u.protocol === "https:" ? instagramUrl(u) : null;
  } catch {
    return null;
  }
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
  const ig = instagramUrl(u);
  if (ig) return { ok: true, kind: "instagram", url: ig, ytId: null };
  if (IG_HOSTS.has(host)) return { ok: false, problem: "unsupported" };
  if (DRIVE.test(host)) return { ok: false, problem: "drive" };
  if (SOCIAL.test(host)) return { ok: false, problem: "social" };
  u.hash = "";
  if (VIDEO_EXT.test(u.pathname)) return videoHostAllowed(host) ? { ok: true, kind: "video", url: u.toString(), ytId: null } : { ok: false, problem: "video_host" };
  if (IMAGE_EXT.test(u.pathname)) return { ok: true, kind: "image", url: u.toString(), ytId: null };
  return { ok: false, problem: "unsupported" };
}

/** Instagram's official embed for a normalized post / reel link (lightbox). */
export function instagramEmbedUrl(url: string): string | null {
  const m = url.match(/^https:\/\/www\.instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]{5,40})\/$/);
  return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed/` : null;
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
      ig: c.kind === "instagram" ? c.url : typeof it.ig === "string" ? instagramLink(it.ig) : null,
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
  /** Still picture: thumbnail, image copy or the video's poster. */
  picture: string | null;
  ytId: string | null;
  /** The screen's own link (YouTube / video file / image / Instagram post). */
  url: string;
  /** Video file played inside the frame (kind "video"), else null. */
  video: string | null;
  /** Click target: the Instagram post / reel (opens in a new tab), else null. */
  ig: string | null;
  title: string | null;
};

export function stageScreens(media: StageMedia, supabaseUrl: string): StageScreen[] {
  return media.slots
    .filter((s) => s.thumb || s.kind === "video" || s.kind === "instagram")
    .map((s) => ({
      slot: s.slot,
      kind: s.kind,
      picture: stageMediaPictureUrl(supabaseUrl, s.thumb),
      ytId: s.ytId,
      url: s.url,
      video: s.kind === "video" ? s.url : null,
      ig: s.ig,
      title: s.title,
    }));
}

/**
 * What a click on a screen does: open the Instagram post (any screen with a
 * link), play a YouTube video in the lightbox (it can't play inside the
 * frame), or nothing.
 */
export function screenAction(s: Pick<StageScreen, "ig" | "kind">): "instagram" | "lightbox" | null {
  if (s.ig) return "instagram";
  return s.kind === "youtube" ? "lightbox" : null;
}

/**
 * The verdict of the server's look at a video file link (admin "Check link"):
 * the facts it saw and what keeps it from playing on the stage (empty = it
 * plays). See checkStageMediaLink.
 */
export type VideoProblem = "unreachable" | "not_video" | "too_big" | "no_range" | "no_cors" | "cors_other" | "cors_double" | "redirect_host";
export type VideoReport = {
  host: string;
  status: number;
  type: string | null;
  sizeMB: number | null;
  /** Answered the Range request with 206 + Content-Range (Safari / iPhone need it). */
  range: boolean;
  /** Access-Control-Allow-Origin as sent (trimmed), or null. */
  acao: string | null;
  /** Web server / CDN seen in the headers (Server, cf-ray, x-litespeed-cache), or null. */
  server: string | null;
  problems: VideoProblem[];
};
