"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import {
  verifyPassword,
  hashPassword,
  createBrandToken,
  setBrandSessionCookie,
  clearBrandSessionCookie,
  getBrandSession,
  randomToken,
  hashToken,
  TOKEN_TTL,
} from "@/lib/brand-auth";
import { sendVerificationEmail, sendPasswordResetEmail, emailConfigured } from "@/lib/email";
import { rateLimit } from "@/lib/ratelimit";

function safeNext(v: unknown): string {
  const s = String(v || "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/atlet";
}
function safeBack(v: unknown, fallback: string): string {
  const s = String(v || "");
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
}

// ---------------------------------------------------------------- auth

export async function brandLogin(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = safeNext(formData.get("next"));

  if (!rateLimit(`login:${email}`, 8, 10 * 60 * 1000)) {
    redirect(`/brand/masuk?error=rate&next=${encodeURIComponent(next)}`);
  }

  const { data } = await db().rpc("smb_brand_by_email", { p_email: email });
  const row = Array.isArray(data) ? data[0] : null;
  // Generic failure for wrong credentials AND inactive/unknown (avoid enumeration).
  if (!row || row.status !== "active" || !verifyPassword(password, row.password_hash)) {
    redirect(`/brand/masuk?error=1&next=${encodeURIComponent(next)}`);
  }
  if (!row.email_verified) {
    redirect(`/brand/masuk?error=unverified&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }
  setBrandSessionCookie(createBrandToken({ sub: row.id, email: row.email, company: row.company }));
  if (row.must_change_password) redirect(`/brand/akun?change=1`);
  redirect(next);
}

export async function brandRegister(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const company = String(formData.get("company") || "").trim();
  const namaPic = String(formData.get("nama_pic") || "").trim();
  const noHp = String(formData.get("no_hp") || "").trim();
  const kategori = String(formData.get("kategori") || "").trim();
  const next = safeNext(formData.get("next"));

  if (!email || !password || !company || password.length < 6) {
    redirect(`/brand/daftar?error=missing&next=${encodeURIComponent(next)}`);
  }

  const raw = randomToken();
  const expires = new Date(Date.now() + TOKEN_TTL.verify).toISOString();
  const { data } = await db().rpc("smb_brand_register", {
    p_email: email,
    p_password_hash: hashPassword(password),
    p_company: company,
    p_nama_pic: namaPic || null,
    p_no_hp: noHp || null,
    p_kategori: kategori || null,
    p_verify_token_hash: hashToken(raw),
    p_verify_expires: expires,
  });
  if (!data?.ok) {
    redirect(`/brand/daftar?error=${data?.error || "failed"}&next=${encodeURIComponent(next)}`);
  }

  // Verification is REQUIRED before login. Send the email if configured; otherwise
  // the account waits for admin verification.
  if (emailConfigured()) {
    await sendVerificationEmail(email, company, raw);
    redirect(`/brand/verifikasi?sent=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }
  redirect(`/brand/verifikasi?pending=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
}

export async function brandLogout() {
  clearBrandSessionCookie();
  redirect("/atlet");
}

export async function resendVerification(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const next = safeNext(formData.get("next"));
  if (email && rateLimit(`verify:${email}`, 4, 15 * 60 * 1000)) {
    const raw = randomToken();
    const expires = new Date(Date.now() + TOKEN_TTL.verify).toISOString();
    const { data } = await db().rpc("smb_brand_issue_verify", {
      p_email: email,
      p_token_hash: hashToken(raw),
      p_expires: expires,
    });
    if (data?.found && emailConfigured()) {
      await sendVerificationEmail(email, String(data.company || email), raw);
    }
  }
  redirect(`/brand/verifikasi?sent=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
}

// ---------------------------------------------------------------- password reset

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (email && rateLimit(`reset:${email}`, 4, 15 * 60 * 1000)) {
    const raw = randomToken();
    const expires = new Date(Date.now() + TOKEN_TTL.reset).toISOString();
    const { data } = await db().rpc("smb_brand_request_reset", {
      p_email: email,
      p_token_hash: hashToken(raw),
      p_expires: expires,
    });
    if (data?.found && emailConfigured()) {
      await sendPasswordResetEmail(email, String(data.company || email), raw);
    }
  }
  // Always generic (anti-enumeration).
  redirect(`/brand/lupa-password?sent=1`);
}

export async function consumePasswordReset(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  if (!token || password.length < 6) {
    redirect(`/brand/reset?token=${encodeURIComponent(token)}&error=missing`);
  }
  const { data } = await db().rpc("smb_brand_consume_reset", {
    p_token_hash: hashToken(token),
    p_new_password_hash: hashPassword(password),
  });
  if (!data?.ok) redirect(`/brand/reset?token=${encodeURIComponent(token)}&error=${data?.error || "invalid"}`);
  redirect(`/brand/masuk?reset=1`);
}

export async function changePassword(formData: FormData) {
  const s = getBrandSession();
  if (!s) redirect("/brand/masuk");
  const current = String(formData.get("current") || "");
  const next = String(formData.get("new") || "");
  if (next.length < 6) redirect(`/brand/akun?error=weak`);
  const { data } = await db().rpc("smb_brand_by_email", { p_email: s.email });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || !verifyPassword(current, row.password_hash)) redirect(`/brand/akun?error=wrong_current`);
  const { data: res } = await db().rpc("smb_brand_set_password", {
    p_brand_user_id: s.sub,
    p_new_password_hash: hashPassword(next),
  });
  if (!res?.ok) redirect(`/brand/akun?error=failed`);
  redirect(`/brand/akun?changed=1`);
}

// ---------------------------------------------------------------- cart

export async function cartAdd(formData: FormData) {
  const azId = String(formData.get("athlete_zone_id") || "");
  const athleteId = String(formData.get("athlete_id") || "");
  const note = String(formData.get("note") || "");
  const back = safeBack(formData.get("back"), athleteId ? `/atlet/${athleteId}` : "/atlet");
  const s = getBrandSession();
  if (!s) redirect(`/brand/masuk?next=${encodeURIComponent(back)}`);
  const { data } = await db().rpc("smb_cart_add", {
    p_brand_user_id: s.sub,
    p_athlete_zone_id: azId,
    p_note: note || null,
  });
  revalidatePath("/brand/keranjang");
  if (!data?.ok) redirect(`${back}?cart=${data?.error || "failed"}#zona-sponsor`);
  redirect(`${back}?cart=added#zona-sponsor`);
}

export async function cartUpdateNote(formData: FormData) {
  const s = getBrandSession();
  if (!s) redirect("/brand/masuk");
  await db().rpc("smb_cart_update", {
    p_brand_user_id: s.sub,
    p_item_id: String(formData.get("item_id") || ""),
    p_note: String(formData.get("note") || "") || null,
  });
  revalidatePath("/brand/keranjang");
  redirect("/brand/keranjang");
}

export async function cartRemove(formData: FormData) {
  const s = getBrandSession();
  if (!s) redirect("/brand/masuk");
  await db().rpc("smb_cart_remove", {
    p_brand_user_id: s.sub,
    p_item_id: String(formData.get("item_id") || ""),
  });
  revalidatePath("/brand/keranjang");
  redirect("/brand/keranjang");
}

export async function cartCheckout(formData: FormData) {
  const s = getBrandSession();
  if (!s) redirect("/brand/masuk");
  const eventId = String(formData.get("event_id") || "");
  if (!eventId) redirect(`/brand/keranjang?error=event_not_found`);
  const { data } = await db().rpc("smb_cart_checkout", {
    p_brand_user_id: s.sub,
    p_event_id: eventId,
  });
  if (!data?.ok) redirect(`/brand/keranjang?error=${data?.error || "failed"}`);
  revalidatePath("/brand/keranjang");
  revalidatePath("/brand/dashboard");
  const created = Number(data.created || 0);
  const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
  redirect(`/brand/dashboard?checkout=1&created=${created}&skipped=${skipped}`);
}
