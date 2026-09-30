/**
 * Pure helpers for the free-rotation athlete viewer (no DOM): angles are in
 * degrees, any real number; 0 = Depan, 90 = Kanan, 180 = Belakang, 270 = Kiri.
 */

export const norm360 = (a: number) => ((a % 360) + 360) % 360;

/** Signed shortest difference to - from, in (-180, 180]. */
export function shortestDelta(from: number, to: number): number {
  const d = norm360(to - from);
  return d > 180 ? d - 360 : d;
}

/** Nearest side (0..3) and how far the angle is from it (deg, 0..45). */
export function nearestSide(angle: number): { side: number; off: number } {
  const a = norm360(angle);
  const side = Math.round(a / 90) % 4;
  return { side, off: Math.abs(shortestDelta(side * 90, a)) };
}

/** The angle equal to side*90 (mod 360) closest to `from` (shortest way round). */
export function sideTarget(from: number, side: number): number {
  return from + shortestDelta(from, side * 90);
}

/** The next side strictly beyond `from` in the direction `dir` (+1 = toward Kanan). */
export function nextSideTarget(from: number, dir: 1 | -1): number {
  const eps = 0.5;
  return dir > 0 ? (Math.floor((from + eps) / 90) + 1) * 90 : (Math.ceil((from - eps) / 90) - 1) * 90;
}

/** Text of the degree readout: 0..359. */
export const degreeLabel = (angle: number) => `${Math.round(norm360(angle)) % 360}°`;

/**
 * One step of the release inertia: new velocity after dt seconds (exponential
 * decay with time constant tauMs), 0 once below minDegPerSec.
 */
export function decayVelocity(v: number, dtSec: number, tauMs: number, minDegPerSec: number): number {
  const next = v * Math.exp((-dtSec * 1000) / tauMs);
  return Math.abs(next) < minDegPerSec ? 0 : next;
}

/**
 * Crossfade amount of the upper frame for a position t (0..1) between two
 * frames: `share` of the step is spent blending (smoothstep), centred, so each
 * frame is shown alone for (1 - share) / 2 of the step on its side.
 */
export function blendAmount(t: number, share: number): number {
  const s = Math.min(1, Math.max(0.001, share));
  const u = Math.min(1, Math.max(0, (t - (1 - s) / 2) / s));
  return u * u * (3 - 2 * u);
}

/**
 * Order in which to load the frames of a turn: the given first ones (the 4
 * sides), then the rest spread evenly around the circle (halving the gaps),
 * so a progressive load looks smooth early. `angles[i]` = frame i's angle.
 */
export function loadOrder(angles: number[], first: number[]): number[] {
  const n = angles.length;
  const done = new Set<number>();
  const out: number[] = [];
  const take = (i: number) => {
    if (i >= 0 && i < n && !done.has(i)) {
      done.add(i);
      out.push(i);
    }
  };
  first.forEach(take);
  for (let step = 45; out.length < n && step >= 0.5; step /= 2) {
    for (let a = step; a < 360; a += 2 * step) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        if (done.has(i)) continue;
        const d = Math.abs(shortestDelta(angles[i], a));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0 && bestD <= step) take(best);
    }
  }
  for (let i = 0; i < n; i++) take(i);
  return out;
}

/**
 * Bracket an angle between two keyframes (sorted by angle, wrapping 360):
 * the lower and upper frame index and how far between them (0..1).
 */
export function bracket(angle: number, keys: { a: number; i: number }[]): { lo: number; hi: number; t: number; span: number } {
  const A = norm360(angle);
  const n = keys.length;
  if (n === 0) return { lo: 0, hi: 0, t: 0, span: 360 };
  if (n === 1) return { lo: keys[0].i, hi: keys[0].i, t: 0, span: 360 };
  for (let k = 0; k < n; k++) {
    const a0 = keys[k].a;
    const a1 = k + 1 < n ? keys[k + 1].a : keys[0].a + 360;
    const A1 = A < a0 ? A + 360 : A;
    if (A1 >= a0 && A1 < a1) {
      const span = a1 - a0 || 1;
      return { lo: keys[k].i, hi: k + 1 < n ? keys[k + 1].i : keys[0].i, t: (A1 - a0) / span, span };
    }
  }
  // A is before the first keyframe: between the last and the first (wrapping).
  const a0 = keys[n - 1].a - 360;
  const span = keys[0].a - a0 || 1;
  return { lo: keys[n - 1].i, hi: keys[0].i, t: (A - a0) / span, span };
}
