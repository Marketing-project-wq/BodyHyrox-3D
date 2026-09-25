"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { requireSession, requirePermission } from "@/lib/auth";
import { hashPassword } from "@/lib/brand-auth";

function refresh() {
  revalidatePath("/admin/akun-sponsor");
}

export async function createSponsorAccount(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "sponsor_account.manage");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const company = String(formData.get("company") || "").trim();
  const kategori = String(formData.get("kategori") || "").trim();
  const namaPic = String(formData.get("nama_pic") || "").trim();
  const noHp = String(formData.get("no_hp") || "").trim();
  const password = String(formData.get("password") || "");
  const mustChange = formData.get("must_change") === "on";
  if (!email || !company || password.length < 6) {
    redirect("/admin/akun-sponsor?error=missing");
  }
  const { data } = await db().rpc("smb_admin_create_brand_user", {
    p_email: email,
    p_password_hash: hashPassword(password),
    p_company: company,
    p_kategori: kategori || null,
    p_nama_pic: namaPic || null,
    p_no_hp: noHp || null,
    p_must_change: mustChange,
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (!data?.ok) redirect(`/admin/akun-sponsor?error=${data?.error || "failed"}`);
  refresh();
  redirect("/admin/akun-sponsor?created=1");
}

export async function resetSponsorPassword(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "sponsor_account.manage");
  const id = String(formData.get("brand_user_id") || "");
  const password = String(formData.get("password") || "");
  const mustChange = formData.get("must_change") === "on";
  if (!id || password.length < 6) redirect("/admin/akun-sponsor?error=missing");
  const { data } = await db().rpc("smb_admin_reset_brand_password", {
    p_brand_user_id: id,
    p_new_password_hash: hashPassword(password),
    p_must_change: mustChange,
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (!data?.ok) redirect(`/admin/akun-sponsor?error=${data?.error || "failed"}`);
  refresh();
  redirect("/admin/akun-sponsor?reset=1");
}

export async function setSponsorStatus(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "sponsor_account.manage");
  const id = String(formData.get("brand_user_id") || "");
  const status = String(formData.get("status") || "");
  const { data } = await db().rpc("smb_admin_set_brand_status", {
    p_brand_user_id: id,
    p_status: status,
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (!data?.ok) redirect(`/admin/akun-sponsor?error=${data?.error || "failed"}`);
  refresh();
  redirect("/admin/akun-sponsor");
}

export async function verifySponsorEmail(formData: FormData) {
  const s = requireSession();
  requirePermission(s, "sponsor_account.manage");
  const id = String(formData.get("brand_user_id") || "");
  const { data } = await db().rpc("smb_admin_verify_brand_email", {
    p_brand_user_id: id,
    p_actor_id: s.sub,
    p_actor_name: s.nama,
  });
  if (!data?.ok) redirect(`/admin/akun-sponsor?error=${data?.error || "failed"}`);
  refresh();
  redirect("/admin/akun-sponsor");
}
