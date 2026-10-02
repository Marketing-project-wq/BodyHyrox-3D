import type { CSSProperties } from "react";
/**
 * Central business configuration for Sponsor My Body.
 *
 * Business rules (currency, timezone, status semantics, zone visibility labels,
 * role permissions, notification defaults) live here — NEVER hardcode these
 * inside components. Values that are truly dynamic (zone prices, KPIs, rankings)
 * come from the database, not from this file.
 */

export const PLATFORM = {
  name: "20FIT Sponsor My Body",
  currency: "IDR",
  timezone: "Asia/Jakarta",
  timezoneLabel: "WIB",
} as const;

/** Transaction lifecycle. */
export type TxStatus = "paid" | "pending" | "refunded";

/** Athlete / brand / zone active state. */
export type ActiveStatus = "active" | "inactive";

/** How a status renders (label id + tone). Tone maps to a badge color. */
export type BadgeTone = "green" | "amber" | "gray";

export const TX_STATUS: Record<TxStatus, { label: string; tone: BadgeTone }> = {
  paid: { label: "Paid", tone: "green" },
  pending: { label: "Pending", tone: "amber" },
  refunded: { label: "Refunded", tone: "gray" },
};

export const ACTIVE_STATUS: Record<
  ActiveStatus,
  { label: string; tone: BadgeTone }
> = {
  active: { label: "Aktif", tone: "green" },
  inactive: { label: "Nonaktif", tone: "gray" },
};

/** Body-zone visibility tiers (affects public Sponsor My Body exposure). */
export type Visibility = "high" | "medium" | "low";

export const VISIBILITY: Record<Visibility, { label: string }> = {
  high: { label: "Tinggi" },
  medium: { label: "Sedang" },
  low: { label: "Rendah" },
};

export const ZONE_STATUS: Record<
  "available" | "inactive",
  { label: string; tone: BadgeTone }
> = {
  available: { label: "Tersedia", tone: "green" },
  inactive: { label: "Nonaktif", tone: "gray" },
};

/** Roles and what each may do. Destructive money/pricing actions = Super Admin. */
export type Role = "super_admin" | "admin";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
};

/** Permission keys used across the app. */
export type Permission =
  | "view"
  | "athlete.edit"
  | "athlete.toggle"
  | "brand.edit"
  | "brand.toggle"
  | "transaction.create"
  | "transaction.refund"
  | "zone.pricing"
  | "event.manage"
  | "settings.manage"
  | "request.review"
  | "sponsor_account.manage";

const ALL: Permission[] = [
  "view",
  "athlete.edit",
  "athlete.toggle",
  "brand.edit",
  "brand.toggle",
  "transaction.create",
  "transaction.refund",
  "zone.pricing",
  "event.manage",
  "settings.manage",
  "request.review",
  "sponsor_account.manage",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ALL,
  // Regular admin: everything except money-sensitive / pricing / settings.
  admin: [
    "view",
    "athlete.edit",
    "athlete.toggle",
    "brand.edit",
    "brand.toggle",
    "transaction.create",
    "event.manage",
  ],
};

