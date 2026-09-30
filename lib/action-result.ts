/**
 * Result shape of every server action that can fail.
 *
 * In production Next.js replaces the message of an error *thrown* by a server
 * action with a generic English text, so failures travel as a returned value
 * instead: `{ ok: false, code }`. The client translates the code through
 * lib/i18n.ts (errorText); an unknown failure still shows a generic EN/ID
 * message, it never disappears.
 */
export const ERROR_CODES = [
  "unknown",
  "forbidden",
  "missing_input",
  "athlete_not_found",
  "event_not_found",
  "race_not_found",
  "zone_not_found",
  "brand_not_found",
  "transaction_not_found",
  "already_refunded",
  "zone_taken",
  "zone_not_athlete",
  "zone_unavailable",
  "request_not_found",
  "request_not_pending",
  "media_missing",
  "draft_invalid",
  "draft_too_large",
  "frame_count",
  "frame_name_invalid",
  "frame_source_invalid",
  "frame_missing",
  "nothing_to_publish",
  "version_not_found",
  "zones_invalid",
  "views_invalid",
  "upload_failed",
  "bg_model_failed",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type ActionFail = { ok: false; code: ErrorCode };
export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionFail;

export const isErrorCode = (v: unknown): v is ErrorCode =>
  typeof v === "string" && (ERROR_CODES as readonly string[]).includes(v);

/** Thrown on the client (by `unwrap`) or on the server for a known failure. */
export class ActionFailure extends Error {
  constructor(public code: ErrorCode) {
    super(code);
    this.name = "ActionFailure";
  }
}

/**
 * Client side: turn a failed result back into a thrown ActionFailure, so the
 * existing try/catch around each call keeps treating a failure as a failure.
 */
export function unwrap<T extends object>(r: ActionResult<T>): { ok: true } & T {
  if (!r || r.ok !== true) throw new ActionFailure(r && "code" in r && isErrorCode(r.code) ? r.code : "unknown");
  return r;
}

/** The error code of anything caught on the client (ActionFailure, or a thrown code). */
export function errorCodeOf(e: unknown): ErrorCode {
  if (e instanceof ActionFailure) return e.code;
  if (e instanceof Error && isErrorCode(e.message)) return e.message;
  return "unknown";
}
