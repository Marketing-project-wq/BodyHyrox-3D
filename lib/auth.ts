import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, Permission } from "./config";
import { can } from "./config";

const SECRET = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
const COOKIE = "smb_session";
const MAX_AGE = 60 * 60 * 8; // 8 hours

export type Session = {
  sub: string;
  username: string;
  nama: string;
  role: Role;
  exp: number;
};

/** Verify a scrypt password hash of the form "scrypt$<saltHex>$<hashHex>". */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  let actual: Buffer;
  try {
    actual = crypto.scryptSync(password, salt, expected.length);
  } catch {
    return false;
  }
  return (
    actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  );
}

function sign(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

/** Create a signed, expiring session token (HMAC-SHA256). */
export function createToken(payload: Omit<Session, "exp">): string {
  const body: Session = { ...payload, exp: Math.floor(Date.now() / 1000) + MAX_AGE };
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifyToken(token: string | undefined): Session | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = sign(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, "base64url").toString()) as Session;
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  return verifyToken(cookies().get(COOKIE)?.value);
}

export function setSessionCookie(token: string): void {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie(): void {
  cookies().delete(COOKIE);
}

/** Redirects to /login if there is no valid session. */
export function requireSession(): Session {
  const s = getSession();
  if (!s) redirect("/login");
  return s;
}

/** Throws if the session lacks a permission (server-side enforcement for actions). */
export function requirePermission(session: Session, perm: Permission): void {
  if (!can(session.role, perm)) {
    throw new Error("Anda tidak memiliki izin untuk aksi ini.");
  }
}