export function can(role: Role | undefined, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

/**
 * 360° viewer interaction tuning (drag sensitivity + release momentum).
 * Frame count/order come from the DB (smb_athlete_media_360.frames); only the
 * feel of the interaction is configured here so it is easy to adjust.
 */
export const VIEWER_360 = {
  /**
   * On-screen size of the athlete figure inside the full-screen stage. Height
   * is capped to a share of the viewport so the whole body (head to feet) fits;
   * width follows from the frame's aspect ratio. `maxWidthPx` keeps it from
   * getting too wide on tall/narrow phones. Tune here — never hardcode.
   */
  maxHeightSvh: 60,
  maxHeightPx: 560,
  maxWidthPx: 300,
  /**
   * Where the athlete's feet sit, as % of the frame height measured from the
   * bottom (normalized frames stand on a common baseline at ~96.5% down). The
   * stage card centers its neon platform on this line so the athlete stands on
   * it instead of floating above or sinking through it.
   */
  feetLinePct: 3.5,
  /**
   * Frames whose stored feet predate the current feet rules (FOOT_VERSION in
   * lib/media360.ts) or have none are measured in the visitor's browser at
   * most this wide (px), one per idle slot. Old feet keep their stored toe for
   * the anchor. 480 keeps the soles within ~1px of a full-size measurement.
   */
  footMeasureMaxW: 480,
  /**
   * No-WebGL fallback platform: tick marks on the flat CSS ring that turn with
   * the view change. `ringTurnDirection` matches the 3D arena's turn.
   */
  ringTicks: 36,
  ringTurnDirection: -1,
} as const;

/**
 * Stage view readout (view name, angle, hint) over the arena. A soft dark
 * backing fades to transparent at its edges (no visible box) so the neon
 * scenery behind never cuts through the text, in any view.
 */
export const STAGE_READOUT = {
  /** Backing darkness at its centre (0-1); it fades to 0 at the edge. */
  scrimOpacity: 0.9,
  /** How far the backing reaches past the text on each side (px). */
  scrimSpreadPx: 28,
  /** Text shadow strength on the name and angle (0-1). */
  textShadowOpacity: 0.9,
  /** Hint text opacity (white). */
  hintOpacity: 0.6,
  /** Glow radius of the text shadow (px). */
  textGlowPx: 10,
  /**
   * Below lg the readout sits on the arena right above the athlete's head:
   * no dark backing box there, only a slightly stronger text shadow.
   */
  compact: { scrimOpacity: 0, textShadowOpacity: 0.95, textGlowPx: 14 },
};

/**
 * Fixed 4-view athlete viewer (Depan / Kanan / Belakang / Kiri). Which photo is
 * used for each view is data (smb_athlete_media_360.views, picked in admin).
 */
export const VIEWER_VIEWS = {
  /**
   * One orbit angle drives everything during a view change (3D arena camera,
   * fallback ring, athlete photo frames). Duration for a 90° / 180° turn (ms);
   * shorter snaps (after a swipe) scale down from `minTurnMs`.
   */
  turnMs90: 800,
  turnMs180: 1000,
  minTurnMs: 260,
  /** Horizontal drag distance (px) that turns the view by 90° (swipe follows the finger). */
  dragPxPer90: 170,
  /** Movement (px) before a press becomes a horizontal drag. */
  dragStartPx: 8,
  /** Zone markers fade out while turning and back in on the new view (ms). */
  markerFadeMs: 160,
  /**
   * Fallback when in-between photos aren't loaded / usable: crossfade the two
   * view photos with a light "turn" — slight horizontal squeeze and shift in the
   * turn direction at mid-way (kept subtle so it never reads as a card flip).
   */
  fallbackSqueeze: 0.05,
  fallbackShiftPct: 3,
} as const;

/**
 * 3D neon arena behind the stage-card athlete (react-three-fiber). The camera
 * orbits the athlete on the same angle as the photo frames, so the floor,
 * platform and pillars turn in real perspective/parallax with the figure.
 * World units are metres; the athlete is ~`athleteHeightM` tall. Tall scenery
 * sits beyond `minSceneryRadiusM` (> camera distance) so it can never pass in
 * front of the (DOM) athlete.
 */
/**
 * Free rotation of the athlete (any angle, not only the 4 sides).
 * - crossfadeShare: share of the step between two frames spent blending them
 *   (1 = blend over the whole step, so the pose melts continuously from one
 *   frame into the next; lower = each frame stays crisp longer and the pose
 *   changes in a shorter burst).
 * - crossfadeCurve: "linear" = the blend follows the exact (decimal) angle;
 *   "smooth" = eased (lingers on each frame, faster in between).
 * - crossfadeDissolve: the frame below fades out while the next fades in
 *   (plus-lighter), so parts only one pose has (an arm, a leg) fade instead of
 *   popping away at the end of the step. Browsers without plus-lighter keep
 *   the frame below opaque.
 * - restCrispMs: at rest (paused, after a drag) the picture settles on the
 *   nearest frame over about this long, so a still athlete is never a double
 *   exposure (0 = keep the blend at rest).
 * - inertiaTauMs / inertiaMin/MaxDegPerSec: a released drag keeps turning and
 *   slows down (exponential, time constant tauMs) until it stops.
 * - wheelDegPerPx: horizontal trackpad / wheel turn (deg per px of deltaX).
 * - keyStepDeg: one ←/→ key press turns this much.
 * - markerWindowDeg: zone markers of a side show while the athlete is at
 *   rest within this many degrees of that side (option A).
 * - sideReadoutDeg: the readout names the side within this many degrees.
 * - maxDpr: canvas resolution cap (device px per CSS px).
 * - cacheFrames: decoded frames kept in memory (ImageBitmap LRU) per device
 *   class; everything else stays compressed (Blob). phone 24 holds a whole
 *   24-frame set (~42 MB at 390×844, DPR 3), so auto-rotate stops decoding
 *   after one turn. lowMemory applies on any device reporting
 *   navigator.deviceMemory ≤ lowMemoryGb; where deviceMemory is unknown
 *   (Safari, Firefox) the device-class value is used.
 * - loadConcurrency: frames downloaded at once (the 4 sides first, then the
 *   others spread evenly around the turn).
 * - prefetch: frames decoded on each side while at rest; while turning,
 *   `prefetchAhead` in the direction of the turn and 1 behind.
 * - fastTurn*: see below.
 * - manualResumeMs: after a manual turn ends (finger up, inertia and tween
 *   done, last wheel / tap) the auto-rotation comes back by itself this much
 *   later, easing in. Hover and an open zone card hold it longer; only the
 *   visitor's Pause stops it.
 */
export const VIEWER_SPIN = {
  crossfadeShare: 1,
  crossfadeCurve: "linear" as "linear" | "smooth",
  crossfadeDissolve: true,
  restCrispMs: 220,
  inertiaTauMs: 280,
  inertiaMinDegPerSec: 4,
  inertiaMaxDegPerSec: 540,
  wheelDegPerPx: 0.35,
  keyStepDeg: 15,
  keyTurnMs: 180,
  markerWindowDeg: 15,
  sideReadoutDeg: 10,
  maxDpr: 2,
  cacheFrames: { phone: 24, tablet: 16, desktop: 32, lowMemory: 12 },
  lowMemoryGb: 2,
  manualResumeMs: 3000,
  loadConcurrency: 3,
  prefetch: 3,
  prefetchAhead: 6,
  /**
   * Fast turns (tabs, a quick flick) faster than fastTurnDegPerSec use at
   * most fastTurnFrames frames spread round the circle, so a slow phone
   * doesn't have to decode every frame of a large (72-frame) set in a
   * second; slow turns and rest use them all. Sets up to this size: no change.
   */
  fastTurnDegPerSec: 120,
  fastTurnFrames: 24,
};

/**
 * What the stage does (same for every athlete):
 * - "static-athlete" (default, until the new turntable videos are ready): the
 *   athlete stands still on one side photo (Front first); only the scenery
 *   behind (pillars, neon frames, floor grid) orbits slowly round the
 *   athlete. The platform, contact shadows, spotlight, readout and UI stay
 *   put. Tabs / swipe / arrow keys switch the side with a crossfade.
 * - "turntable": the athlete and the scenery turn together (frames, and the
 *   turn video where there is one).
 */
export const STAGE_MODE: "static-athlete" | "turntable" = "static-athlete";
/**
 * An athlete whose data (or STAGE_VIDEO_BUNDLED) has a turn video gets the
 * "turntable" mode when this browser can play it with transparency (VP9 alpha;
 * on Apple's WebKit only with an HEVC source), with no reduced motion and no
 * Save-Data. Every other athlete / browser keeps STAGE_MODE. ?stage=static or
 * ?stage=turntable still forces one mode.
 */
export const STAGE_TURN_VIDEO_AUTO = true;
/**
 * An athlete with a picture turn shipped with the site (STAGE_FRAMES_BUNDLED)
 * gets the "turntable" mode in every browser (no video decoding), with no
 * reduced motion. ?stage=static still forces the 4-side mode.
 */
export const STAGE_TURN_FRAMES_AUTO = true;
/**
 * Picture turns shipped with the site (public/media/...), per athlete id,
 * shown instead of the data's frames until the database holds one: `count`
 * pictures 000.webp.. evenly round the turn (000 = Front, Right at count/4,
 * Back at count/2, Left at 3*count/4) plus feet.json (version 3), made by
 * scripts/video360/export_frames.py. The stage shows the picture of the
 * scenery's angle and crossfades its neighbours (blendShare: the share of each
 * step spent crossfading, centred between two pictures; unset = all of it).
 */
export const STAGE_FRAMES_BUNDLED: Record<string, { baseUrl: string; count: number; blendShare?: number }> = {
  // Calysta: scripts/video360 on her turn video plus her two profile photos
  // (standing frames only, every picture locked: sole, height, centre). She
  // turned herself in that video (her pose shifts from angle to angle), so
  // the stage holds 12 clean poses (every 30 degrees, 714x1680): she stands
  // perfectly still while the scenery orbits, and the next pose crossfades in
  // over blendShare of the 30 degrees (centred between the two).
  "f328e4e0-98c2-483d-b9ae-4be7fd6bf635": { baseUrl: "/media/atlet-360/calysta-turn", count: 12, blendShare: 0.15 },
};
/**
 * "static-athlete" mode:
 * - secPerTurn / direction: one orbit of the scenery (48 s = 12 s per side);
 *   direction 1 or -1. The scenery angle works like a camera orbiting the
 *   athlete: 0 = Front, 90 = Right, 180 = Back, 270 = Left (as the turntable).
 * - autoSides: the athlete's photo follows the orbit, side by side (Front ->
 *   Right -> Back -> Left with direction 1). false: only tabs / swipe / keys
 *   switch the side.
 * - autoFadeMs: crossfade between two sides during the orbit, centred on the
 *   side boundary (45 / 135 / 225 / 315 deg).
 * - turnToSideMs: a tab / swipe / key turns the scenery the shortest way to
 *   that side over this long (the athlete crossfades meanwhile); the orbit
 *   comes back resumeMs after it (or after a zone card closes).
 * - prepNextMs: this long after a side settles, the side the orbit reaches
 *   next is drawn ahead (hidden), so its crossfade starts without a draw.
 * - easeMs: the orbit eases in / out over this long (Play / Pause, resume).
 * - maxStepMs: longest frame step the orbit takes in full, so it keeps its
 *   speed down to 1000 / maxStepMs fps (longer stalls are skipped, no jump).
 * - sideFadeMs: crossfade for a tab / swipe / key with autoSides off
 *   (instant under reduced motion).
 * - swipeMinPx: a horizontal swipe on the athlete at least this long switches side.
 * - cssLinePeriodPx / cssPeriodsPerTurn: no-WebGL fallback, neon lines behind
 *   the athlete that drift sideways as the scenery orbits (one turn = this
 *   many line periods).
 */
export const STAGE_STATIC = {
  secPerTurn: 48,
  direction: 1 as 1 | -1,
  autoSides: true,
  autoFadeMs: 1200,
  turnToSideMs: 1200,
  resumeMs: 4500,
  prepNextMs: 800,
  easeMs: 1200,
  maxStepMs: 100,
  sideFadeMs: 450,
  swipeMinPx: 40,
  cssLinePeriodPx: 120,
  cssPeriodsPerTurn: 12,
};

/**
 * Shape of the 3D stage platform: "hex" (neon hexagon) or "round" (neon
 * ring: looks the same from every angle, so the turn shows only in the
 * scenery and the feet always stand in the same place on it). Same colours
 * either way. Preview the other one with ?platform=round / ?platform=hex.
 * roundSegments: smoothness of the round outline; roundInnerRings: extra
 * thin glowing rings on the round top face (share of the radius).
 */
export const STAGE_PLATFORM: "hex" | "round" = "hex";
export const STAGE_PLATFORM_ROUND = {
  roundSegments: 96,
  roundInnerRings: [0.62, 0.84] as number[],
  innerRingOpacity: 0.45,
};

/**
 * Hybrid viewer: a set with a transparent turn video (media.video) plays it
 * while the athlete auto-rotates (also while the spin eases in or out: the
 * video's playback rate follows the spin speed); any hold (hover, drag, tab,
 * key, Pause, zone card, hidden tab, offscreen) shows the frames at the same
 * angle, and the video takes over again once its frame at that angle is
 * painted. Never used under prefers-reduced-motion or Save-Data, or when the
 * auto-rotation runs the other way (a video only plays forward).
 * - startDelayMs: wait after the four side frames are ready before loading
 *   the video (they come first).
 * - firstWaitMaxMs: on page load the athlete waits (still, facing front) for
 *   the video to be playable before the first turn, at most this long after
 *   the frames are ready; then the frames turn until the video is there.
 * - minSpeedShare: the video plays while the spin runs at least this share
 *   of its full speed (lower: frames; browsers can't play slower than
 *   1/16x). rateStep: the playback rate is updated when the speed changes by
 *   more than this share.
 * - holdBackDeg: when the video is up to this far behind the stage, the
 *   stage waits for it instead of turning back.
 * - leadMs: when (re)starting, seek this far ahead of the current angle
 *   (time the seek takes), then correct the last fraction of a degree.
 * - alphaCornerMax: a corner of the first frame must be at most this opaque
 *   (0..255), else the browser shows the video without transparency (e.g.
 *   Safari with VP9) and the next source / the frames are used.
 * - stallFallbackMs: buffering longer than this switches to the frames.
 * - retryAfterMs: after a stall, try the video again this much later.
 * - swapMaxMs: on a hold the paused video stays up until the frames at that
 *   angle are drawn (no frames are decoded while the video shows), at most
 *   this long.
 * - dropCheckMs / maxDropShare / dropBadChecks: every dropCheckMs the share
 *   of dropped video frames is checked; above maxDropShare dropBadChecks
 *   times in a row (a device that really can't decode it in time) the frames
 *   take over, and the video is tried again after dropRetryMs.
 */
export const VIEWER_VIDEO = {
  enabled: true,
  startDelayMs: 0,
  firstWaitMaxMs: 6000,
  minSpeedShare: 0.1,
  rateStep: 0.02,
  holdBackDeg: 3,
  leadMs: 120,
  alphaCornerMax: 24,
  stallFallbackMs: 400,
  retryAfterMs: 5000,
  swapMaxMs: 600,
  dropCheckMs: 2000,
  maxDropShare: 0.5,
  dropBadChecks: 3,
  dropRetryMs: 30000,
};

/**
 * Turn videos shipped with the site (public/media/...), per athlete id, used
 * while the database can't hold one yet (video column + Storage). The data's
 * own video (media.video) always wins. `video` has the shape of
 * media.video: { sources: [{ file, type }], poster, feet, fps, frames, duration }
 * (feet: the soles of every video frame, so the shadows follow the video).
 * None at the moment: a transparent VP9 video decodes in software on many
 * laptops and drops frames, so Calysta's turn ships as pictures
 * (STAGE_FRAMES_BUNDLED).
 */
export const STAGE_VIDEO_BUNDLED: Record<string, { baseUrl: string; video: unknown }> = {};

export const STAGE_ARENA = {
  color: "#ff2d55",
  background: "#0d0809",
  /** Fog start/end (m from camera): far scenery fades into the background. */
  fogNear: 6,
  fogFar: 17,
  /** Horizontal camera distance from the athlete (m). */
  cameraDistanceM: 3.2,
  /** How far above the floor the camera looks down on the platform (deg). */
  cameraElevationDeg: 16,
  athleteHeightM: 1.7,
  /** Share of the photo frame height the athlete's body fills (normalized frames). */
  athleteFrameFill: 0.9,
  /** Camera turns opposite to the figure's frame order (matches the ticks). */
  orbitDirection: -1,
  platformRadiusM: 0.72,
  /**
   * Where the feet stand on the platform top, from its centre toward the
   * viewer, as a share of the top face's visible half-depth (0 = centre,
   * 1 = the front edge). A bit forward leaves lit floor visible behind the
   * shoes, which is what makes them read as standing on it. Always toward the
   * viewer, so it holds at every orbit angle. 0.55 keeps both the front
   * contact (>=16% of the top-face depth from the front edge) and the back
   * contact (>=26% from the back edge) clear of the rims in all four views,
   * measured with the two-contact (v3) feet.
   */
  feetForward: 0.55,
  /**
   * Platform top face: a visible (not black) surface, plus a soft spotlight
   * pool centred on the feet so the soles meet a lit floor instead of the dark
   * backdrop (that contrast is what makes the athlete read as standing on it).
   * poolRadius is a share of the platform radius; poolOpacity 0..1.
   */
  topFaceColor: "#3a1520",
  poolColor: "#ffd0da",
  poolRadius: 0.5,
  poolOpacity: 0.65,
  minSceneryRadiusM: 6,
  pillars: 10,
  /** Neon light frames around the stage (evenly spaced). */
  frames: 8,
  /** Far ring of slim panels, faded by the fog, so no side of the turn is empty. */
  farPanels: 16,
  farRadiusM: 13,
  /**
   * Idle turntable: the arena AND the athlete turn together. One full
   * turn per `autoRotateSecPerTurn`; direction 1 = the floor in front of the
   * athlete drifts to the right (camera orbits toward the athlete's right side),
   * -1 = the other way. Starts once the athlete photos and the arena are ready,
   * easing in/out over `autoRotateEaseMs`. Runs only while the visitor's
   * Play/Pause is on Play (a drag, tab, arrow, key, wheel or tap only holds
   * it: see VIEWER_SPIN.manualResumeMs); starts on Pause under
   * prefers-reduced-motion. `autoRotateResumeMs`: after
   * a zone card closes the spin (when on Play) resumes this much later.
   */
  autoRotateSecPerTurn: 60,
  autoRotateDirection: 1,
  autoRotateEaseMs: 1200,
  autoRotateResumeMs: 2500,
  /** Mouse leaves the athlete -> spin resumes after this (ms). */
  hoverResumeMs: 1200,
  /** The feet sink this many px into the platform surface (no antialiasing hairline). */
  footOverlapPx: 2,
  /**
   * Contact shadows, one tight ellipse under EACH sole (frame_meta / feet.json
   * soles), as fractions of the photo: width = sole span x soleShadowWidth,
   * height = soleShadowHeight of the frame height, centre raised
   * soleShadowRise above the sole bottom. A sole counts as planted when its
   * contact point lands on the platform's top face (checked against the 3D
   * camera, at least contactMarginM inside its edge); its shadow then shrinks
   * with distance like the floor does. A sole marked "lifted" in the studio,
   * or one off the platform, gets a faint, wider shadow (liftedShadow*).
   * The soft pool spans the planted soles, poolShadowHeight tall.
   */
  soleShadowWidth: 1.5,
  soleShadowHeight: 0.02,
  soleShadowRise: 0.002,
  contactMarginM: 0.02,
  /** A contact seen only at its heel/toe tip is narrow: shadows are at least this wide (share of width) before soleShadowWidth. */
  soleShadowMinSpan: 0.08,
  liftedShadowOpacity: 0.35,
  liftedShadowWidth: 1.6,
  liftedShadowHeight: 1.8,
  poolShadowHeight: 0.045,
  /**
   * The platform check (a 3D raycast per sole) is cached and redone only when
   * the leading frame changes, the stage turns more than this many degrees,
   * or the layout changes (resize / scroll).
   */
  groundRecheckDeg: 5,
  /**
   * Ignore frame-rate samples for this long after the stage starts (images and
   * fonts are still decoding then), and only switch the arena off after this
   * many slow measurement windows in a row.
   */
  qualityWarmupMs: 3000,
  slowWindowsToDisable: 2,
  /**
   * Adaptive quality while the arena turns: average FPS over `qualityWindowMs`.
   * Below `dprDropFps` the canvas drops to dpr 1; below `halfRateFps` the
   * auto-rotate draws every other frame; below `minTurnFps` (see below) the 3D
   * arena is switched off for the visit.
   */
  qualityWindowMs: 2000,
  dprDropFps: 50,
  halfRateFps: 32,
  /** Max device pixel ratio for the WebGL canvas (keeps phones smooth). */
  maxDpr: 1.75,
  /** Touch devices: lower canvas resolution and no MSAA (phones are fill-rate bound). */
  touchMaxDpr: 1.25,
  /**
   * Safety net for weak phones: if view turns render below this frame rate
   * (average over a whole turn) `slowTurnsToDisable` times, the 3D arena is
   * switched off for the visit and the light CSS ring platform is used.
   */
  minTurnFps: 24,
  slowTurnsToDisable: 2,
} as const;

/**
 * Admin 360° frame-upload rules (Build B). Frame count is flexible: the viewer
 * reads however many frames are in the DB. These bounds only validate an upload
 * so a set is neither too sparse to rotate nor absurdly large. Never hardcode in
 * the component — read from here.
 */
export const SPONSOR_360_UPLOAD = {
  bucket: "smb-athlete-360",
  /** Draft uploads + unpublished photos (admin only, read via signed URLs). */
  privateBucket: "smb-athlete-360-private",
  minFrames: 8,
  maxFrames: 36,
  maxFileMB: 5,
  acceptMime: ["image/jpeg", "image/png", "image/webp"] as const,
} as const;

/**
 * "Normalize existing set" in the studio: a frame counts as already fitted
 * (and is left as is) when its canvas matches the set, its ground line and
 * head line are within `lineTolerance` of the set median (fraction of the
 * height) and its body centre within `centreTolerance` (fraction of the
 * width; wider because the measured centre shifts with the pose).
 */
export const SET_NORMALIZE = {
  lineTolerance: 0.006,
  centreTolerance: 0.08,
} as const;

/**
 * 360 set from ONE video (admin). The video never leaves the browser: it is
 * sampled into `frames` photos evenly spaced along the turn (holds and
 * duplicate frames skipped), cut out, fitted onto the standard canvas with
 * one transform for the whole set (no per-frame jitter) and saved to the
 * draft like a bulk photo upload.
 * - source: "video" shows the video upload (and a compact studio without
 *   the frame grid); "photos" brings back the photo upload + frame grid.
 * - canvas / fit: the standard frame (476x1120) with the head and ground
 *   lines and centre of the current sets (fractions of the canvas).
 * - analysisFps / maxSamples: how densely the turn is measured.
 * - thumbW: width of the small thumbnails the turn is measured on (px).
 * - holdRelative: a change smaller than this share of the typical change
 *   between samples counts as standing still (adds no angle).
 * - background: colour distance (sum of RGB) from the corner colour above
 *   which a pixel belongs to the athlete (plain background needed).
 * - shoulderBand: rows (fraction of the body height from the head) whose
 *   silhouette width marks the side profiles: narrowest = 90° / 270°.
 * - profileDepth: a profile must be at most this share of the widest view.
 */
export const VIDEO_360 = {
  source: "video" as "video" | "photos",
  frames: 24,
  maxFileMB: 200,
  maxDurationSec: 60,
  acceptMime: ["video/mp4", "video/quicktime", "video/webm"] as const,
  canvas: { w: 476, h: 1120 },
  fit: { top: 0.066, toe: 0.964, cx: 0.5 },
  analysisFps: 15,
  maxSamples: 360,
  thumbW: 96,
  holdRelative: 0.3,
  background: 60,
  shoulderBand: [0.18, 0.3] as const,
  profileDepth: 0.8,
  /**
   * Timeline (admin): thumbnails in the strip, the step of ±1 frame (the
   * browser doesn't report a video's frame rate; 30 fps is the common
   * phone rate) and the shortest standing-still moment shown as a band (s).
   * Still = the change between thumbnails, rolling median over `stillWindow`
   * samples, below `stillRelative` x its 75th percentile (see stillBands).
   */
  timelineThumbs: 12,
  timelineFps: 30,
  stillMinSec: 0.4,
  stillWindow: 5,
  stillRelative: 0.35,
};

/**
 * Ambient motion of the neon stage (durations in seconds, intensity 0..1).
 * Kept slow/subtle ("halus & elegan"); all animation is CSS and is disabled
 * under `prefers-reduced-motion`. Exposed as CSS variables by <AthleteStage>
 * so nothing about the animation is hardcoded in the stylesheet.
 */
export const STAGE_MOTION = {
  breatheSec: 6,    // ambient glow "breathing"
  beamSec: 5.5,     // neon beams pulse
  floorSec: 22,     // perspective grid drift
  dustSec: 15,      // floating dust particles
  intensity: 1.35,  // amplitude scalar (1 = elegant, >1 = more dramatic neon)
} as const;

export function stageMotionVars(): Record<string, string> {
  return {
    "--stage-breathe": `${STAGE_MOTION.breatheSec}s`,
    "--stage-beam": `${STAGE_MOTION.beamSec}s`,
    "--stage-floor": `${STAGE_MOTION.floorSec}s`,
    "--stage-dust": `${STAGE_MOTION.dustSec}s`,
    "--stage-intensity": String(STAGE_MOTION.intensity),
  };
}

/**
 * Phones and tablets (below lg): the athlete photo also shrinks so that, with
 * the view name right under the header, the view tabs, the "View sponsors"
 * button and the carousel dots all sit above a band reserved for the browser's
 * floating bottom toolbar (iOS Safari). Everything stacked around the photo is
 * listed here (px); the photo gets 100svh minus all of it. Desktop (lg+) never
 * uses this.
 */
export const STAGE_FIT = {
  /**
   * Off: below lg the athlete keeps its full size (VIEWER_360 caps) and the
   * stage comes right after the name (see AthleteStageCard), instead of
   * shrinking the photo to fit the screen. Kept so it can be switched back on.
   */
  enabled: false,
  /** Sticky public header height without the top safe-area inset. */
  headerPx: 57,
  /** The header's own top padding, replaced by the safe-area inset when larger. */
  headerPadTopPx: 14,
  /** Stage column top padding (room for the view name): phones / sm+. */
  topPadPx: { xs: 56, sm: 40 },
  /** Stage column bottom padding (view tabs + View sponsors button). */
  bottomStackPx: 128,
  /** Card padding below the stage plus the carousel dots: phones / sm+. */
  belowStagePx: { xs: 46, sm: 54 },
  /**
   * Band kept free for the browser's floating bottom toolbar, on top of
   * env(safe-area-inset-bottom). A safe first guess: re-tune it from
   * ?debug=viewport measurements on a real iPhone.
   */
  toolbarAllowancePx: 80,
  /** Never shrink the photo below this (short landscape screens can't fit anyway). */
  minFigurePx: 240,
};

/**
 * CSS custom properties (set on the stage card) with the phone / sm+ photo
 * height budgets, in svh and — for browsers without svh — in vh.
 */
export function stageFitVars(): Record<string, string> {
  const F = STAGE_FIT;
  if (!F.enabled) return {};
  const budget = (unit: "svh" | "vh", topPad: number, below: number) =>
    `max(${F.minFigurePx}px, calc(100${unit} - (${F.headerPx - F.headerPadTopPx}px + max(${F.headerPadTopPx}px, env(safe-area-inset-top, 0px)) + ${topPad}px + ${F.bottomStackPx}px + ${below}px + ${F.toolbarAllowancePx}px + env(safe-area-inset-bottom, 0px))))`;
  return {
    "--stage-fit-xs": budget("svh", F.topPadPx.xs, F.belowStagePx.xs),
    "--stage-fit-sm": budget("svh", F.topPadPx.sm, F.belowStagePx.sm),
    "--stage-fit-xs-vh": budget("vh", F.topPadPx.xs, F.belowStagePx.xs),
    "--stage-fit-sm-vh": budget("vh", F.topPadPx.sm, F.belowStagePx.sm),
  };
}

/**
 * Inline style for the portrait athlete figure (360 viewer or fallback photo).
 * Height-capped to the viewport so the whole body fits without scrolling; width
 * follows the frame aspect ratio. Shared so the viewer and the page stay in sync.
 * Below lg the stage card also sets --stage-fit-max (see STAGE_FIT); elsewhere
 * the fallback equals maxHeightPx, so nothing changes.
 * The height itself is applied by the VIEWER_360_FRAME_CLASS rule in
 * globals.css: an inline style can't hold an @supports fallback, so the svh
 * and vh versions travel as custom properties and the class picks one.
 */
export const VIEWER_360_FRAME_CLASS = "v360-frame";
export function viewer360FrameStyle(): CSSProperties {
  const cap = (unit: "svh" | "vh", fit: string) =>
    `min(${VIEWER_360.maxHeightSvh}${unit}, ${VIEWER_360.maxHeightPx}px, var(${fit}, ${VIEWER_360.maxHeightPx}px))`;
  return {
    "--v360-h": cap("svh", "--stage-fit-max"),
    "--v360-h-vh": cap("vh", "--stage-fit-max-vh"),
    width: "auto",
    aspectRatio: "168 / 395",
    maxWidth: `min(${VIEWER_360.maxWidthPx}px, 82vw)`,
  } as CSSProperties;
}

/** Default notification toggles for a fresh platform. */
export const DEFAULT_NOTIFICATIONS = {
  new_transaction: true,
  pending_payment: true,
  weekly_summary: true,
  new_athlete_submission: true,
} as const;

export type NotificationKey = keyof typeof DEFAULT_NOTIFICATIONS;

export const NOTIFICATION_LABELS: Record<NotificationKey, string> = {
  new_transaction: "Transaksi baru",
  pending_payment: "Pembayaran pending",
  weekly_summary: "Ringkasan mingguan",
  new_athlete_submission: "Pengajuan atlet baru",
};
