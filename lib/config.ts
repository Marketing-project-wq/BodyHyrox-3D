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
  | "request.review";

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
  /** Horizontal drag distance (px) for one full rotation. Lower = more sensitive. */
  dragFullTurnPx: 340,
  /** Velocity multiplier applied each animation frame after release (0..1). Higher = longer glide. */
  momentumFriction: 0.94,
  /** Momentum stops when |velocity| drops below this (frames per ms). */
  momentumStopThreshold: 0.0006,
  /** Window (ms) used to estimate release velocity from recent pointer samples. */
  velocitySampleMs: 90,
  /**
   * How quickly the rendered position eases toward the target each ~16.7ms
   * frame (0..1). Higher = tighter to the finger; lower = silkier glide.
   * Runs every frame via requestAnimationFrame so motion stays fluid
   * regardless of how often pointer events fire.
   */
  followPerFrame: 0.4,
  /** Rendered position snaps to target once within this many frames (ends the loop). */
  settleEpsilon: 0.002,
  /**
   * Blend the two nearest frames by the fractional position (smooths rotation).
   * With aligned frames this reads as rotation; set false for a crisp hard-swap.
   */
  crossfade: true,
  /**
   * When motion stops, ease onto the nearest whole frame (a soft detent) so the
   * figure rests on one crisp frame instead of a blended half-frame.
   */
  snapOnSettle: true,
  /**
   * On-screen size of the athlete figure inside the full-screen stage. Height
   * is capped to a share of the viewport so the whole body (head to feet) fits;
   * width follows from the frame's aspect ratio. `maxWidthPx` keeps it from
   * getting too wide on tall/narrow phones. Tune here — never hardcode.
   */
  maxHeightSvh: 60,
  maxHeightPx: 560,
  maxWidthPx: 300,
} as const;

/**
 * Ambient motion of the neon stage (durations in seconds, intensity 0..1).
 * Kept slow/subtle ("halus & elegan"); all animation is CSS and is disabled
 * under `prefers-reduced-motion`. Exposed as CSS variables by <AthleteStage>
 * so nothing about the animation is hardcoded in the stylesheet.
 */
export const STAGE_MOTION = {
  breatheSec: 7,   // ambient glow "breathing"
  beamSec: 6.5,    // neon beams pulse
  floorSec: 24,    // perspective grid drift
  dustSec: 16,     // floating dust particles
  intensity: 1,    // amplitude scalar (1 = elegant default)
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
