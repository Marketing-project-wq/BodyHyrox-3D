/**
 * Fixed 4-view athlete viewer (Depan / Kanan / Belakang / Kiri). Pure helpers,
 * safe to import from client components.
 */

/** The four fixed viewer poses, in navigation order (next = to the right). */
export const VIEW_KEYS = ["front", "right", "back", "left"] as const;
export type ViewKey = (typeof VIEW_KEYS)[number];
export type Media360Views = Record<ViewKey, string>;

/** A zone marker as stored: points per 1-based frame number, normalized 0..1. */
export type HotspotInput = {
  athleteZoneId: string;
  label: string;
  points: Record<string, { x: number; y: number }>;
};

/**
 * Frame file per fixed view. Uses the admin's saved choice when every file still
 * exists in `frames`; otherwise falls back to evenly spaced frames (0, ¼, ½, ¾).
 */
export function resolveViews(frames: string[], raw: unknown): Media360Views | null {
  if (frames.length === 0) return null;
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const picked = VIEW_KEYS.map((k) => (typeof r[k] === "string" ? String(r[k]) : ""));
    if (picked.every((f) => f && frames.includes(f))) {
      return Object.fromEntries(VIEW_KEYS.map((k, i) => [k, picked[i]])) as Media360Views;
    }
  }
  const n = frames.length;
  return Object.fromEntries(VIEW_KEYS.map((k, i) => [k, frames[Math.round((i * n) / 4) % n]])) as Media360Views;
}

