/**
 * Pure helpers for the stage's video layer (hybrid viewer): the athlete turns
 * from a transparent video while it auto-rotates, and from the frames for
 * everything else. The video holds exactly one turn at an even angle speed,
 * frame 0 = Front (0°), so angle = 360 × time / duration.
 */

export type StageVideoSource = { file: string; type: string };
export type StageVideo = {
  sources: StageVideoSource[];
  poster: string | null;
  fps: number;
  frames: number;
  duration: number;
};

const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

/** Validate the stored video object; anything unexpected = no video (frames only). */
export function parseStageVideo(raw: unknown): StageVideo | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const sources = (Array.isArray(v.sources) ? v.sources : [])
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
    .filter((s) => typeof s.file === "string" && SAFE_FILE.test(s.file) && typeof s.type === "string" && /^video\/[a-z0-9.+-]+/i.test(s.type))
    .slice(0, 4)
    .map((s) => ({ file: String(s.file), type: String(s.type) }));
  const duration = Number(v.duration);
  const fps = Number(v.fps);
  const frames = Number(v.frames);
  if (!sources.length || !(duration > 0) || duration > 600) return null;
  const poster = typeof v.poster === "string" && SAFE_FILE.test(v.poster) ? v.poster : null;
  return { sources, poster, fps: fps > 0 ? fps : 30, frames: frames > 0 ? frames : Math.round(duration * 30), duration };
}

export const videoAngle = (mediaTime: number, duration: number) => (((mediaTime / duration) * 360) % 360 + 360) % 360;
export const timeForAngle = (angle: number, duration: number) => ((((angle % 360) + 360) % 360) / 360) * duration;

/** HEVC (hvc1) with alpha plays on Apple's WebKit; VP9 alpha elsewhere. */
export const isHevc = (s: StageVideoSource) => /hvc1|hev1|hevc|quicktime/i.test(s.type) || /\.mov$/i.test(s.file);

/**
 * The order to try the sources in: those the browser says it can play, the
 * HEVC ones first on Apple's WebKit (it plays VP9 but without transparency),
 * the others first elsewhere. Each is still checked for transparency.
 */
export function sourceOrder(sources: StageVideoSource[], canPlay: (type: string) => string, apple: boolean): StageVideoSource[] {
  const ok = sources.filter((s) => canPlay(s.type) !== "");
  return [...ok].sort((a, b) => (isHevc(a) === isHevc(b) ? 0 : isHevc(a) === apple ? -1 : 1));
}

/**
 * Transparency check of a decoded frame, from alpha samples: the corners are
 * empty stage (must be transparent) and the athlete is somewhere (opaque).
 */
export function alphaLooksRight(cornerAlphas: number[], maxAlpha: number, cornerMax: number): boolean {
  return cornerAlphas.every((a) => a <= cornerMax) && maxAlpha >= 200;
}
