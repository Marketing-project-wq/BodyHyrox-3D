/**
 * Transactional email via Resend (server-only).
 *
 * Email is OPTIONAL: if RESEND_API_KEY / EMAIL_FROM are not set, `emailConfigured()`
 * is false and callers fall back to the admin-driven flow (admin verifies accounts
 * and resets passwords from the panel). When the env is present, verification and
 * password-reset links are sent automatically. Email bodies are in English; the
 * app UI is in Indonesian. No Reply-To — every message says "do not reply".
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

/** Absolute site origin used to build links in emails (no trailing slash). */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "https://avatar.20fit.id";
  return raw.replace(/\/$/, "");
}

type SendResult = { ok: boolean; skipped?: boolean; error?: string };

async function send(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  if (!emailConfigured()) return { ok: false, skipped: true };
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html, text }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `resend_${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send_failed" };
  }
}

const FOOTER_HTML =
  `<p style="margin-top:24px;color:#8a8a90;font-size:12px;line-height:1.6">` +
  `This is an automated message from 20FIT — please do not reply to this email.</p>`;
const FOOTER_TEXT = "\n\nThis is an automated message from 20FIT — please do not reply to this email.";

function shell(title: string, bodyHtml: string): string {
  return (
    `<div style="background:#0b0b0d;padding:32px 0;font-family:Arial,Helvetica,sans-serif">` +
    `<div style="max-width:480px;margin:0 auto;background:#141018;border:1px solid #2a2530;` +
    `border-radius:16px;padding:28px 28px 24px;color:#f3f3f4">` +
    `<div style="font-weight:800;letter-spacing:1px;color:#ff3b57;font-size:18px">20FIT</div>` +
    `<h1 style="font-size:20px;margin:14px 0 8px;color:#fff">${title}</h1>` +
    bodyHtml +
    FOOTER_HTML +
    `</div></div>`
  );
}

function button(href: string, label: string): string {
  return (
    `<a href="${href}" style="display:inline-block;margin:18px 0;padding:12px 22px;` +
    `background:#ff3b57;color:#fff;text-decoration:none;border-radius:9999px;` +
    `font-weight:600;font-size:14px">${label}</a>`
  );
}

/** Verify-email link for a self sign-up. */
export function sendVerificationEmail(to: string, company: string, token: string): Promise<SendResult> {
  const link = `${siteUrl()}/brand/verifikasi?token=${encodeURIComponent(token)}`;
  const html = shell(
    "Confirm your email",
    `<p style="color:#c9c9cf;font-size:14px;line-height:1.7">Hi ${escapeHtml(company)},</p>` +
      `<p style="color:#c9c9cf;font-size:14px;line-height:1.7">Confirm your email to activate your 20FIT ` +
      `sponsor account. This link expires in 48 hours.</p>` +
      button(link, "Confirm email") +
      `<p style="color:#8a8a90;font-size:12px;line-height:1.7">Or paste this link into your browser:<br>${link}</p>`,
  );
  const text = `Confirm your 20FIT sponsor account email (expires in 48 hours):\n${link}${FOOTER_TEXT}`;
  return send(to, "Confirm your 20FIT sponsor account", html, text);
}

/** Password-reset link. */
export function sendPasswordResetEmail(to: string, company: string, token: string): Promise<SendResult> {
  const link = `${siteUrl()}/brand/reset?token=${encodeURIComponent(token)}`;
  const html = shell(
    "Reset your password",
    `<p style="color:#c9c9cf;font-size:14px;line-height:1.7">Hi ${escapeHtml(company)},</p>` +
      `<p style="color:#c9c9cf;font-size:14px;line-height:1.7">We received a request to reset your ` +
      `20FIT sponsor account password. This link expires in 1 hour. If you didn't ask for this, ignore this email.</p>` +
      button(link, "Reset password") +
      `<p style="color:#8a8a90;font-size:12px;line-height:1.7">Or paste this link into your browser:<br>${link}</p>`,
  );
  const text = `Reset your 20FIT sponsor account password (expires in 1 hour):\n${link}${FOOTER_TEXT}`;
  return send(to, "Reset your 20FIT sponsor account password", html, text);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
