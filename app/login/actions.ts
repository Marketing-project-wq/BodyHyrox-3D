"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import type { Role } from "@/lib/config";
import { verifyPassword, createToken, setSessionCookie } from "@/lib/auth";

export async function login(formData: FormData) {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  const { data, error } = await db()
    .from("smb_admin_users")
    .select("id,username,password_hash,nama,role")
    .eq("username", username)
    .maybeSingle();

  if (error || !data || !verifyPassword(password, data.password_hash as string)) {
    redirect("/login?error=1");
  }

  const token = createToken({
    sub: data!.id as string,
    username: data!.username as string,
    nama: data!.nama as string,
    role: data!.role as Role,
  });
  setSessionCookie(token);
  redirect("/admin");
}
