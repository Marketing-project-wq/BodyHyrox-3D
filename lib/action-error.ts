import "server-only";
import { isRedirectError } from "next/dist/client/components/redirect";
import { isNotFoundError } from "next/dist/client/components/not-found";
import { ActionFailure, isErrorCode, type ActionFail, type ErrorCode } from "@/lib/action-result";

/**
 * Known database / RPC messages (raised in Indonesian by the smb_* functions)
 * and our own server messages, mapped to error codes. Anything else becomes
 * "unknown" and is logged on the server.
 */
const KNOWN: [RegExp, ErrorCode][] = [
  [/tidak memiliki izin/i, "forbidden"],
  [/^Atlet tidak ditemukan/i, "athlete_not_found"],
  [/^Event tidak ditemukan/i, "event_not_found"],
  [/^Data race tidak ditemukan/i, "race_not_found"],
  [/^Zona tidak ditemukan/i, "zone_not_found"],
  [/^Brand tidak ditemukan/i, "brand_not_found"],
  [/^Transaksi tidak ditemukan/i, "transaction_not_found"],
  [/^Transaksi sudah di-refund/i, "already_refunded"],
  [/^Zona sudah terisi sponsor/i, "zone_taken"],
  [/^Zona tidak milik atlet ini/i, "zone_not_athlete"],
  [/^Media 360 atlet belum ada/i, "media_missing"],
  [/^(Format draft tidak valid|Draft tanpa daftar frame|frame_meta tidak valid|base_url kosong|Daftar frame tidak valid)/i, "draft_invalid"],
  [/^Draft terlalu besar/i, "draft_too_large"],
  [/^(Maksimal \d+ frame|Jumlah frame harus)/i, "frame_count"],
  [/^(Nama frame (tidak valid|ganda))/i, "frame_name_invalid"],
  [/^(Format titik zona tidak valid|Titik zona tidak valid|Koordinat titik harus|Nomor frame .* tidak valid)/i, "zones_invalid"],
  [/^(Format views tidak valid|Frame .* untuk view .* tidak ada|Frame untuk view .* tidak ada|View .* belum dipilih)/i, "views_invalid"],
  [/^(Format media frame tidak valid|Maksimal \d+ slot|Jenis media tidak valid|Link harus https|ID YouTube tidak valid|Judul terlalu panjang|Slot media tidak valid)/i, "stage_media_invalid"],
  [/^Tidak ada draft media frame/i, "stage_media_no_draft"],
];

/** smb_review_request returns { ok: false, error } codes instead of raising. */
const REVIEW: Record<string, ErrorCode> = {
  not_found: "request_not_found",
  not_pending: "request_not_pending",
  zone_unavailable: "zone_unavailable",
};
export const reviewErrorCode = (e: unknown): ErrorCode => REVIEW[String(e)] ?? "unknown";

/** Map a caught server-side error to a code; Next's redirect / notFound pass through. */
export function codeOf(e: unknown): ErrorCode {
  if (e instanceof ActionFailure) return e.code;
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (isErrorCode(msg)) return msg;
  for (const [re, code] of KNOWN) if (re.test(msg)) return code;
  return "unknown";
}

/**
 * Run a server action body; a thrown error becomes `{ ok: false, code }`.
 * redirect() / notFound() are re-thrown so Next can handle them.
 */
export async function run<T extends object>(body: () => Promise<{ ok: true } & T>): Promise<({ ok: true } & T) | ActionFail> {
  try {
    return await body();
  } catch (e) {
    if (isRedirectError(e) || isNotFoundError(e)) throw e;
    const code = codeOf(e);
    if (code === "unknown") console.error("[action] unknown failure:", e);
    return { ok: false, code };
  }
}

/** Throw a known failure from inside `run` (becomes { ok: false, code }). */
export function fail(code: ErrorCode): never {
  throw new ActionFailure(code);
}
