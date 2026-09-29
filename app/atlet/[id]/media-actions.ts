"use server";

import { revalidatePath } from "next/cache";
import { db, supabaseUrl } from "@/lib/supabase";
import { requireSession, requirePermission } from "@/lib/auth";
import { SPONSOR_360_UPLOAD } from "@/lib/config";
import { VIEW_KEYS, type ViewKey } from "@/lib/views";
import type { DraftFrame, Foot, FrameMeta, FrameMetaMap, Media360Draft } from "@/lib/media360";
import { draftFromLive, draftHotspotsByFile, followReplacedFrames, hotspotsToFrameNumbers, type SideHotspot } from "@/lib/media360-sides";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import path from "path";

type UploadSlot = { file: string; path: string; uploadUrl: string };

function safeExt(name: string): string {
  const e = (name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (e === "jpeg") return "jpg";
  return ["jpg", "png", "webp"].includes(e) ? e : "jpg";
}

const FILE_RE = /^[A-Za-z0-9_.-]{1,80}$/;
const { bucket: PUBLIC_BUCKET, privateBucket: PRIVATE_BUCKET } = SPONSOR_360_UPLOAD;

/** The athlete's published folder in the public bucket (what sponsors load). */
function publicBase(athleteId: string): string {
  return `${supabaseUrl().replace(/\/$/, "")}/storage/v1/object/public/${PUBLIC_BUCKET}/${athleteId}`;
}

/** Folders a draft frame may come from: this athlete's storage folder or a bundled /media set. */
function allowedBase(athleteId: string, base: string | null): boolean {
  if (base === null) return true;
  return base === publicBase(athleteId) || /^\/media\/atlet-360\/[a-z0-9-]+$/.test(base);
}

async function requireEditor() {
  const s = requireSession();
  requirePermission(s, "athlete.edit");
  return s;
}

function revalidateAthlete(athleteId: string) {
  revalidatePath(`/atlet/${athleteId}`);
  revalidatePath(`/admin/atlet/${athleteId}`);
}

const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

/** Validate + normalise a draft coming from the browser (never trusted as-is). */
function cleanDraft(athleteId: string, raw: Media360Draft): Media360Draft {
  if (!raw || !Array.isArray(raw.frames)) throw new Error("draft_invalid");
  if (raw.frames.length > SPONSOR_360_UPLOAD.maxFrames) throw new Error(`Maksimal ${SPONSOR_360_UPLOAD.maxFrames} frame.`);
  const seen = new Set<string>();
  const frames: DraftFrame[] = raw.frames.map((f) => {
    const file = String(f?.file ?? "");
    const base = f?.base == null ? null : String(f.base);
    if (!FILE_RE.test(file) || seen.has(file)) throw new Error("Nama frame tidak valid / ganda.");
    if (!allowedBase(athleteId, base)) throw new Error("Sumber frame tidak valid.");
    seen.add(file);
    return { file, base, origin: f?.origin == null ? null : String(f.origin) };
  });
  const meta: FrameMetaMap = {};
  for (const [file, mRaw] of Object.entries(raw.meta ?? {})) {
    if (!FILE_RE.test(file) || !mRaw || typeof mRaw !== "object") continue;
    const out: FrameMeta = {};
    if (mRaw.t) {
      out.t = {
        rot: num(mRaw.t.rot, -45, 45, 0),
        dx: num(mRaw.t.dx, -0.5, 0.5, 0),
        dy: num(mRaw.t.dy, -0.5, 0.5, 0),
        s: num(mRaw.t.s, 0.5, 1.5, 1),
        ...(mRaw.t.lock === false ? { lock: false } : {}),
      };
    }
    if (mRaw.foot && typeof mRaw.foot === "object") out.foot = JSON.parse(JSON.stringify(mRaw.foot)) as Foot;
    if (Array.isArray(mRaw.prev)) {
      out.prev = mRaw.prev
        .map((p) => ({ file: String(p?.file ?? ""), base: p?.base == null ? null : String(p.base) }))
        .filter((p) => FILE_RE.test(p.file) && allowedBase(athleteId, p.base))
        .slice(-10);
    }
    meta[file] = out;
  }
  const d: Media360Draft = { frames, meta, updatedAt: new Date().toISOString() };
  if (raw.views !== undefined) d.views = raw.views;
  if (raw.hotspots !== undefined) d.hotspots = Array.isArray(raw.hotspots) ? raw.hotspots : [];
  if (raw.note) d.note = String(raw.note).slice(0, 120);
  return d;
}

/**
 * Admin only. Signed upload URLs for new frames in the PRIVATE draft bucket
 * (unique, never-reused names). Nothing sponsors see changes until publish.
 */
export async function issueDraftUploads(athleteId: string, fileNames: string[]): Promise<UploadSlot[]> {
  await requireEditor();
  if (!athleteId) throw new Error("athlete_required");
  if (fileNames.length < 1 || fileNames.length > SPONSOR_360_UPLOAD.maxFrames) throw new Error("count");
  const bucket = db().storage.from(PRIVATE_BUCKET);
  const base = supabaseUrl().replace(/\/$/, "");
  const slots: UploadSlot[] = [];
  for (const name of fileNames) {
    const file = `f_${randomUUID().replace(/-/g, "").slice(0, 12)}.${safeExt(name)}`;
    const path = `${athleteId}/${file}`;
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message || "sign_failed");
    slots.push({ file, path, uploadUrl: data.signedUrl.startsWith("http") ? data.signedUrl : base + data.signedUrl });
  }
  return slots;
}

