"use server";

import { randomUUID } from "crypto";
import { db, supabaseUrl } from "@/lib/supabase";
import { requireSession, requirePermission } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { fail, run } from "@/lib/action-error";
import { MEDIA_SOURCES } from "@/lib/config";
import type { SourceItem, SourceKind, SourceUploadSlot } from "@/lib/media-sources";

/**
 * "Bahan 360": original photos and videos per athlete, in a private bucket
 * (service role only) plus a list table (SQL S0). Admin only; any athlete.
 */

const { bucket: BUCKET } = MEDIA_SOURCES;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_RE = /^[0-9a-f]{32}\.(jpg|png|webp|heic|mp4|mov|webm)$/;
const THUMB_RE = /^[0-9a-f]{32}\.thumb\.webp$/;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

async function requireEditor() {
  const s = requireSession();
  requirePermission(s, "athlete.edit");
  return s;
}

function checkAthlete(athleteId: string) {
  if (!athleteId || !UUID_RE.test(athleteId)) fail("missing_input");
}

/** Missing table / bucket (SQL S0 not run yet) → one clear code. */
function notReady(e: { message?: string; code?: string } | null | undefined): boolean {
  const msg = `${e?.code ?? ""} ${e?.message ?? ""}`;
  return /42P01|PGRST205|does not exist|Could not find the table|Bucket not found/i.test(msg);
}

function dbError(e: { message?: string; code?: string }): never {
  if (notReady(e)) fail("sources_not_ready");
  throw new Error(e.message ?? "db error");
}

const kindOf = (mime: string): SourceKind | null =>
  (MEDIA_SOURCES.photoMime as readonly string[]).includes(mime)
    ? "photo"
    : (MEDIA_SOURCES.videoMime as readonly string[]).includes(mime)
      ? "video"
      : null;

type Row = {
  id: string;
  kind: SourceKind;
  file: string;
  thumb: string | null;
  original_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  angle_hint: number | null;
  uploaded_by_name: string | null;
  created_at: string;
};

/** Admin only. The athlete's materials, newest last, with signed preview URLs. */
export async function listSources(athleteId: string): Promise<ActionResult<{ items: SourceItem[] }>> {
  return run(async () => {
    await requireEditor();
    checkAthlete(athleteId);
    const { data, error } = await db()
      .from("smb_athlete_media_sources")
      .select("id,kind,file,thumb,original_name,mime,size_bytes,width,height,duration_sec,angle_hint,uploaded_by_name,created_at")
      .eq("athlete_id", athleteId)
      .order("created_at", { ascending: true });
    if (error) dbError(error);
    const rows = (data ?? []) as Row[];
    const thumbs = rows.map((r) => r.thumb).filter((t): t is string => !!t);
    const urls: Record<string, string> = {};
    if (thumbs.length) {
      const { data: signed, error: sErr } = await db().storage.from(BUCKET).createSignedUrls(thumbs, MEDIA_SOURCES.viewUrlSec);
      if (sErr) dbError(sErr);
      (signed ?? []).forEach((s, i) => {
        if (s.signedUrl) urls[thumbs[i]] = s.signedUrl;
      });
    }
    return {
      ok: true,
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        originalName: r.original_name ?? "",
        mime: r.mime ?? "",
        sizeBytes: Number(r.size_bytes ?? 0),
        width: r.width,
        height: r.height,
        durationSec: r.duration_sec == null ? null : Number(r.duration_sec),
        angleHint: r.angle_hint == null ? null : Number(r.angle_hint),
        uploadedByName: r.uploaded_by_name,
        createdAt: r.created_at,
        thumbUrl: r.thumb ? urls[r.thumb] ?? null : null,
      })),
    };
  });
}

/**
 * Admin only. Signed upload URLs for new materials (and their previews):
 * unique names in the athlete's folder. Nothing is listed until recordSources.
 */
