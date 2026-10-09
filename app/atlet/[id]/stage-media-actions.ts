"use server";

import { createHash, randomUUID } from "crypto";
import { db, supabaseUrl } from "@/lib/supabase";
import { requireSession, requirePermission } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { fail, run } from "@/lib/action-error";
import { STAGE_MEDIA } from "@/lib/config";
import { FetchRefused, safeFetch, type SafeResponse } from "@/lib/safe-fetch";
import {
  classifyLink,
  instagramEmbedUrl,
  instagramLink,
  parseStageMedia,
  stageMediaPictureUrl,
  videoHostAllowed,
  type LinkProblem,
  type StageMedia,
  type StageMediaSlot,
  type VideoProblem,
  type VideoReport,
} from "@/lib/stage-media";

/**
 * "Media frame panggung" (admin, every athlete): check a pasted link, keep a
 * copy of its picture in the public 360 bucket, and save / publish the
 * athlete's frame media through a draft (SQL M0). Visitors only ever get the
 * published value (lib/data.ts).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MB = 1024 * 1024;

async function requireEditor() {
  const s = requireSession();
  requirePermission(s, "athlete.edit");
  return s;
}

function checkAthlete(athleteId: string) {
  if (!athleteId || !UUID_RE.test(athleteId)) fail("missing_input");
}

/** Missing table / function (SQL M0 not run yet) → one clear code. */
function dbError(e: { message?: string; code?: string }): never {
  const msg = `${e?.code ?? ""} ${e?.message ?? ""}`;
  if (/42P01|42883|PGRST202|PGRST205|does not exist|Could not find the (table|function)/i.test(msg)) fail("stage_media_not_ready");
  throw new Error(e.message ?? "db error");
}

const PROBLEM_CODE: Record<LinkProblem, Parameters<typeof fail>[0]> = {
  empty: "missing_input",
  invalid: "link_invalid",
  too_long: "link_invalid",
  https: "link_https",
  drive: "link_drive",
  social: "link_social",
  unsupported: "link_unsupported",
  video_host: "link_video_host",
};

function refused(e: unknown): never {
  if (e instanceof FetchRefused) fail(e.reason === "too_big" ? "link_too_big" : e.reason === "network" ? "link_unreachable" : "link_invalid");
  throw e;
}

