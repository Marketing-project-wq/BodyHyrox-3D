import type { DraftFrame, Media360Draft } from "@/lib/media360";
import { VIEW_KEYS, type HotspotInput, type Media360Views } from "@/lib/views";

/**
 * Viewer sides and zone markers while a draft is being edited.
 *
 * Live data keys markers by 1-based frame number. In a draft they are keyed by
 * frame FILE name, so reordering / inserting / deleting frames in the studio
 * never moves a marker to another photo. publishDraft turns them back into
 * frame numbers.
 */
export type Point = { x: number; y: number };
export type SideHotspot = { athleteZoneId: string; label: string; points: Record<string, Point> };
/** Stored shape (same field names as the live column). */
export type StoredHotspot = { athlete_zone_id: string; label?: string; points: Record<string, Point> };

const isNum = (k: string) => /^[0-9]+$/.test(k);

/** Draft hotspots (file keys, or legacy frame numbers) → file-keyed, only for files in `files`. */
export function draftHotspotsByFile(raw: unknown[] | undefined, files: string[]): SideHotspot[] {
  const out: SideHotspot[] = [];
  for (const h of (raw ?? []) as Record<string, unknown>[]) {
    const id = String(h?.athlete_zone_id ?? h?.athleteZoneId ?? "");
    if (!id) continue;
    const points: Record<string, Point> = {};
    for (const [k, v] of Object.entries((h.points ?? {}) as Record<string, Point>)) {
      const file = isNum(k) ? files[Number(k) - 1] : k;
      if (file && files.includes(file) && v) points[file] = { x: Number(v.x), y: Number(v.y) };
    }
    out.push({ athleteZoneId: id, label: String(h.label ?? ""), points });
  }
  return out;
}

/** Live hotspots (frame numbers of the live set) → keyed by the draft file that came from that live frame. */
export function liveHotspotsByFile(live: HotspotInput[], liveFrames: string[], draftFrames: DraftFrame[]): SideHotspot[] {
  const byOrigin = new Map<string, string>();
  for (const f of draftFrames) if (f.origin && !byOrigin.has(f.origin)) byOrigin.set(f.origin, f.file);
  return live.map((h) => {
    const points: Record<string, Point> = {};
    for (const [k, v] of Object.entries(h.points)) {
      const file = byOrigin.get(liveFrames[Number(k) - 1]);
      if (file) points[file] = v;
    }
    return { athleteZoneId: h.athleteZoneId, label: h.label, points };
  });
}

/** Live views → the draft files that came from those live frames (null if a side's frame is gone). */
export function liveViewsInDraft(views: Media360Views | null, draftFrames: DraftFrame[]): Media360Views | null {
  if (!views) return null;
  const out = {} as Media360Views;
  for (const k of VIEW_KEYS) {
    const f = draftFrames.find((d) => d.origin === views[k]);
    if (!f) return null;
    out[k] = f.file;
  }
  return out;
}

export type SidesSource = {
  /** Frames the picker / placer choose from (draft frames when a draft exists). */
  frames: string[];
  /** Image URL of each frame. */
  srcs: Record<string, string>;
  views: Media360Views | null;
  hotspots: SideHotspot[];
  /** The draft carries its own sides / markers (not yet published). */
  pendingViews: boolean;
  pendingHotspots: boolean;
  fromDraft: boolean;
};

/** What the sides picker and the zone placer work on: the draft if there is one, else the live set. */
export function sidesSource(
  live: { baseUrl: string; frames: string[]; views: Media360Views | null; hotspots: HotspotInput[] },
  draft: Media360Draft | null,
  draftUrls: Record<string, string>,
): SidesSource {
  const liveBase = live.baseUrl.replace(/\/$/, "");
  if (!draft) {
    const frames = live.frames;
    const liveDraftFrames = frames.map((file) => ({ file, base: liveBase, origin: file }));
    return {
      frames,
      srcs: Object.fromEntries(frames.map((f) => [f, `${liveBase}/${f}`])),
      views: live.views,
      hotspots: liveHotspotsByFile(live.hotspots, live.frames, liveDraftFrames),
      pendingViews: false,
      pendingHotspots: false,
      fromDraft: false,
    };
  }
  const frames = draft.frames.map((f) => f.file);
  const srcs: Record<string, string> = {};
  for (const f of draft.frames) srcs[f.file] = f.base ? `${f.base.replace(/\/$/, "")}/${f.file}` : draftUrls[f.file] ?? "";
  const views =
    draft.views !== undefined
      ? draft.views && VIEW_KEYS.every((k) => frames.includes(draft.views![k]))
        ? (draft.views as Media360Views)
        : null
      : liveViewsInDraft(live.views, draft.frames);
  const hotspots =
    draft.hotspots !== undefined
      ? draftHotspotsByFile(draft.hotspots, frames)
      : liveHotspotsByFile(live.hotspots, live.frames, draft.frames);
  return {
    frames,
    srcs,
    views,
    hotspots,
    pendingViews: draft.views !== undefined,
    pendingHotspots: draft.hotspots !== undefined,
    fromDraft: true,
  };
}

/** File-keyed draft hotspots → frame numbers of `frames` (what the live column stores). */
export function hotspotsToFrameNumbers(raw: unknown[] | undefined, frames: string[]): StoredHotspot[] {
  return draftHotspotsByFile(raw, frames)
    .map((h) => ({
      athlete_zone_id: h.athleteZoneId,
      label: h.label,
      points: Object.fromEntries(Object.entries(h.points).map(([file, p]) => [String(frames.indexOf(file) + 1), p])),
    }))
    .filter((h) => Object.keys(h.points).length > 0);
}