export async function issueSourceUploads(
  athleteId: string,
  files: { mime: string; size: number; thumb: boolean }[],
  opts?: { replace?: boolean },
): Promise<ActionResult<{ slots: SourceUploadSlot[] }>> {
  return run(async () => {
    await requireEditor();
    checkAthlete(athleteId);
    if (!Array.isArray(files) || files.length < 1 || files.length > MEDIA_SOURCES.maxBatch) fail("source_invalid");
    const { count, error: cErr } = await db()
      .from("smb_athlete_media_sources")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", athleteId);
    if (cErr) dbError(cErr);
    // A replacement swaps one file for another: the list doesn't grow.
    if (!opts?.replace && (count ?? 0) + files.length > MEDIA_SOURCES.maxPerAthlete) fail("source_limit");
    if (opts?.replace && files.length !== 1) fail("source_invalid");
    const bucket = db().storage.from(BUCKET);
    const base = supabaseUrl().replace(/\/$/, "");
    const abs = (u: string) => (u.startsWith("http") ? u : base + u);
    const slots: SourceUploadSlot[] = [];
    for (const f of files) {
      const kind = kindOf(String(f?.mime ?? ""));
      if (!kind) fail("source_invalid");
      const maxMB = kind === "photo" ? MEDIA_SOURCES.maxPhotoMB : MEDIA_SOURCES.maxVideoMB;
      if (!(Number(f.size) > 0) || Number(f.size) > maxMB * 1024 * 1024) fail("source_too_big");
      const key = randomUUID().replace(/-/g, "");
      const name = `${key}.${EXT[f.mime]}`;
      const { data, error } = await bucket.createSignedUploadUrl(`${athleteId}/${name}`);
      if (error || !data) dbError(error ?? { message: "no upload url" });
      let thumbName: string | null = null;
      let thumbUrl: string | null = null;
      if (f.thumb) {
        thumbName = `${key}.thumb.webp`;
        const t = await bucket.createSignedUploadUrl(`${athleteId}/${thumbName}`);
        if (t.error || !t.data) dbError(t.error ?? { message: "no upload url" });
        thumbUrl = abs(t.data.signedUrl);
      }
      slots.push({ file: name, uploadUrl: abs(data.signedUrl), thumb: thumbName, thumbUploadUrl: thumbUrl });
    }
    return { ok: true, slots };
  });
}

/** Admin only. Lists uploaded materials (only files that really arrived in the bucket). */
export async function recordSources(
  athleteId: string,
  items: {
    file: string;
    thumb: string | null;
    originalName: string;
    mime: string;
    size: number;
    width: number | null;
    height: number | null;
    durationSec: number | null;
  }[],
): Promise<ActionResult<{ added: number }>> {
  return run(async () => {
    const s = await requireEditor();
    checkAthlete(athleteId);
    if (!Array.isArray(items) || items.length < 1 || items.length > MEDIA_SOURCES.maxBatch) fail("source_invalid");
    const { data: listed, error: lErr } = await db().storage.from(BUCKET).list(athleteId, { limit: 1000 });
    if (lErr) dbError(lErr);
    const present = new Set((listed ?? []).map((o) => o.name));
    const int = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
    const rows = items.map((it) => {
      const kind = kindOf(String(it?.mime ?? ""));
      if (!kind || !NAME_RE.test(String(it.file)) || !present.has(it.file)) fail("source_invalid");
      const thumb = it.thumb && THUMB_RE.test(it.thumb) && present.has(it.thumb) ? it.thumb : null;
      return {
        athlete_id: athleteId,
        kind,
        file: `${athleteId}/${it.file}`,
        thumb: thumb ? `${athleteId}/${thumb}` : null,
        original_name: String(it.originalName ?? "").slice(0, 160),
        mime: it.mime,
        size_bytes: int(it.size),
        width: int(it.width),
        height: int(it.height),
        duration_sec: kind === "video" && Number(it.durationSec) > 0 ? Math.round(Number(it.durationSec) * 100) / 100 : null,
        uploaded_by: s.sub,
        uploaded_by_name: s.nama,
      };
    });
    const { error } = await db().from("smb_athlete_media_sources").insert(rows);
    if (error) dbError(error);
    return { ok: true, added: rows.length };
  });
}

/** Admin only. A short-lived URL to view / play one material in full. */
export async function signSource(athleteId: string, id: string): Promise<ActionResult<{ url: string }>> {
  return run(async () => {
    await requireEditor();
    checkAthlete(athleteId);
    if (!UUID_RE.test(String(id))) fail("source_not_found");
    const { data, error } = await db()
      .from("smb_athlete_media_sources")
      .select("file")
      .eq("athlete_id", athleteId)
      .eq("id", id)
      .maybeSingle<{ file: string }>();
    if (error) dbError(error);
    if (!data) fail("source_not_found");
    const { data: signed, error: sErr } = await db().storage.from(BUCKET).createSignedUrl(data.file, MEDIA_SOURCES.viewUrlSec);
    if (sErr || !signed) dbError(sErr ?? { message: "no url" });
    return { ok: true, url: signed.signedUrl };
  });
}

