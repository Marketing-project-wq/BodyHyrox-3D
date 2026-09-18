// Client-safe i18n: message catalog + pure helpers. No next/headers here.
import type { Role, TxStatus, ActiveStatus, Visibility } from "./config";

export type Locale = "en" | "id";
export const LOCALES: Locale[] = ["en", "id"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "smb_lang";

const en = {
  // sidebar / nav
  manage: "Manage",
  logout: "Log out",
  nav_overview: "Overview",
  nav_athletes: "Athletes",
  nav_brands: "Brands",
  nav_transactions: "Transactions",
  nav_events: "Events",
  nav_zonePricing: "Zone Pricing",
  nav_settings: "Settings",
  role_super_admin: "Super Admin",
  role_admin: "Admin",

  // common
  seeAll: "See all",
  save: "Save",
  action: "Action",
  status: "Status",
  date: "Date",
  amount: "Amount",
  brand: "Brand",
  athlete: "Athlete",
  zone: "Zone",
  city: "City",
  deal: "deal",
  allStatus: "All status",
  active: "Active",
  inactive: "Inactive",
  col_revenue: "Revenue",
  st_paid: "Paid",
  st_pending: "Pending",
  st_refunded: "Refunded",
  zst_available: "Available",
  zst_inactive: "Inactive",
  vis_high: "High",
  vis_medium: "Medium",
  vis_low: "Low",

  // overview
  kpi_totalRevenue: "Total revenue",
  kpi_activeAthletes: "Active athletes",
  kpi_registeredBrands: "Registered brands",
  kpi_txThisMonth: "Transactions this month",
  vsLastMonth: "vs last month",
  thisMonthSuffix: "this month",
  revenue6m: "Revenue — last 6 months",
  inMillionRp: "in million Rp",
  recentTransactions: "Recent Transactions",
  ov_topAthletes: "Top 5 Athletes",
  ov_byRevenue: "by revenue",
  ov_topBrands: "Top 5 Brands",
  ov_bySpending: "by spending",
  ov_upcomingEvents: "Upcoming Events",
  athletesSuffix: "athletes",

  // athletes
  ath_registered: "athletes registered",
  ath_active: "active",
  ath_add: "Add athlete",
  ath_search: "Search name or @handle…",
  ath_zonesSold: "Zones sold",
  ath_formName: "Full name",
  ath_formHandle: "@handle",
  ath_formSave: "Save athlete",
  ath_confirmDeactivate:
    "Deactivate {name}? Their zones will be hidden on the public Sponsor My Body page.",
  ath_confirmActivate: "Reactivate {name}?",
  ath_noMatch: "No athletes match.",
  deactivate: "Deactivate",
  activate: "Activate",

  // brands
  br_registered: "brands registered",
  br_add: "Add brand",
  br_search: "Search brand…",
  br_totalSpending: "Total spending",
  br_category: "Category",
  br_formName: "Brand name",
  br_formSave: "Save brand",
  br_confirmToggle: "{action} brand {name}?",
  br_noMatch: "No brands match.",

  // transactions
  tx_shown: "transactions shown",
  chip_all: "All",
  tx_allMonths: "All months",
  tx_apply: "Apply",
  refund: "Refund",
  tx_confirmRefund:
    "Refund transaction {brand} → {athlete} ({amount})? This lowers Total revenue & Top brand and cannot be undone.",
  tx_none: "No transactions.",

  // events
  ev_count: "events",
  ev_create: "Create event",
  ev_formName: "Event name",
  ev_formVenue: "Venue",
  ev_formRegistered: "Registered athletes",
  ev_regOpen: "Registration open",
  ev_regClosed: "Registration closed",
  ev_formSave: "Save event",

  // zone pricing
  zn_count: "body zones",
  zn_adjust: "Adjust prices",
  zn_done: "Done",
  zn_basePrice: "Base price",
  zn_sold: "Sold",
  zn_visibility: "Visibility",
  zn_confirmDeactivate:
    "Deactivate zone {name}? It cannot be sponsored until reactivated.",
  zn_confirmActivate: "Reactivate zone {name}?",

  // settings
  set_subtitle: "Platform profile & notification preferences",
  set_profile: "Platform profile",
  set_notifications: "Notifications",
  set_name: "Platform name",
  set_currency: "Currency",
  set_timezone: "Timezone",
  set_saveProfile: "Save profile",
  set_saveNotifications: "Save notifications",
  set_onlySuper: "Only Super Admin can change settings.",
  notif_new_transaction: "New transaction",
  notif_pending_payment: "Pending payment",
  notif_weekly_summary: "Weekly summary",
  notif_new_athlete_submission: "New athlete submission",

  // login
  login_subtitle: "3D Sponsor · Admin Panel",
  login_username: "Username",
  login_password: "Password",
  login_button: "Sign in",
  login_error: "Wrong username or password.",
  login_accessLimited: "Restricted to 20FIT admins.",
} as const;

export type Dict = Record<keyof typeof en, string>;

const id: Dict = {
  manage: "Kelola",
  logout: "Keluar",
  nav_overview: "Overview",
  nav_athletes: "Atlet",
  nav_brands: "Brand",
  nav_transactions: "Transaksi",
  nav_events: "Event",
  nav_zonePricing: "Harga Zona",
  nav_settings: "Pengaturan",
  role_super_admin: "Super Admin",
  role_admin: "Admin",

  seeAll: "Lihat semua",
  save: "Simpan",
  action: "Aksi",
  status: "Status",
  date: "Tanggal",
  amount: "Nominal",
  brand: "Brand",
  athlete: "Atlet",
  zone: "Zona",
  city: "Kota",
  deal: "deal",
  allStatus: "Semua status",
  active: "Aktif",
  inactive: "Nonaktif",
  col_revenue: "Revenue",
  st_paid: "Lunas",
  st_pending: "Tertunda",
  st_refunded: "Dikembalikan",
  zst_available: "Tersedia",
  zst_inactive: "Nonaktif",
  vis_high: "Tinggi",
  vis_medium: "Sedang",
  vis_low: "Rendah",

  kpi_totalRevenue: "Total pendapatan",
  kpi_activeAthletes: "Atlet aktif",
  kpi_registeredBrands: "Brand terdaftar",
  kpi_txThisMonth: "Transaksi bulan ini",
  vsLastMonth: "vs bln lalu",
  thisMonthSuffix: "bulan ini",
  revenue6m: "Revenue — 6 bulan terakhir",
  inMillionRp: "juta Rupiah",
  recentTransactions: "Transaksi Terbaru",
  ov_topAthletes: "Top 5 Atlet",
  ov_byRevenue: "berdasarkan revenue",
  ov_topBrands: "Top 5 Brand",
  ov_bySpending: "berdasarkan spending",
  ov_upcomingEvents: "Event Mendatang",
  athletesSuffix: "atlet",

  ath_registered: "atlet terdaftar",
  ath_active: "aktif",
  ath_add: "Tambah atlet",
  ath_search: "Cari nama atau @handle…",
  ath_zonesSold: "Zona terjual",
  ath_formName: "Nama lengkap",
  ath_formHandle: "@handle",
  ath_formSave: "Simpan atlet",
  ath_confirmDeactivate:
    "Nonaktifkan {name}? Zona atlet ini akan disembunyikan di halaman publik Sponsor My Body.",
  ath_confirmActivate: "Aktifkan kembali {name}?",
  ath_noMatch: "Tidak ada atlet yang cocok.",
  deactivate: "Nonaktifkan",
  activate: "Aktifkan",

  br_registered: "brand terdaftar",
  br_add: "Tambah brand",
  br_search: "Cari brand…",
  br_totalSpending: "Total spending",
  br_category: "Kategori",
  br_formName: "Nama brand",
  br_formSave: "Simpan brand",
  br_confirmToggle: "{action} brand {name}?",
  br_noMatch: "Tidak ada brand yang cocok.",

  tx_shown: "transaksi ditampilkan",
  chip_all: "Semua",
  tx_allMonths: "Semua bulan",
  tx_apply: "Terapkan",
  refund: "Refund",
  tx_confirmRefund:
    "Refund transaksi {brand} → {athlete} ({amount})? Ini menurunkan Total pendapatan & Top brand, dan tidak bisa dibatalkan.",
  tx_none: "Tidak ada transaksi.",

  ev_count: "event",
  ev_create: "Buat event",
  ev_formName: "Nama event",
  ev_formVenue: "Venue",
  ev_formRegistered: "Atlet terdaftar",
  ev_regOpen: "Registrasi dibuka",
  ev_regClosed: "Registrasi ditutup",
  ev_formSave: "Simpan event",

  zn_count: "zona tubuh",
  zn_adjust: "Sesuaikan harga",
  zn_done: "Selesai",
  zn_basePrice: "Harga dasar",
  zn_sold: "Terjual",
  zn_visibility: "Visibilitas",
  zn_confirmDeactivate:
    "Nonaktifkan zona {name}? Zona ini tak bisa disponsori sampai diaktifkan lagi.",
  zn_confirmActivate: "Aktifkan kembali zona {name}?",

  set_subtitle: "Profil platform & preferensi notifikasi",
  set_profile: "Profil platform",
  set_notifications: "Notifikasi",
  set_name: "Nama platform",
  set_currency: "Mata uang",
  set_timezone: "Zona waktu",
  set_saveProfile: "Simpan profil",
  set_saveNotifications: "Simpan notifikasi",
  set_onlySuper: "Hanya Super Admin yang dapat mengubah pengaturan.",
  notif_new_transaction: "Transaksi baru",
  notif_pending_payment: "Pembayaran pending",
  notif_weekly_summary: "Ringkasan mingguan",
  notif_new_athlete_submission: "Pengajuan atlet baru",

  login_subtitle: "3D Sponsor · Panel Admin",
  login_username: "Username",
  login_password: "Password",
  login_button: "Masuk",
  login_error: "Username atau password salah.",
  login_accessLimited: "Akses terbatas untuk admin 20FIT.",
};

export const messages: Record<Locale, Dict> = { en, id };

export function getDict(locale: Locale): Dict {
  return messages[locale] ?? messages[DEFAULT_LOCALE];
}

/** Simple {placeholder} interpolation. */
export function fmt(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

export const tRole = (m: Dict, r: Role) =>
  r === "super_admin" ? m.role_super_admin : m.role_admin;
export const tTxStatus = (m: Dict, s: TxStatus) =>
  s === "paid" ? m.st_paid : s === "pending" ? m.st_pending : m.st_refunded;
export const tActive = (m: Dict, s: ActiveStatus) =>
  s === "active" ? m.active : m.inactive;
export const tZoneStatus = (m: Dict, activeState: boolean) =>
  activeState ? m.zst_available : m.zst_inactive;
export const tVisibility = (m: Dict, v: Visibility) =>
  v === "high" ? m.vis_high : v === "medium" ? m.vis_medium : m.vis_low;
export const tNotif = (m: Dict, key: string) =>
  key === "new_transaction"
    ? m.notif_new_transaction
    : key === "pending_payment"
      ? m.notif_pending_payment
      : key === "weekly_summary"
        ? m.notif_weekly_summary
        : m.notif_new_athlete_submission;