/** A draft built from the live set (what the studio starts from too). */
export function draftFromLive(live: { baseUrl: string; frames: string[]; frameMeta: Media360Draft["meta"] }): Media360Draft {
  const base = live.baseUrl.replace(/\/$/, "");
  return {
    frames: live.frames.map((file) => ({ file, base, origin: file })),
    meta: JSON.parse(JSON.stringify(live.frameMeta ?? {})),
  };
}

/** A side / marker on a file the studio replaced moves to the replacing file. */
export function followReplacedFrames(d: Media360Draft) {
  const files = new Set(d.frames.map((f) => f.file));
  const renamed = new Map<string, string>();
  for (const f of d.frames) {
    const last = d.meta[f.file]?.prev?.slice(-1)[0]?.file;
    if (last && !files.has(last)) renamed.set(last, f.file);
  }
  if (!renamed.size) return;
  if (d.views) {
    d.views = Object.fromEntries(Object.entries(d.views).map(([k, v]) => [k, renamed.get(v) ?? v]));
  }
  if (d.hotspots) {
    d.hotspots = (d.hotspots as { athlete_zone_id?: string; label?: string; points?: Record<string, unknown> }[]).map((h) => ({
      ...h,
      points: Object.fromEntries(Object.entries(h.points ?? {}).map(([k, v]) => [renamed.get(k) ?? k, v])),
    }));
  }
}

/**
 * The sides and zone markers the live page gets when `draft` is published
 * over `live` (markers keyed by frame NUMBER of the new set). Pure: used by
 * publishDraft and by the pre-publish check, so both see the same result.
 * `viewsInvalid`: a side set in the draft points at a frame the draft lacks.
 */
export function publishedSides(
  live: { frames: string[]; views: Record<string, string> | null; hotspots: StoredHotspot[] | null },
  draft: Pick<Media360Draft, "frames" | "views" | "hotspots">,
): { views: Record<string, string> | null; hotspots: StoredHotspot[]; viewsInvalid: boolean } {
  const frames = draft.frames.map((f) => f.file);
  const newIndexOfLive = new Map<string, number>();
  draft.frames.forEach((f, j) => {
    if (f.origin && !newIndexOfLive.has(f.origin)) newIndexOfLive.set(f.origin, j);
  });
  let views: Record<string, string> | null;
  let viewsInvalid = false;
  if (draft.views !== undefined) {
    if (draft.views && !VIEW_KEYS.every((k) => frames.includes(draft.views![k]))) viewsInvalid = true;
    views = draft.views ?? null;
  } else if (live.views) {
    const mapped: Record<string, string> = {};
    for (const k of VIEW_KEYS) {
      const j = newIndexOfLive.get(live.views[k]);
      if (j != null) mapped[k] = frames[j];
    }
    views = VIEW_KEYS.every((k) => mapped[k]) ? mapped : null;
  } else views = null;

  let hotspots: StoredHotspot[];
  if (draft.hotspots !== undefined) {
    // Draft markers are keyed by frame file (legacy drafts: frame numbers).
    hotspots = hotspotsToFrameNumbers(draft.hotspots, frames);
  } else {
    hotspots = (live.hotspots ?? []).map((h) => {
      const points: Record<string, Point> = {};
      for (const [k, v] of Object.entries(h.points ?? {})) {
        const j = newIndexOfLive.get(live.frames[Number(k) - 1]);
        if (j != null) points[String(j + 1)] = v;
      }
      return { athlete_zone_id: h.athlete_zone_id, label: h.label ?? "", points };
    });
  }
  hotspots = hotspots.filter((h) => Object.keys(h.points ?? {}).length > 0);
  return { views, hotspots, viewsInvalid };
}

export type MarkerCount = { zones: number; points: number };

/** Zones with at least one marker, and all markers. */
export function countMarkers(hotspots: { points?: Record<string, unknown> | null }[] | null | undefined): MarkerCount {
  let zones = 0;
  let points = 0;
  for (const h of hotspots ?? []) {
    const n = Object.keys(h?.points ?? {}).length;
    if (n > 0) {
      zones++;
      points += n;
    }
  }
  return { zones, points };
}

/** True when publishing would leave fewer zones or markers than the reference. */
export function losesMarkers(planned: MarkerCount, ref: MarkerCount | null): boolean {
  return !!ref && (planned.zones < ref.zones || planned.points < ref.points);
}

/**
 * Markers of a reference set (live, or the last version that had markers)
 * copied onto a brand-new set side by side: a marker on the reference's
 * Front frame goes onto the new Front frame, and so on. Markers on frames
 * that are not one of the 4 sides can't be placed and are counted as
 * dropped. Result is keyed by the new FILE (draft format).
 */
export function carryMarkersBySide(
  ref: { frames: string[]; views: Media360Views; hotspots: StoredHotspot[] },
  newViews: Media360Views,
): { hotspots: StoredHotspot[]; carried: MarkerCount; dropped: number } {
  const sideOfNo = new Map<string, (typeof VIEW_KEYS)[number]>();
  for (const k of VIEW_KEYS) {
    const i = ref.frames.indexOf(ref.views[k]);
    if (i >= 0 && !sideOfNo.has(String(i + 1))) sideOfNo.set(String(i + 1), k);
  }
  let dropped = 0;
  const hotspots: StoredHotspot[] = [];
  for (const h of ref.hotspots) {
    const points: Record<string, Point> = {};
    for (const [no, p] of Object.entries(h.points ?? {})) {
      const side = sideOfNo.get(no);
      if (side && p) points[newViews[side]] = { x: Number(p.x), y: Number(p.y) };
      else dropped++;
    }
    if (Object.keys(points).length) hotspots.push({ athlete_zone_id: h.athlete_zone_id, label: h.label ?? "", points });
  }
  return { hotspots, carried: countMarkers(hotspots), dropped };
}
