import { STAGE_FRAMES_BUNDLED } from "./config";
import type { Media360 } from "./data";
import { VIEW_KEYS, type Media360Views } from "./views";

/** File names of a bundled picture turn: 000.webp, 001.webp, ... */
export function bundledFrameNames(count: number): string[] {
  return Array.from({ length: count }, (_, k) => `${String(k).padStart(3, "0")}.webp`);
}

/**
 * The athlete's 360 set with the picture turn shipped with the site
 * (STAGE_FRAMES_BUNDLED) in place of the data's frames; the data's own set
 * when there is none. Zone points stay on their side (the published side
 * frames' numbers become the bundled sides' numbers).
 */
export function withBundledFrames(athleteId: string, media: Media360 | null): Media360 | null {
  const b = STAGE_FRAMES_BUNDLED[athleteId];
  if (!b || b.count < 4 || b.count % 4) return media;
  const frames = bundledFrameNames(b.count);
  const q = b.count / 4;
  const views = Object.fromEntries(VIEW_KEYS.map((k, j) => [k, frames[j * q]])) as Media360Views;
  const oldNo = VIEW_KEYS.map((k) => (media?.views ? media.frames.indexOf(media.views[k]) + 1 : 0));
  const hotspots = (media?.hotspots ?? []).map((h) => {
    const points: typeof h.points = {};
    VIEW_KEYS.forEach((_, j) => {
      const p = oldNo[j] > 0 ? h.points[String(oldNo[j])] : undefined;
      if (p) points[String(j * q + 1)] = p;
    });
    return { ...h, points };
  });
  return {
    baseUrl: b.baseUrl,
    frames,
    views,
    autospin: media?.autospin ?? true,
    crossfade: true,
    isPlaceholder: false,
    hotspots,
    frameMeta: {},
    version: media?.version ?? 0,
    video: null,
  };
}
