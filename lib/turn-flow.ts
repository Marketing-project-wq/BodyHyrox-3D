import { STAGE_TURN_FLOW } from "./config";
import type { Media360 } from "./data";
import { norm360 } from "./spin";
import { VIEW_KEYS } from "./views";

/** Circular distance between two angles (degrees, 0..180). */
const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/**
 * The one turn flow for every athlete (STAGE_TURN_FLOW): the set's photos laid
 * on a fixed grid of `stops` poses (360 / stops degrees apart), crossfading
 * over `blendShare` of each step. Each stop shows the photo nearest its angle;
 * the four side photos chosen in the studio keep the stop nearest their own
 * angle (so the zone points stay on the photo they were placed on). With fewer
 * photos than stops a photo holds over neighbouring stops (listed once per
 * stop; crossfading a photo with itself shows no change).
 *
 * Only the picture order of the stage changes: files, angles in the data and
 * zone points are kept (points move with their photo's new number). A set that
 * already is the grid (Calysta: 18 photos every 20°, 15%) comes back as it is.
 */
export function withTurnFlow(media: Media360 | null): Media360 | null {
  const turn = media?.turn;
  if (!media || !turn || turn.angles.length !== media.frames.length || media.frames.length < 2) return media;
  const n = Math.max(4, Math.round(STAGE_TURN_FLOW.stops));
  const step = 360 / n;
  const src = turn.angles.map((a, i) => ({ a: norm360(a), i }));
  const onGrid =
    src.length === n &&
    src.every((s, k) => gap(s.a, k * step) < 1e-6) &&
    Math.abs((turn.blendShare ?? -1) - STAGE_TURN_FLOW.blendShare) < 1e-9;
  if (onGrid) return media;

  // Nearest photo for every stop.
  const pick = Array.from({ length: n }, (_, k) => {
    let best = src[0];
    for (const s of src) if (gap(s.a, k * step) < gap(best.a, k * step)) best = s;
    return best.i;
  });
  // The side photos keep their stop.
  for (const key of VIEW_KEYS) {
    const file = media.views?.[key];
    const i = file ? media.frames.indexOf(file) : -1;
    if (i < 0) continue;
    const k = Math.round(norm360(turn.angles[i]) / step) % n;
    pick[k] = i;
  }

  const frames = pick.map((i) => media.frames[i]);
  // Zone points are keyed by the photo's number (1-based): carry them over.
  const renumber = (oldNo: string) => {
    const file = media.frames[Number(oldNo) - 1];
    const j = file ? frames.indexOf(file) : -1;
    return j < 0 ? null : String(j + 1);
  };
  const hotspots = media.hotspots.map((h) => {
    const points: typeof h.points = {};
    for (const [no, p] of Object.entries(h.points)) {
      const nn = renumber(no);
      if (nn && !points[nn]) points[nn] = p;
    }
    return { ...h, points };
  });
  return {
    ...media,
    frames,
    hotspots,
    turn: { ...turn, angles: frames.map((_, k) => k * step), blendShare: STAGE_TURN_FLOW.blendShare },
  };
}
