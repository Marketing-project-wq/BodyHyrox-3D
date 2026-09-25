"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import {
  requireSession,
  requirePermission,
  clearSessionCookie,
} from "@/lib/auth";

function refreshAll() {
  revalidatePath("/admin");
  revalidatePath("/admin/atlet");
  revalidatePath("/admin/brand");
  revalidatePath("/admin/transaksi");
  revalidatePath("/admin/event");
  revalidatePath("/admin/harga-zona");
  revalidatePath("/admin/pengaturan");
  revalidatePath("/admin/pengajuan");
}

/** Also refresh a single athlete's admin editor and the public-facing pages. */
function refreshAthlete(id: string) {
  refreshAll();
  revalidatePath(`/admin/atlet/${id}`);
  revalidatePath("/atlet");
  revalidatePath(`/atlet/${id}`);
}

export async function logout() {
  clearSessionCookie();
  redirect("/login");
}

export async function refundTransaction(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "transaction.refund");
  const id = String(formData.get("id"));
  const { error } = await db().rpc("smb_refund_transaction", {
    p_txn_id: id,
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function createTransaction(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "transaction.create");
  const { error } = await db().rpc("smb_create_transaction", {
    p_brand_id: String(formData.get("brand_id")),
    p_athlete_id: String(formData.get("athlete_id")),
    p_zone_id: String(formData.get("zone_id")),
    p_amount: Number(formData.get("amount")),
    p_status: String(formData.get("status")),
    p_txn_date: String(formData.get("txn_date")),
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function setAthleteStatus(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "athlete.toggle");
  const { error } = await db().rpc("smb_set_athlete_status", {
    p_athlete_id: String(formData.get("id")),
    p_status: String(formData.get("status")),
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function createAthlete(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "athlete.edit");
  let handle = String(formData.get("handle") || "").trim();
  if (handle && !handle.startsWith("@")) handle = "@" + handle;
  const { error } = await db().rpc("smb_create_athlete", {
    p_nama: String(formData.get("nama")),
    p_handle: handle,
    p_kota: String(formData.get("kota")),
    p_status: String(formData.get("status") || "active"),
    p_gender: String(formData.get("gender") || "male"),
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function updateAthlete(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "athlete.edit");
  const id = String(formData.get("id"));
  let handle = String(formData.get("handle") || "").trim();
  if (handle && !handle.startsWith("@")) handle = "@" + handle;
  const rankRaw = String(formData.get("rank") || "").trim();
  const { error } = await db().rpc("smb_update_athlete", {
    p_id: id,
    p_nama: String(formData.get("nama")),
    p_handle: handle,
    p_kota: String(formData.get("kota")),
    p_gender: String(formData.get("gender") || "male"),
    p_discipline: String(formData.get("discipline") || ""),
    p_rank: rankRaw === "" ? null : Number(rankRaw),
    p_photo_url: String(formData.get("photo_url") || ""),
    p_podium_count: Number(formData.get("podium_count") || 0),
    p_frames_per_season: Number(formData.get("frames_per_season") || 0),
    p_status: String(formData.get("status") || "active"),
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAthlete(id);
  // Stay on the editor and show a clear "saved" confirmation (instead of silently
  // re-rendering, which looked like nothing happened).
  redirect(`/admin/atlet/${id}?saved=1`);
}

export async function upsertAthleteZone(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "zone.pricing");
  const athleteId = String(formData.get("athlete_id"));
  const { error } = await db().rpc("smb_upsert_athlete_zone", {
    p_athlete_id: athleteId,
    p_zone_id: String(formData.get("zone_id")),
    p_active: formData.get("active") === "on",
    p_exclusive: formData.get("exclusive") === "on",
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAthlete(athleteId);
}

/** Set a per-athlete price override for one zone. */
export async function setAthleteZonePrice(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "zone.pricing");
  const athleteId = String(formData.get("athlete_id"));
  const priceRaw = String(formData.get("price") || "").trim();
  const { error } = await db().rpc("smb_set_athlete_zone_price", {
    p_athlete_id: athleteId,
    p_zone_id: String(formData.get("zone_id")),
    p_price: priceRaw === "" ? null : Number(priceRaw),
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAthlete(athleteId);
}

/** Clear a zone's override so it follows the template (base) price again. */
export async function resetAthleteZonePrice(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "zone.pricing");
  const athleteId = String(formData.get("athlete_id"));
  const { error } = await db().rpc("smb_set_athlete_zone_price", {
    p_athlete_id: athleteId,
    p_zone_id: String(formData.get("zone_id")),
    p_price: null,
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAthlete(athleteId);
}

export async function addAthleteRace(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "athlete.edit");
  const athleteId = String(formData.get("athlete_id"));
  const placementRaw = String(formData.get("placement") || "").trim();
  const { error } = await db().rpc("smb_add_athlete_race", {
    p_athlete_id: athleteId,
    p_event_id: String(formData.get("event_id")),
    p_placement: placementRaw === "" ? null : Number(placementRaw),
    p_is_podium: formData.get("is_podium") === "on",
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAthlete(athleteId);
}

export async function deleteAthleteRace(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "athlete.edit");
  const athleteId = String(formData.get("athlete_id"));
  const { error } = await db().rpc("smb_delete_athlete_race", {
    p_race_id: String(formData.get("id")),
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAthlete(athleteId);
}

export async function setBrandStatus(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "brand.toggle");
  const { error } = await db().rpc("smb_set_brand_status", {
    p_brand_id: String(formData.get("id")),
    p_status: String(formData.get("status")),
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function createBrand(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "brand.edit");
  const { error } = await db().rpc("smb_create_brand", {
    p_nama: String(formData.get("nama")),
    p_kategori: String(formData.get("kategori")),
    p_status: String(formData.get("status") || "active"),
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function updateZonePrice(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "zone.pricing");
  const { error } = await db().rpc("smb_update_zone_price", {
    p_zone_id: String(formData.get("id")),
    p_new_price: Number(formData.get("base_price")),
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function setZoneActive(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "zone.pricing");
  const { error } = await db().rpc("smb_set_zone_active", {
    p_zone_id: String(formData.get("id")),
    p_active: String(formData.get("active")) === "true",
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function createEvent(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "event.manage");
  const { error } = await db().rpc("smb_create_event", {
    p_nama: String(formData.get("nama")),
    p_venue: String(formData.get("venue")),
    p_event_date: String(formData.get("event_date")),
    p_registration_open: String(formData.get("registration_open") || "true") === "true",
    p_registered: Number(formData.get("registered") || 0),
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function updateSettings(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "settings.manage");
  const { error } = await db().rpc("smb_update_settings", {
    p_nama: String(formData.get("nama")),
    p_currency: String(formData.get("currency")),
    p_timezone: String(formData.get("timezone")),
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAll();
}

export async function reviewRequest(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "request.review");
  const { data, error } = await db().rpc("smb_review_request", {
    p_request_id: String(formData.get("id")),
    p_action: String(formData.get("action")),
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(String(data?.error || "review_failed"));
  refreshAll();
}

export async function updateNotifications(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "settings.manage");
  const { error } = await db().rpc("smb_update_notifications", {
    p_new_transaction: formData.get("new_transaction") === "on",
    p_pending_payment: formData.get("pending_payment") === "on",
    p_weekly_summary: formData.get("weekly_summary") === "on",
    p_new_athlete_submission: formData.get("new_athlete_submission") === "on",
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (error) throw new Error(error.message);
  refreshAll();
}
