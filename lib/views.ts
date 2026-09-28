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


/** Orbit angle (deg) of each fixed view: Depan 0, Kanan 90, Belakang 180, Kiri 270. */
export const VIEW_ANGLES = [0, 90, 180, 270] as const;

/**
 * Orbit angle (0..360) of every frame, so the in-between photos can be played
 * during a view change. The four view photos are the keyframes (0/90/180/270);
 * frames between two keyframes are spread linearly by their position in the
 * sequence (real shoots are not evenly spaced, so each segment is spaced on its
 * own). Returns null when the views are not in increasing order around the
 * sequence starting at Depan — then only the four photos can be used.
 */
export function frameAngles(frames: string[], views: Media360Views | null): number[] | null {
  const n = frames.length;
  if (!views || n < 4) return null;
  const idx = VIEW_KEYS.map((k) => frames.indexOf(views[k]));
  if (idx.some((i) => i < 0)) return null;
  const off = idx.map((i) => (i - idx[0] + n) % n);
  for (let k = 1; k < 4; k++) if (!(off[k] > off[k - 1])) return null;
  const bounds = [...off, n];
  return frames.map((_, j) => {
    const o = (j - idx[0] + n) % n;
    let k = 0;
    while (k < 3 && o >= bounds[k + 1]) k++;
    return VIEW_ANGLES[k] + (90 * (o - bounds[k])) / (bounds[k + 1] - bounds[k]);
  });
}