/** Admin only. Short-lived read URLs for draft (private) files. */
export async function signDraftFiles(athleteId: string, files: string[]): Promise<Record<string, string>> {
  await requireEditor();
  const ok = files.filter((f) => FILE_RE.test(f));
  if (!ok.length) return {};
  const { data, error } = await db()
    .storage.from(PRIVATE_BUCKET)
    .createSignedUrls(ok.map((f) => `${athleteId}/${f}`), 60 * 60 * 6);
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  (data ?? []).forEach((r, i) => {
    if (r.signedUrl) out[ok[i]] = r.signedUrl;
  });
  return out;
}

/** Admin only. Saves the working draft (sponsors keep seeing the published set). */
export async function saveDraft(athleteId: string, draft: Media360Draft): Promise<{ ok: true; updatedAt: string }> {
  const s = await requireEditor();
  const d = cleanDraft(athleteId, draft);
  // Sides and zone markers of the draft are owned by the sides picker / zone
  // placer (saveDraftSides): keep what is stored, and let them follow a frame
  // the studio replaced ("Ganti foto": the old file is the new one's last prev).
  const { data: stored, error: sErr } = await db()
    .from("smb_athlete_media_360")
    .select("draft")
    .eq("athlete_id", athleteId)
    .maybeSingle<{ draft: Media360Draft | null }>();
  if (sErr) throw new Error(sErr.message);
  const keep = stored?.draft ?? null;
  if (keep && keep.views !== undefined) d.views = keep.views;
  if (keep && keep.hotspots !== undefined) d.hotspots = keep.hotspots;
  followReplacedFrames(d);
  const { error } = await db().rpc("smb_save_athlete_media_draft", {
    p_athlete_id: athleteId,
    p_draft: d,
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  return { ok: true, updatedAt: d.updatedAt! };
}

/**
 * Admin only. Saves the viewer sides and/or zone markers INTO THE DRAFT (never
 * live). Creates the draft from the live set when there is none. They go live
 * with Publish, together with the frames.
 */
export async function saveDraftSides(
  athleteId: string,
  change: { views?: Record<ViewKey, string>; hotspots?: SideHotspot[] },
): Promise<{ ok: true; updatedAt: string }> {
  const s = await requireEditor();
  if (!athleteId || (!change?.views && !change?.hotspots)) throw new Error("missing_input");
  const { data: row, error: rErr } = await db()
    .from("smb_athlete_media_360")
    .select("base_url,frames,frame_meta,views,hotspots,draft")
    .eq("athlete_id", athleteId)
    .maybeSingle<Pick<Row, "base_url" | "frames" | "frame_meta" | "views" | "hotspots" | "draft">>();
  if (rErr) throw new Error(rErr.message);
  if (!row) throw new Error("media_missing");
  const draft: Media360Draft = row.draft ?? draftFromLive({ baseUrl: row.base_url, frames: row.frames ?? [], frameMeta: row.frame_meta ?? {} });
  const files = draft.frames.map((f) => f.file);
  if (change.views) {
    const views: Record<string, string> = {};
    for (const k of VIEW_KEYS) {
      const f = change.views[k];
      if (typeof f !== "string" || !files.includes(f)) throw new Error("views_invalid");
      views[k] = f;
    }
    draft.views = views;
  }
  if (change.hotspots) {
    if (!Array.isArray(change.hotspots)) throw new Error("zones_invalid");
    draft.hotspots = change.hotspots
      .filter((h) => h && typeof h.athleteZoneId === "string" && h.athleteZoneId && h.points)
      .map((h) => ({
        athlete_zone_id: h.athleteZoneId,
        label: String(h.label ?? "").slice(0, 80),
        points: Object.fromEntries(
          Object.entries(h.points)
            .filter(([file]) => files.includes(file))
            .map(([file, v]) => [file, { x: Math.min(1, Math.max(0, Number(v.x))), y: Math.min(1, Math.max(0, Number(v.y))) }]),
        ),
      }))
      .filter((h) => Object.keys(h.points).length > 0);
  }
  // Changing only the sides leaves draft.hotspots unset: the markers keep
  // following the live frames (by origin) until the placer saves its own.
  const d = cleanDraft(athleteId, draft);
  const { error } = await db().rpc("smb_save_athlete_media_draft", {
    p_athlete_id: athleteId,
    p_draft: d,
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/atlet/${athleteId}`);
  return { ok: true, updatedAt: d.updatedAt! };
}

async function clearPrivateFolder(athleteId: string) {
  const bucket = db().storage.from(PRIVATE_BUCKET);
  const { data } = await bucket.list(athleteId, { limit: 1000 });
  if (data && data.length) await bucket.remove(data.map((f) => `${athleteId}/${f.name}`));
}

/** Admin only. Throws the draft away (and its unpublished uploads). */
export async function discardDraft(athleteId: string): Promise<{ ok: true }> {
  const s = await requireEditor();
  const { error } = await db().rpc("smb_save_athlete_media_draft", {
    p_athlete_id: athleteId,
    p_draft: null,
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  await clearPrivateFolder(athleteId);
  revalidatePath(`/admin/atlet/${athleteId}`);
  return { ok: true };
}

const MIME: Record<string, string> = { png: "image/png", webp: "image/webp", jpg: "image/jpeg" };

/** Bytes of a frame from wherever the draft says it lives. */
async function readFrame(athleteId: string, f: { file: string; base: string | null }): Promise<Blob> {
  if (f.base === null) {
    const { data, error } = await db().storage.from(PRIVATE_BUCKET).download(`${athleteId}/${f.file}`);
    if (error || !data) throw new Error(`Frame draft ${f.file} tidak ditemukan.`);
    return data;
  }
  if (f.base.startsWith("/")) {
    // A set bundled with the app (public/media/...): read it from disk.
    const p = path.join(process.cwd(), "public", f.base, f.file);
    const buf = await readFile(p);
    return new Blob([buf], { type: MIME[safeExt(f.file)] });
  }
  const r = await fetch(`${f.base}/${f.file}`);
  if (!r.ok) throw new Error(`Frame ${f.file} tidak bisa diambil (HTTP ${r.status}).`);
  return await r.blob();
}

type Row = {
  base_url: string;
  frames: string[];
  frame_meta: FrameMetaMap | null;
  views: Record<string, string> | null;
  hotspots: { athlete_zone_id: string; label?: string; points: Record<string, { x: number; y: number }> }[];
  draft: Media360Draft | null;
  version: number;
};

/**
 * Admin only. Publishes the draft: copies every frame into the athlete's
 * public folder (new unique names, so no cache ever serves an old photo),
 * carries zone markers + sides over to the new frame order, snapshots the
 * previous version (restorable) and switches the viewer atomically.
 */
export async function publishDraft(athleteId: string): Promise<{ ok: true; version: number }> {
  const s = await requireEditor();
  const { data: row, error: rErr } = await db()
    .from("smb_athlete_media_360")
    .select("base_url,frames,frame_meta,views,hotspots,draft,version")
    .eq("athlete_id", athleteId)
    .maybeSingle<Row>();
  if (rErr) throw new Error(rErr.message);
  if (!row?.draft) throw new Error("Tidak ada perubahan untuk dipublish.");
  const draft = cleanDraft(athleteId, row.draft);
  const n = draft.frames.length;
  if (n < SPONSOR_360_UPLOAD.minFrames || n > SPONSOR_360_UPLOAD.maxFrames) {
    throw new Error(`Jumlah frame harus ${SPONSOR_360_UPLOAD.minFrames}–${SPONSOR_360_UPLOAD.maxFrames}.`);
  }

  // 1. Every frame into the public folder.
  const target = publicBase(athleteId);
  const pub = db().storage.from(PUBLIC_BUCKET);
  const { data: existing } = await pub.list(athleteId, { limit: 1000 });
  const have = new Set((existing ?? []).map((f) => f.name));
  for (const f of draft.frames) {
    if (have.has(f.file)) continue; // already in the public folder (names are never reused)
    const body = await readFrame(athleteId, f);
    const { error } = await pub.upload(`${athleteId}/${f.file}`, body, {
      contentType: MIME[safeExt(f.file)],
      cacheControl: "31536000",
      upsert: false,
    });
    if (error && !/exists/i.test(error.message)) throw new Error(`Gagal menyalin ${f.file}: ${error.message}`);
    have.add(f.file);
  }
  const frames = draft.frames.map((f) => f.file);

  // 2. Per-frame metadata; backups that were never published are dropped,
  //    published ones now all live in this folder or their original folder.
  const frameMeta: FrameMetaMap = {};
  for (const file of frames) {
    const m = draft.meta[file];
    if (!m) continue;
    const prev = (m.prev ?? []).filter((p) => p.base !== null);
    frameMeta[file] = { ...(m.t ? { t: m.t } : {}), ...(m.foot ? { foot: m.foot } : {}), ...(prev.length ? { prev } : {}) };
  }

  // 3. Sides + zone markers follow each slot's origin.
  const live = row.frames ?? [];
  const newIndexOfLive = new Map<string, number>();
  draft.frames.forEach((f, j) => {
    if (f.origin && !newIndexOfLive.has(f.origin)) newIndexOfLive.set(f.origin, j);
  });
  let views: Record<string, string> | null;
  if (draft.views !== undefined) {
    // A side set in the draft must point at a frame of the draft: never drop
    // the sides silently (e.g. after its frame was deleted), ask to re-pick.
    if (draft.views && !VIEW_KEYS.every((k) => frames.includes(draft.views![k]))) throw new Error("views_invalid");
    views = draft.views ?? null;
  } else if (row.views) {
    const mapped: Record<string, string> = {};
    for (const k of VIEW_KEYS) {
      const j = newIndexOfLive.get(row.views[k]);
      if (j != null) mapped[k] = frames[j];
    }
    views = VIEW_KEYS.every((k) => mapped[k]) ? mapped : null;
  } else views = null;

  let hotspots: Row["hotspots"];
  if (draft.hotspots !== undefined) {
    // Draft markers are keyed by frame file (legacy drafts: frame numbers).
    hotspots = hotspotsToFrameNumbers(draft.hotspots, frames);
  } else {
    hotspots = (row.hotspots ?? []).map((h) => {
      const points: Record<string, { x: number; y: number }> = {};
      for (const [k, v] of Object.entries(h.points ?? {})) {
        const j = newIndexOfLive.get(live[Number(k) - 1]);
        if (j != null) points[String(j + 1)] = v;
      }
      return { athlete_zone_id: h.athlete_zone_id, label: h.label ?? "", points };
    });
  }
  hotspots = hotspots.filter((h) => Object.keys(h.points ?? {}).length > 0);

  const { data: out, error } = await db().rpc("smb_publish_athlete_media_360", {
    p_athlete_id: athleteId,
    p_base_url: target,
    p_frames: frames,
    p_frame_meta: frameMeta,
    p_views: views,
    p_hotspots: hotspots,
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  await clearPrivateFolder(athleteId).catch(() => {});
  revalidateAthlete(athleteId);
  return { ok: true, version: (out as { version?: number } | null)?.version ?? row.version + 1 };
}

/** Admin only. Loads a previously published version as the draft (publish to go live). */
export async function restoreVersion(athleteId: string, version: number): Promise<{ ok: true }> {
  const s = await requireEditor();
  const { data, error } = await db()
    .from("smb_athlete_media_360_history")
    .select("snapshot")
    .eq("athlete_id", athleteId)
    .eq("version", version)
    .maybeSingle<{ snapshot: { base_url: string; frames: string[]; frame_meta?: FrameMetaMap; views: Record<string, string> | null; hotspots: unknown[] } }>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Versi tidak ditemukan.");
  const snap = data.snapshot;
  const draft: Media360Draft = {
    frames: snap.frames.map((file) => ({ file, base: snap.base_url, origin: null })),
    meta: snap.frame_meta ?? {},
    views: snap.views,
    // Markers of the snapshot keyed by file, so later reordering keeps them on their photo.
    hotspots: draftHotspotsByFile(snap.hotspots ?? [], snap.frames).map((h) => ({
      athlete_zone_id: h.athleteZoneId,
      label: h.label,
      points: h.points,
    })),
    note: `v${version}`,
  };
  const d = cleanDraft(athleteId, draft);
  const { error: e2 } = await db().rpc("smb_save_athlete_media_draft", {
    p_athlete_id: athleteId,
    p_draft: d,
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (e2) throw new Error(e2.message);
  revalidatePath(`/admin/atlet/${athleteId}`);
  return { ok: true };
}
