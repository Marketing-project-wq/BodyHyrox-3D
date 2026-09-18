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
  | "settings.manage";

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
