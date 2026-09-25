"use server";

import { revalidatePath } from "next/cache";
import { db, supabaseUrl } from "@/lib/supabase";
import { requireSession, requirePermission } from "@/lib/auth";
import { SPONSOR_360_UPLOAD } from "@/lib/config";

type UploadSlot = { frame: string; path: string; uploadUrl: string };

function safeExt(name: string): string {
  const e = (name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (e === "jpeg") return "jpg";
  return ["jpg", "png", "webp"].includes(e) ? e : "jpg";
}

/**
 * Admin only. Clears the athlete's old 360 frames from Storage and returns a
 * short-lived signed upload URL per new frame. The service key never leaves the
 * server; the browser PUTs each file straight to Storage with these URLs.
 */
export async function issueUpload(
  athleteId: string,
  fileNames: string[],
): Promise<UploadSlot[]> {
  const s = requireSession();
  requirePermission(s, "athlete.edit");
  if (!athleteId) throw new Error("athlete_required");
  const count = fileNames.length;
  if (count < SPONSOR_360_UPLOAD.minFrames || count > SPONSOR_360_UPLOAD.maxFrames) {
    throw new Error(`Jumlah frame harus ${SPONSOR_360_UPLOAD.minFrames}–${SPONSOR_360_UPLOAD.maxFrames}.`);
  }
  const bucket = db().storage.from(SPONSOR_360_UPLOAD.bucket);

  // Remove any previous frames for this athlete so the set is clean.
  const { data: existing } = await bucket.list(athleteId);
  if (existing && existing.length) {
    await bucket.remove(existing.map((f) => `${athleteId}/${f.name}`));
  }

  const base = supabaseUrl().replace(/\/$/, "");
  const slots: UploadSlot[] = [];
  for (let i = 0; i < count; i++) {
    const frame = `frame_${String(i).padStart(2, "0")}.${safeExt(fileNames[i] || "jpg")}`;
    const path = `${athleteId}/${frame}`;
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message || "sign_failed");
    const uploadUrl = data.signedUrl.startsWith("http") ? data.signedUrl : base + data.signedUrl;
    slots.push({ frame, path, uploadUrl });
  }
  return slots;
}

/** Admin only. Points the athlete's 360 viewer at the freshly uploaded frames. */
export async function finalizeMedia(
  athleteId: string,
  frames: string[],
  autospin: boolean,
  crossfade: boolean,
): Promise<{ ok: true }> {
  const s = requireSession();
  requirePermission(s, "athlete.edit");
  if (!athleteId || frames.length === 0) throw new Error("missing");
  const base = `${supabaseUrl().replace(/\/$/, "")}/storage/v1/object/public/${SPONSOR_360_UPLOAD.bucket}/${athleteId}`;
  const { error } = await db().rpc("smb_set_athlete_media_360", {
    p_athlete_id: athleteId,
    p_base_url: base,
    p_frames: frames,
    p_autospin: autospin,
    p_crossfade: crossfade,
    p_hotspots: [],
    p_is_placeholder: false,
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/atlet/${athleteId}`);
  revalidatePath(`/admin/atlet/${athleteId}`);
  return { ok: true };
}
