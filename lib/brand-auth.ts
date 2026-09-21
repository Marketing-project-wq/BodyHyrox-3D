import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Separate signing secret + cookie from the admin session so brand and admin
// auth never overlap. Reuses the same HMAC/scrypt primitives as lib/auth.ts.
const SECRET =
  process.env.SESSION_SECRET
    ? crypto.createHash("sha256").update("smb-brand:" + process.env.SESSION_SECRET).digest("hex")
    : process.env.SUPABASE_SERVICE_ROLE_KEY
      ? crypto.createHash("sha256").update("smb-brand:" + process.env.SUPABASE_SERVICE_ROLE_KEY).digest("hex")
      : "dev-insecure-brand-secret-change-me";
const COOKIE = "smb_brand_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type BrandSession = { sub: string; email: string; company: string; exp: number };

/** scrypt hash "scrypt$<saltHex>$<hashHex>" for new brand accounts. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

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
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function sign(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createBrandToken(payload: Omit<BrandSession, "exp">): string {
  const body: BrandSession = { ...payload, exp: Math.floor(Date.now() / 1000) + MAX_AGE };
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifyBrandToken(token: string | undefined): BrandSession | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(data));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, "base64url").toString()) as BrandSession;
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export function getBrandSession(): BrandSession | null {
  return verifyBrandToken(cookies().get(COOKIE)?.value);
}

export function setBrandSessionCookie(token: string): void {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearBrandSessionCookie(): void {
  cookies().delete(COOKIE);
}

/** Redirects to the brand login (preserving where to return) if not signed in. */
export function requireBrandSession(next?: string): BrandSession {
  const s = getBrandSession();
  if (!s) redirect("/brand/masuk" + (next ? `?next=${encodeURIComponent(next)}` : ""));
  return s;
}