/** Admin only. The angle a photo was taken from (0 = Front, 90 = Right), or null = automatic. */
export async function setSourceAngle(athleteId: string, id: string, angle: number | null): Promise<ActionResult> {
  return run(async () => {
    await requireEditor();
    checkAthlete(athleteId);
    if (!UUID_RE.test(String(id))) fail("source_not_found");
    const a = angle == null ? null : ((Math.round(Number(angle) * 10) / 10) % 360 + 360) % 360;
    if (a != null && !Number.isFinite(a)) fail("source_invalid");
    const { data, error } = await db()
      .from("smb_athlete_media_sources")
      .update({ angle_hint: a })
      .eq("athlete_id", athleteId)
      .eq("id", id)
      .select("id");
    if (error) dbError(error);
    if (!data?.length) fail("source_not_found");
    return { ok: true };
  });
}

/** Admin only. Deletes one material (file, preview and list entry). Turn sets already made keep their pictures. */
export async function deleteSource(athleteId: string, id: string): Promise<ActionResult> {
  return run(async () => {
    await requireEditor();
    checkAthlete(athleteId);
    if (!UUID_RE.test(String(id))) fail("source_not_found");
    const { data, error } = await db()
      .from("smb_athlete_media_sources")
      .select("file,thumb")
      .eq("athlete_id", athleteId)
      .eq("id", id)
      .maybeSingle<{ file: string; thumb: string | null }>();
    if (error) dbError(error);
    if (!data) fail("source_not_found");
    const paths = [data.file, data.thumb].filter((p): p is string => !!p && p.startsWith(`${athleteId}/`));
    const { error: rmErr } = await db().storage.from(BUCKET).remove(paths);
    if (rmErr) dbError(rmErr);
    const { error: dErr } = await db().from("smb_athlete_media_sources").delete().eq("athlete_id", athleteId).eq("id", id);
    if (dErr) dbError(dErr);
    return { ok: true };
  });
}

/**
 * Admin only. Replaces one material with a newly uploaded file of the same
 * kind (photo for photo, video for video). The list entry keeps its id, its
 * place (created_at, so the automatic turn order doesn't move) and its angle;
 * the old file and preview are deleted afterwards. Turn sets already made keep
 * their pictures until "Pick again" + Publish.
 */
export async function replaceSource(
  athleteId: string,
  id: string,
  it: {
    file: string;
    thumb: string | null;
    originalName: string;
    mime: string;
    size: number;
    width: number | null;
    height: number | null;
    durationSec: number | null;
  },
): Promise<ActionResult> {
  return run(async () => {
    const s = await requireEditor();
    checkAthlete(athleteId);
    if (!UUID_RE.test(String(id))) fail("source_not_found");
    const { data: old, error } = await db()
      .from("smb_athlete_media_sources")
      .select("kind,file,thumb")
      .eq("athlete_id", athleteId)
      .eq("id", id)
      .maybeSingle<{ kind: SourceKind; file: string; thumb: string | null }>();
    if (error) dbError(error);
    if (!old) fail("source_not_found");
    const kind = kindOf(String(it?.mime ?? ""));
    if (!kind || kind !== old.kind) fail("source_kind_mismatch");
    const { data: listed, error: lErr } = await db().storage.from(BUCKET).list(athleteId, { limit: 1000 });
    if (lErr) dbError(lErr);
    const present = new Set((listed ?? []).map((o) => o.name));
    if (!NAME_RE.test(String(it.file)) || !present.has(it.file)) fail("source_invalid");
    const thumb = it.thumb && THUMB_RE.test(it.thumb) && present.has(it.thumb) ? it.thumb : null;
    const int = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
    const { error: uErr } = await db()
      .from("smb_athlete_media_sources")
      .update({
        file: `${athleteId}/${it.file}`,
        thumb: thumb ? `${athleteId}/${thumb}` : null,
        original_name: String(it.originalName ?? "").slice(0, 160),
        mime: it.mime,
        size_bytes: int(it.size),
        width: int(it.width),
        height: int(it.height),
        duration_sec: kind === "video" && Number(it.durationSec) > 0 ? Math.round(Number(it.durationSec) * 100) / 100 : null,
        uploaded_by: s.sub,
        uploaded_by_name: s.nama,
      })
      .eq("athlete_id", athleteId)
      .eq("id", id);
    if (uErr) dbError(uErr);
    // Old file + preview go only after the list points at the new ones; a
    // failed removal leaves an unlisted file behind, never a broken entry.
    const oldPaths = [old.file, old.thumb].filter((p): p is string => !!p && p.startsWith(`${athleteId}/`));
    if (oldPaths.length) {
      const { error: rmErr } = await db().storage.from(BUCKET).remove(oldPaths);
      if (rmErr) console.error("replaceSource: old file not removed", rmErr.message);
    }
    return { ok: true };
  });
}
