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
   * No-WebGL fallback platform: tick marks on the flat CSS ring that turn with
   * the view change. `ringTurnDirection` matches the 3D arena's turn.
   */
  ringTicks: 36,
  ringTurnDirection: -1,
} as const;

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
  /** Release velocity (px/ms) that flicks to the next view even if not dragged halfway. */
  flickVelocity: 0.45,
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
   * viewer, so it holds at every orbit angle.
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
   * easing in/out over `autoRotateEaseMs`; after a swipe it resumes
   * `autoRotateResumeMs` later. Off under prefers-reduced-motion.
   */
  autoRotateSecPerTurn: 36,
  autoRotateDirection: 1,
  autoRotateEaseMs: 1200,
  autoRotateResumeMs: 2500,
  /** Mouse leaves the athlete -> spin resumes after this (ms). */
  hoverResumeMs: 1200,
  /** A tap on the athlete (phones) holds the spin on the nearest side this long (ms). */
  tapHoldMs: 5000,
  /**
   * During the slow idle spin the athlete holds one crisp photo and switches to
   * the next at mid-step with a blend this short (ms), instead of overlaying two
   * poses for the whole step (which reads as a ghost/double image). View turns
   * and swipes still blend across the step. Raise for softer switches.
   */
  idleBlendMs: 160,
  /** The feet sink this many px into the platform surface (no antialiasing hairline). */
  footOverlapPx: 2,
  /**
   * Contact shadows, one tight ellipse under each sole (from feet.json soles),
   * as fractions of the photo: width = sole span x soleShadowWidth, height =
   * soleShadowHeight of the frame height, centre raised soleShadowRise above
   * the sole bottom (negative = below, so it shows past the shoe). A shoe up to
   * raisedFootLift higher on screen than the front one is a planted back foot
   * (shadow at its sole); higher than that it is lifted mid-step (fainter,
   * wider shadow on the floor). The soft pool spans both soles,
   * poolShadowHeight tall.
   */
  soleShadowWidth: 1.5,
  soleShadowHeight: 0.02,
  soleShadowRise: 0.002,
  raisedFootLift: 0.06,
  poolShadowHeight: 0.045,
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
 * Inline style for the portrait athlete figure (360 viewer or fallback photo).
 * Height-capped to the viewport so the whole body fits without scrolling; width
 * follows the frame aspect ratio. Shared so the viewer and the page stay in sync.
 */
export function viewer360FrameStyle() {
  return {
    height: `min(${VIEWER_360.maxHeightSvh}svh, ${VIEWER_360.maxHeightPx}px)`,
    width: "auto",
    aspectRatio: "168 / 395",
    maxWidth: `min(${VIEWER_360.maxWidthPx}px, 82vw)`,
  };
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