/** Store a picture copy under <athlete>/stage-media/<hash>.<ext> in the public bucket (same link → same name). */
async function keepPicture(athleteId: string, url: string, body: Buffer, mime: string): Promise<string> {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const name = createHash("sha256").update(url).digest("hex").slice(0, 24);
  const path = `${athleteId}/${STAGE_MEDIA.folder}/${name}.${ext}`;
  const { error } = await db().storage.from(STAGE_MEDIA.bucket).upload(path, body, { contentType: mime, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return path;
}

const imageMime = (h: Headers) => {
  const t = (h.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return t === "image/jpeg" || t === "image/png" || t === "image/webp" ? t : null;
};

/**
 * `video`: for a video file, what the server saw (status, type, size, Range,
 * CORS header, web server) and what keeps it from playing; the link is only
 * usable when `video.problems` is empty.
 */
export type CheckedLink = { slot: Omit<StageMediaSlot, "slot">; pictureUrl: string | null; needsPoster: boolean; video?: VideoReport };

/** The facts of one Range request to a video file, and what stops it from playing on the stage. */
function videoReport(url: string, res: SafeResponse | null): VideoReport {
  const host = new URL(url).hostname.toLowerCase();
  if (!res) return { host, status: 0, type: null, sizeMB: null, range: false, acao: null, server: null, problems: ["unreachable"] };
  const h = res.headers;
  const type = (h.get("content-type") ?? "").split(";")[0].trim().toLowerCase() || null;
  const cr = (h.get("content-range") ?? "").trim();
  const range = res.status === 206 && /^bytes \d+-\d+\/(\d+|\*)$/i.test(cr);
  const total = Number(cr.split("/")[1]) || (res.status === 200 ? Number(h.get("content-length") ?? 0) : 0) || 0;
  const raw = h.get("access-control-allow-origin");
  const acao = raw == null || !raw.trim() ? null : raw.trim().slice(0, 120);
  const seen = [h.get("server"), h.get("cf-ray") ? "cloudflare" : null, h.get("x-litespeed-cache") ? "litespeed-cache" : null]
    .filter((x): x is string => !!x)
    .map((x) => x.slice(0, 40));
  const problems: VideoProblem[] = [];
  const finalHost = new URL(res.url).hostname.toLowerCase();
  if (finalHost !== host && !videoHostAllowed(finalHost)) problems.push("redirect_host");
  if (res.status !== 200 && res.status !== 206) problems.push("unreachable");
  else {
    if (type !== "video/mp4" && type !== "video/webm") problems.push("not_video");
    if (total > STAGE_MEDIA.maxVideoMB * MB) problems.push("too_big");
    if (!range) problems.push("no_range");
    if (!acao) problems.push("no_cors");
    else if (acao.includes(",")) problems.push("cors_double");
    else if (acao !== "*" && acao !== STAGE_MEDIA.siteOrigin) problems.push("cors_other");
  }
  return {
    host: finalHost,
    status: res.status,
    type,
    sizeMB: total ? Math.round((total / MB) * 10) / 10 : null,
    range,
    acao,
    server: seen.length ? [...new Set(seen)].join(" · ") : null,
    problems,
  };
}

/**
 * Admin only. What a pasted link is and whether it can be used:
 * - YouTube: must exist and allow embedding (official oEmbed); its thumbnail is copied.
 * - Image (.jpg/.png/.webp): fetched (max STAGE_MEDIA.maxImageMB) and copied.
 * - Instagram post / reel: shown through Instagram's official embed (lightbox);
 *   the cover image is copied when Instagram hands it out.
 * - Video (.mp4/.webm): only from STAGE_MEDIA.videoHosts; must answer a Range
 *   request (206) with a video type, fit maxVideoMB and allow this site by
 *   CORS. Comes back with a report (`video`) either way; when it can play,
 *   the admin's browser makes a poster (issueStagePosterUpload).
 * - Anything else is refused with a code that says why and what to use instead.
 */
export async function checkStageMediaLink(athleteId: string, rawUrl: string): Promise<ActionResult<CheckedLink>> {
  return run(async () => {
    await requireEditor();
    checkAthlete(athleteId);
    const c = classifyLink(rawUrl);
    if (!c.ok) fail(PROBLEM_CODE[c.problem]);
    const base = supabaseUrl();
    const now = new Date().toISOString();

    if (c.kind === "youtube") {
      let title: string | null = null;
      try {
        const o = await safeFetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(c.url)}`, { maxBytes: 64 * 1024 });
        if (o.status === 401 || o.status === 403) fail("link_not_embeddable");
        if (o.status !== 200 || !o.body) fail("link_unreachable");
        const j = JSON.parse(o.body.toString("utf8")) as { title?: unknown };
        title = typeof j.title === "string" ? j.title.slice(0, STAGE_MEDIA.maxTitle) : null;
      } catch (e) {
        refused(e);
      }
      let thumb: string | null = null;
      for (const name of ["maxresdefault", "sddefault", "hqdefault"]) {
        try {
          const t = await safeFetch(`https://i.ytimg.com/vi/${c.ytId}/${name}.jpg`, { maxBytes: STAGE_MEDIA.maxThumbMB * MB });
          // YouTube answers a missing size with a tiny grey placeholder: skip it.
          if (t.status === 200 && t.body && t.body.length > 2000) {
            thumb = await keepPicture(athleteId, c.url, t.body, "image/jpeg");
            break;
          }
        } catch (e) {
          if (!(e instanceof FetchRefused)) throw e;
        }
      }
      return {
        ok: true,
        slot: { kind: "youtube", url: c.url, ig: null, ytId: c.ytId, thumb, w: 16, h: 9, title, checkedAt: now },
        pictureUrl: stageMediaPictureUrl(base, thumb),
        needsPoster: false,
      };
    }

    if (c.kind === "instagram") {
      // Official embed page: 404 = post doesn't exist / is private. Its cover
      // image (Instagram's CDN) becomes the screen picture when we can get it;
      // otherwise the stage shows an Instagram card. Instagram often refuses
      // servers, so anything but a clear 404 still lets the link through.
      let thumb: string | null = null;
      try {
        const e = await safeFetch(instagramEmbedUrl(c.url)!, { maxBytes: 1024 * 1024 });
        if (e.status === 404) fail("link_unreachable");
        const html = e.status === 200 && e.body ? e.body.toString("utf8") : "";
        const m = html.match(/class="EmbeddedMediaImage"[^>]*?src="([^"]+)"/) ?? html.match(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]+src="([^"]+)"/);
        const src = m ? m[1].replace(/&amp;/g, "&") : null;
        if (src) {
          const host = new URL(src).hostname;
          if (/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(host)) {
            const img = await safeFetch(src, { maxBytes: STAGE_MEDIA.maxImageMB * MB });
            const mime = img.status === 200 ? imageMime(img.headers) : null;
            if (mime && img.body) thumb = await keepPicture(athleteId, c.url, img.body, mime);
          }
        }
      } catch (e) {
        if (!(e instanceof FetchRefused)) throw e;
      }
      return {
        ok: true,
        slot: { kind: "instagram", url: c.url, ig: c.url, ytId: null, thumb, w: null, h: null, title: null, checkedAt: now },
        pictureUrl: stageMediaPictureUrl(base, thumb),
        needsPoster: false,
      };
    }

    if (c.kind === "image") {
      let res;
      try {
        res = await safeFetch(c.url, { maxBytes: STAGE_MEDIA.maxImageMB * MB });
      } catch (e) {
        refused(e);
      }
      if (res.status !== 200 || !res.body) fail("link_unreachable");
      const mime = imageMime(res.headers);
      if (!mime) fail("link_unsupported");
      const thumb = await keepPicture(athleteId, c.url, res.body, mime);
      return {
        ok: true,
        slot: { kind: "image", url: c.url, ig: null, ytId: null, thumb, w: null, h: null, title: null, checkedAt: now },
        pictureUrl: stageMediaPictureUrl(base, thumb),
        needsPoster: false,
      };
    }

    // Direct video: the stage plays it from that server, so ask the way a
    // browser on our site does (Origin + Range) and report everything that
    // would stop it (headers only, the body is not read).
    let res: SafeResponse | null = null;
    try {
      res = await safeFetch(c.url, { method: "GET", headers: { Origin: STAGE_MEDIA.siteOrigin, Range: "bytes=0-1023" }, maxBytes: null });
    } catch (e) {
      if (!(e instanceof FetchRefused) || (e.reason !== "network" && e.reason !== "redirects")) refused(e);
    }
    const video = videoReport(c.url, res);
    return {
      ok: true,
      slot: { kind: "video", url: c.url, ig: null, ytId: null, thumb: null, w: null, h: null, title: null, checkedAt: now },
      pictureUrl: null,
      needsPoster: video.problems.length === 0,
      video,
    };
  });
}

/**
 * Admin only. The Instagram post / reel a click on the screen opens: must be
 * a post or reel link; a clear 404 from Instagram's official embed = deleted
 * or private. Instagram often refuses servers, so `verified` is false when it
 * couldn't be confirmed (the link is still usable).
 */
export async function checkStageInstagramLink(athleteId: string, rawUrl: string): Promise<ActionResult<{ url: string; verified: boolean }>> {
  return run(async () => {
    await requireEditor();
    checkAthlete(athleteId);
    const url = instagramLink(rawUrl);
    if (!url) fail("link_ig_invalid");
    let verified = false;
    try {
      const e = await safeFetch(instagramEmbedUrl(url)!, { maxBytes: null });
      if (e.status === 404) fail("link_unreachable");
      verified = e.status === 200;
    } catch (e) {
      if (!(e instanceof FetchRefused)) throw e;
    }
    return { ok: true, url, verified };
  });
}

/** Admin only. Signed upload URL for a video poster made in the admin's browser (WebP). */
export async function issueStagePosterUpload(athleteId: string): Promise<ActionResult<{ path: string; uploadUrl: string; publicUrl: string }>> {
  return run(async () => {
    await requireEditor();
    checkAthlete(athleteId);
    const path = `${athleteId}/${STAGE_MEDIA.folder}/${randomUUID().replace(/-/g, "")}.webp`;
    const { data, error } = await db().storage.from(STAGE_MEDIA.bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? "no upload url");
    const base = supabaseUrl().replace(/\/$/, "");
    const uploadUrl = data.signedUrl.startsWith("http") ? data.signedUrl : base + data.signedUrl;
    return { ok: true, path, uploadUrl, publicUrl: stageMediaPictureUrl(base, path)! };
  });
}

export type StageMediaState = { draft: StageMedia | null; published: StageMedia; version: number; pictureBase: string };

/** Admin only. Draft (if any) and published frame media of one athlete. */
export async function getStageMediaAdmin(athleteId: string): Promise<ActionResult<StageMediaState>> {
  return run(async () => {
    await requireEditor();
    checkAthlete(athleteId);
    const { data, error } = await db()
      .from("smb_athlete_stage_media")
      .select("draft,published,version")
      .eq("athlete_id", athleteId)
      .maybeSingle<{ draft: unknown; published: unknown; version: number }>();
    if (error) dbError(error);
    return {
      ok: true,
      draft: data?.draft ? parseStageMedia(data.draft, athleteId) : null,
      published: parseStageMedia(data?.published, athleteId),
      version: Number(data?.version ?? 0),
      pictureBase: supabaseUrl(),
    };
  });
}

/** Admin only. Saves the frame media as a draft (re-validated here and in the database). */
export async function saveStageMediaDraft(athleteId: string, media: StageMedia): Promise<ActionResult<{ draft: StageMedia }>> {
  return run(async () => {
    const s = await requireEditor();
    checkAthlete(athleteId);
    const clean = parseStageMedia(media, athleteId);
    const inSlots = Array.isArray((media as StageMedia | null)?.slots) ? (media as StageMedia).slots.length : 0;
    if (clean.slots.length !== inSlots) fail("stage_media_invalid");
    const { error } = await db().rpc("smb_save_athlete_stage_media_draft", {
      p_athlete_id: athleteId,
      p_draft: clean,
      p_actor_id: s.sub,
      p_actor_name: s.nama,
    });
    if (error) dbError(error);
    return { ok: true, draft: clean };
  });
}

/** Admin only. Puts the draft live (database checks it again). */
export async function publishStageMedia(athleteId: string): Promise<ActionResult<{ version: number }>> {
  return run(async () => {
    const s = await requireEditor();
    checkAthlete(athleteId);
    const { data, error } = await db().rpc("smb_publish_athlete_stage_media", {
      p_athlete_id: athleteId,
      p_actor_id: s.sub,
      p_actor_name: s.nama,
    });
    if (error) dbError(error);
    return { ok: true, version: Number((data as { version?: number } | null)?.version ?? 0) };
  });
}
