/**
 * Pure helpers for the athlete's ground contacts on the stage. Every picture
 * (a frame, the frame fading in, the turn video) is shifted on its own so its
 * sole line lands on the platform line; the contact shadows follow the soles
 * of what is on screen, mixed between the two frames of a crossfade.
 * All values are fractions of the stage box (0..1, origin top-left).
 */
import { soleLifted, type Foot } from "./media360";

/** A shoe on screen: contact span x0..x1 and its bottom y (after its picture's shift). */
export type Contact = { x0: number; x1: number; y: number; lifted: boolean };

/** Vertical shift (fraction of the box) that puts this foot's toe on the platform line. */
export const footShift = (toe: number, line: number) => line - toe;

/** The soles of one picture, placed where they show once the picture is shifted. */
export function contactsOf(foot: Foot, line: number): Contact[] {
  const soles = foot.soles?.length ? foot.soles : [[foot.left, foot.right, foot.toe]];
  const d = footShift(foot.toe, line);
  return soles.slice(0, 2).map((s) => ({ x0: s[0], x1: s[1], y: s[2] + d, lifted: soleLifted(s) }));
}

const mid = (c: Contact) => (c.x0 + c.x1) / 2;

/**
 * Contacts between two pictures at blend t (0 = p, 1 = q), so the shadows glide
 * with the crossfade instead of jumping. Soles are paired left to right; when
 * one picture shows one shoe and the other two, the single one pairs with both.
 */
export function mixContacts(p: Contact[], q: Contact[], t: number): Contact[] {
  if (!p.length) return q;
  if (!q.length) return p;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const pair = (a: Contact, b: Contact): Contact => ({
    x0: lerp(a.x0, b.x0),
    x1: lerp(a.x1, b.x1),
    y: lerp(a.y, b.y),
    lifted: t < 0.5 ? a.lifted : b.lifted,
  });
  if (p.length === q.length) return p.map((c, k) => pair(c, q[k]));
  const [one, two, flip] = p.length === 1 ? [p[0], q, false] : [q[0], p, true];
  // The single shoe stands for whichever of the two is nearer to it; the other
  // one of the pair comes from (or goes to) the same place.
  return two.map((c) => (flip ? pair(c, one) : pair(one, c))).sort((a, b) => mid(a) - mid(b));
}

/** Feet track of a turn video: one entry per video frame, [toe, soles]. */
export type VideoFeet = { frames: number; feet: [number, number[][]][] };

/** Validate a feet track (scripts/video360 feet.json); anything unexpected = null. */
export function parseVideoFeet(raw: unknown): VideoFeet | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const list = Array.isArray(v.feet) ? v.feet : [];
  const ok = (x: unknown) => typeof x === "number" && x >= 0 && x <= 1.2;
  const feet = list.filter(
    (f): f is [number, number[][]] =>
      Array.isArray(f) && ok(f[0]) && Array.isArray(f[1]) && f[1].length <= 2 && f[1].every((s: unknown) => Array.isArray(s) && s.length >= 3 && s.slice(0, 3).every(ok)),
  );
  if (!feet.length || feet.length !== list.length) return null;
  return { frames: feet.length, feet };
}

/** The foot of the video frame on screen at this angle (frame k covers [k, k+1) of the turn). */
export function videoFootAt(track: VideoFeet, angleDeg: number): Foot {
  const n = track.frames;
  const a = (((angleDeg % 360) + 360) % 360) / 360;
  const [toe, soles] = track.feet[Math.min(n - 1, Math.floor(a * n + 1e-6))];
  const xs = soles.flatMap((s) => [s[0], s[1]]);
  return { toe, back: soles.length ? Math.min(...soles.map((s) => s[2])) : toe, left: xs.length ? Math.min(...xs) : 0.3, right: xs.length ? Math.max(...xs) : 0.7, soles };
}
