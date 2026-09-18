/**
 * Centralised formatting helpers. All currency/number/date formatting in the
 * app MUST go through here — never format IDR by hand in a component.
 */

import { PLATFORM } from "./config";

const idID = "id-ID";

/** "Rp 12.500.000" — full rupiah, no decimals. */
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat(idID, {
    style: "currency",
    currency: PLATFORM.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(Math.round(amount))
    .replace(/ /g, " ");
}

/**
 * Compact rupiah for KPI tiles: "Rp 2,41 M" (miliar), "Rp 148,2 jt" (juta),
 * "Rp 12,5 rb" (ribu). Uses id-ID decimal comma.
 */
export function formatIDRCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const nf = (n: number, d: number) =>
    new Intl.NumberFormat(idID, {
      minimumFractionDigits: 0,
      maximumFractionDigits: d,
    }).format(n);

  if (abs >= 1_000_000_000) return `${sign}Rp ${nf(abs / 1_000_000_000, 2)} M`;
  if (abs >= 1_000_000) return `${sign}Rp ${nf(abs / 1_000_000, 1)} jt`;
  if (abs >= 1_000) return `${sign}Rp ${nf(abs / 1_000, 1)} rb`;
  return `${sign}Rp ${nf(abs, 0)}`;
}

/** Plain grouped number: "1.234". */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat(idID).format(n);
}

/** Signed percentage for deltas: "+18,4%" / "-3,1%". */
export function formatDelta(pct: number): string {
  const nf = new Intl.NumberFormat(idID, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "always",
  });
  return `${nf.format(pct)}%`;
}

const WIB_TZ = "Asia/Jakarta";

/** "17 Sep 2026, 09:40 WIB" */
export function formatDateTimeWIB(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const s = new Intl.DateTimeFormat(idID, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: WIB_TZ,
  }).format(d);
  return `${s.replace(/\./g, ":")} WIB`;
}

/** "17 Sep" — short day + month for table cells. */
export function formatDayMonth(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(idID, {
    day: "2-digit",
    month: "short",
    timeZone: WIB_TZ,
  }).format(d);
}

/** "Sep 2026" — month pill. */
export function formatMonthYear(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(idID, {
    month: "short",
    year: "numeric",
    timeZone: WIB_TZ,
  }).format(d);
}

/** Initials for avatar chips: "Rizky Aditama" -> "RA". */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
