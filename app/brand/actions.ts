"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import {
  verifyPassword,
  hashPassword,
  createBrandToken,
  setBrandSessionCookie,
  clearBrandSessionCookie,
  getBrandSession,
} from "@/lib/brand-auth";

function safeNext(v: unknown): string {
  const s = String(v || "");
  // only allow internal paths
  return s.startsWith("/") && !s.startsWith("//") ? s : "/atlet";
}

export async function brandLogin(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = safeNext(formData.get("next"));
  const { data } = await db().rpc("smb_brand_by_email", { p_email: email });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.status !== "active" || !verifyPassword(password, row.password_hash)) {
    redirect(`/brand/masuk?error=1&next=${encodeURIComponent(next)}`);
  }
  setBrandSessionCookie(createBrandToken({ sub: row.id, email: row.email, company: row.company }));
  redirect(next);
}

export async function brandRegister(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const company = String(formData.get("company") || "").trim();
  const next = safeNext(formData.get("next"));
  if (!email || !password || !company || password.length < 6) {
    redirect(`/brand/daftar?error=missing&next=${encodeURIComponent(next)}`);
  }
  const { data } = await db().rpc("smb_brand_register", {
    p_email: email,
    p_password_hash: hashPassword(password),
    p_company: company,
  });
  if (!data?.ok) {
    redirect(`/brand/daftar?error=${data?.error || "failed"}&next=${encodeURIComponent(next)}`);
  }
  setBrandSessionCookie(createBrandToken({ sub: data.id, email, company }));
  redirect(next);
}

export async function brandLogout() {
  clearBrandSessionCookie();
  redirect("/atlet");
}

export async function submitSponsorRequest(formData: FormData) {
  const athleteId = String(formData.get("athlete_id") || "");
  const azId = String(formData.get("athlete_zone_id") || "");
  const eventId = String(formData.get("event_id") || "");
  const note = String(formData.get("note") || "");
  const dest = `/atlet/${athleteId}/ajukan?zone=${azId}`;
  const s = getBrandSession();
  if (!s) redirect(`/brand/masuk?next=${encodeURIComponent(dest)}`);
  if (!eventId) redirect(`${dest}&error=event_not_found`);
  const { data } = await db().rpc("smb_submit_sponsor_request", {
    p_brand_user_id: s.sub,
    p_athlete_zone_id: azId,
    p_event_id: eventId,
    p_note: note,
  });
  if (!data?.ok) redirect(`${dest}&error=${data?.error || "failed"}`);
  redirect(`${dest}&ok=1`);
}
