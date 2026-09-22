import { db } from "./supabase";
import type { TxStatus, ActiveStatus, Visibility } from "./config";

/** PostgREST returns bigint as string; coerce to number safely. */
const n = (v: unknown): number => (v == null ? 0 : Number(v));

export type Kpis = {
  total_revenue: number;
  revenue_delta_pct: number;
  athletes_active: number;
  athletes_new_month: number;
  brands_total: number;
  brands_new_month: number;
  tx_month: number;
  tx_delta_pct: number;
};

export async function getKpis(): Promise<Kpis> {
  const { data, error } = await db().rpc("smb_kpis");
  if (error) throw error;
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    total_revenue: n(d.total_revenue),
    revenue_delta_pct: n(d.revenue_delta_pct),
    athletes_active: n(d.athletes_active),
    athletes_new_month: n(d.athletes_new_month),
    brands_total: n(d.brands_total),
    brands_new_month: n(d.brands_new_month),
    tx_month: n(d.tx_month),
    tx_delta_pct: n(d.tx_delta_pct),
  };
}

export type MonthlyPoint = { monthStart: string; revenue: number };
export async function getMonthlyRevenue(months = 6): Promise<MonthlyPoint[]> {
  const { data, error } = await db().rpc("smb_monthly_revenue", { p_months: months });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    monthStart: String(r.month_start),
    revenue: n(r.revenue),
  }));
}

export type TopAthlete = { id: string; nama: string; handle: string; revenue: number };
export async function getTopAthletes(limit = 5): Promise<TopAthlete[]> {
  const { data, error } = await db().rpc("smb_top_athletes", { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    nama: String(r.nama),
    handle: String(r.handle),
    revenue: n(r.revenue),
  }));
}

export type TopBrand = { id: string; nama: string; dealCount: number; totalSpending: number };
export async function getTopBrands(limit = 5): Promise<TopBrand[]> {
  const { data, error } = await db().rpc("smb_top_brands", { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    nama: String(r.nama),
    dealCount: n(r.deal_count),
    totalSpending: n(r.total_spending),
  }));
}

export type TxRow = {
  id: string;
  brand: string;
  athlete: string;
  handle: string;
  zone: string;
  amount: number;
  status: TxStatus;
  date: string;
};

function mapTx(r: Record<string, unknown>): TxRow {
  return {
    id: String(r.id),
    brand: String(r.brand_nama),
    athlete: String(r.athlete_nama),
    handle: String(r.athlete_handle),
    zone: String(r.zone_nama),
    amount: n(r.amount),
    status: String(r.status) as TxStatus,
    date: String(r.txn_date),
  };
}

export async function getRecentTransactions(limit = 6): Promise<TxRow[]> {
  const { data, error } = await db().rpc("smb_recent_transactions", { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map(mapTx);
}

export async function getTransactions(
  status?: TxStatus,
  month?: string,
): Promise<TxRow[]> {
  const { data, error } = await db().rpc("smb_list_transactions", {
    p_status: status ?? null,
    p_month: month ?? null,
  });
  if (error) throw error;
  return (data ?? []).map(mapTx);
}

export type Gender = "male" | "female";
export type AthleteRow = {
  id: string;
  nama: string;
  handle: string;
  kota: string;
  status: ActiveStatus;
  gender: Gender;
  revenue: number;
  zonesSold: number;
  /** How many zones this athlete has a custom (override) price on. */
  customPriceCount: number;
};
export async function getAthletes(): Promise<AthleteRow[]> {
  const { data, error } = await db().rpc("smb_list_athletes");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    nama: String(r.nama),
    handle: String(r.handle),
    kota: String(r.kota),
    status: String(r.status) as ActiveStatus,
    gender: (String(r.gender) === "female" ? "female" : "male") as Gender,
    revenue: n(r.revenue),
    zonesSold: n(r.zones_sold),
    customPriceCount: n(r.custom_price_count),
  }));
}

export type BrandRow = {
  id: string;
  nama: string;
  kategori: string;
  status: ActiveStatus;
  dealCount: number;
  totalSpending: number;
};
export async function getBrands(): Promise<BrandRow[]> {
  const { data, error } = await db().rpc("smb_list_brands");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    nama: String(r.nama),
    kategori: String(r.kategori),
    status: String(r.status) as ActiveStatus,
    dealCount: n(r.deal_count),
    totalSpending: n(r.total_spending),
  }));
}

export type ZoneRow = {
  id: string;
  nama: string;
  basePrice: number;
  visibility: Visibility;
  active: boolean;
  sold: number;
};
export async function getZones(): Promise<ZoneRow[]> {
  const { data, error } = await db().rpc("smb_list_zones");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    nama: String(r.nama),
    basePrice: n(r.base_price),
    visibility: String(r.visibility) as Visibility,
    active: Boolean(r.active),
    sold: n(r.sold),
  }));
}

export type EventRow = {
  id: string;
  nama: string;
  venue: string;
  date: string;
  registrationOpen: boolean;
  registeredAthletes: number;
};
function mapEvent(r: Record<string, unknown>): EventRow {
  return {
    id: String(r.id),
    nama: String(r.nama),
    venue: String(r.venue),
    date: String(r.event_date),
    registrationOpen: Boolean(r.registration_open),
    registeredAthletes: n(r.registered_athletes),
  };
}
export async function getEvents(): Promise<EventRow[]> {
  const { data, error } = await db()
    .from("smb_events")
    .select("*")
    .order("event_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}
export async function getUpcomingEvents(limit = 4): Promise<EventRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db()
    .from("smb_events")
    .select("*")
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

export type PlatformSettings = { nama: string; currency: string; timezone: string };
export async function getSettings(): Promise<PlatformSettings> {
  const { data, error } = await db()
    .from("smb_platform_settings")
    .select("nama,currency,timezone")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data as PlatformSettings;
}

export type NotificationSettings = {
  new_transaction: boolean;
  pending_payment: boolean;
  weekly_summary: boolean;
  new_athlete_submission: boolean;
};
export async function getNotifications(): Promise<NotificationSettings> {
  const { data, error } = await db()
    .from("smb_notification_settings")
    .select("new_transaction,pending_payment,weekly_summary,new_athlete_submission")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data as NotificationSettings;
}

/** Current display name of an admin (read live so profile edits show immediately). */
export async function getAdminName(id: string): Promise<string | null> {
  const { data } = await db()
    .from("smb_admin_users")
    .select("nama")
    .eq("id", id)
    .maybeSingle();
  return (data?.nama as string | undefined) ?? null;
}

/** Options for select inputs (create transaction form). */
export async function getSelectOptions() {
  const client = db();
  const [brands, athletes, zones] = await Promise.all([
    client.from("smb_brands").select("id,nama").eq("status", "active").order("nama"),
    client.from("smb_athletes").select("id,nama").eq("status", "active").order("nama"),
    client.from("smb_body_zones").select("id,nama").eq("active", true).order("sort_order"),
  ]);
  return {
    brands: (brands.data ?? []) as { id: string; nama: string }[],
    athletes: (athletes.data ?? []) as { id: string; nama: string }[],
    zones: (zones.data ?? []) as { id: string; nama: string }[],
  };
}

/* ---------- Public (Tampilan Atlet) — read-only, no sponsor brand exposed ---------- */
export type ZoneStatus = "tersedia" | "terisi" | "nonaktif";

export type PublicAthlete = {
  id: string;
  nama: string;
  handle: string;
  kota: string;
  gender: Gender;
  discipline: string | null;
  photoUrl: string | null;
  podiumCount: number;
  rank: number | null;
  framesPerSeason: number;
  zonesTotal: number;
  zonesAvailable: number;
};

export async function getPublicAthletes(): Promise<PublicAthlete[]> {
  const { data, error } = await db().rpc("smb_public_athletes");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    nama: String(r.nama),
    handle: String(r.handle),
    kota: String(r.kota),
    gender: (String(r.gender) === "female" ? "female" : "male") as Gender,
    discipline: r.discipline == null ? null : String(r.discipline),
    photoUrl: r.photo_url == null ? null : String(r.photo_url),
    podiumCount: n(r.podium_count),
    rank: r.rank == null ? null : n(r.rank),
    framesPerSeason: n(r.frames_per_season),
    zonesTotal: n(r.zones_total),
    zonesAvailable: n(r.zones_available),
  }));
}

export type PublicZone = {
  athleteZoneId: string;
  zoneId: string;
  nama: string;
  basePrice: number;
  exclusive: boolean;
  status: ZoneStatus;
};
export type PublicRace = {
  event: string;
  venue: string;
  date: string;
  placement: number | null;
  isPodium: boolean;
};
export type PublicAthleteDetail = Omit<PublicAthlete, "zonesTotal" | "zonesAvailable"> & {
  zones: PublicZone[];
  races: PublicRace[];
};

export async function getPublicAthlete(id: string): Promise<PublicAthleteDetail | null> {
  const { data, error } = await db().rpc("smb_public_athlete", { p_id: id });
  if (error) throw error;
  if (!data) return null;
  const d = data as Record<string, unknown>;
  const zones = (d.zones as Record<string, unknown>[] | null) ?? [];
  const races = (d.races as Record<string, unknown>[] | null) ?? [];
  return {
    id: String(d.id),
    nama: String(d.nama),
    handle: String(d.handle),
    kota: String(d.kota),
    gender: (String(d.gender) === "female" ? "female" : "male") as Gender,
    discipline: d.discipline == null ? null : String(d.discipline),
    photoUrl: d.photo_url == null ? null : String(d.photo_url),
    podiumCount: n(d.podium_count),
    rank: d.rank == null ? null : n(d.rank),
    framesPerSeason: n(d.frames_per_season),
    zones: zones.map((z) => ({
      athleteZoneId: String(z.athlete_zone_id),
      zoneId: String(z.zone_id),
      nama: String(z.nama),
      basePrice: n(z.base_price),
      exclusive: Boolean(z.exclusive),
      status: String(z.status) as ZoneStatus,
    })),
    races: races.map((r) => ({
      event: String(r.event),
      venue: String(r.venue),
      date: String(r.date),
      placement: r.placement == null ? null : n(r.placement),
      isPodium: Boolean(r.is_podium),
    })),
  };
}

/* ---------- Admin athlete editor (full detail, all statuses, all catalog zones) ---------- */
export type AdminZoneRow = {
  zoneId: string;
  nama: string;
  sortOrder: number;
  catalogPrice: number;
  catalogActive: boolean;
  athleteZoneId: string | null;
  hasRow: boolean;
  /** Effective price = override if set, else catalog (template). */
  effectivePrice: number;
  /** The per-athlete override, or null when following the template. */
  overridePrice: number | null;
  isOverride: boolean;
  active: boolean;
  exclusive: boolean;
  status: ZoneStatus | null;
};
export type AdminRaceRow = {
  id: string;
  eventId: string;
  event: string;
  venue: string;
  date: string;
  placement: number | null;
  isPodium: boolean;
};
export type AdminAthleteDetail = {
  id: string;
  nama: string;
  handle: string;
  kota: string;
  gender: Gender;
  status: ActiveStatus;
  discipline: string | null;
  photoUrl: string | null;
  podiumCount: number;
  rank: number | null;
  framesPerSeason: number;
  zones: AdminZoneRow[];
  races: AdminRaceRow[];
};
export async function getAdminAthlete(id: string): Promise<AdminAthleteDetail | null> {
  const { data, error } = await db().rpc("smb_admin_athlete", { p_id: id });
  if (error) throw error;
  if (!data) return null;
  const d = data as Record<string, unknown>;
  const zones = (d.zones as Record<string, unknown>[] | null) ?? [];
  const races = (d.races as Record<string, unknown>[] | null) ?? [];
  return {
    id: String(d.id),
    nama: String(d.nama),
    handle: String(d.handle),
    kota: String(d.kota),
    gender: (String(d.gender) === "female" ? "female" : "male") as Gender,
    status: String(d.status) as ActiveStatus,
    discipline: d.discipline == null ? null : String(d.discipline),
    photoUrl: d.photo_url == null ? null : String(d.photo_url),
    podiumCount: n(d.podium_count),
    rank: d.rank == null ? null : n(d.rank),
    framesPerSeason: n(d.frames_per_season),
    zones: zones.map((z) => ({
      zoneId: String(z.zone_id),
      nama: String(z.nama),
      sortOrder: n(z.sort_order),
      catalogPrice: n(z.catalog_price),
      catalogActive: Boolean(z.catalog_active),
      athleteZoneId: z.athlete_zone_id == null ? null : String(z.athlete_zone_id),
      hasRow: Boolean(z.has_row),
      effectivePrice: n(z.effective_price),
      overridePrice: z.override_price == null ? null : n(z.override_price),
      isOverride: Boolean(z.is_override),
      active: Boolean(z.active),
      exclusive: Boolean(z.exclusive),
      status: z.status == null ? null : (String(z.status) as ZoneStatus),
    })),
    races: races.map((r) => ({
      id: String(r.id),
      eventId: String(r.event_id),
      event: String(r.event),
      venue: String(r.venue),
      date: String(r.date),
      placement: r.placement == null ? null : n(r.placement),
      isPodium: Boolean(r.is_podium),
    })),
  };
}

export type RequestStatus = "pending" | "approved" | "rejected";
export type SponsorRequest = {
  id: string;
  status: RequestStatus;
  createdAt: string;
  reviewedAt: string | null;
  athleteId: string;
  athleteNama: string;
  zoneNama: string;
  eventNama: string | null;
  eventDate: string | null;
  company: string;
  email: string;
  note: string | null;
  basePrice: number;
};
export async function getSponsorRequests(status?: RequestStatus): Promise<SponsorRequest[]> {
  const { data, error } = await db().rpc("smb_list_sponsor_requests", { p_status: status ?? null });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    status: String(r.status) as RequestStatus,
    createdAt: String(r.created_at),
    reviewedAt: r.reviewed_at == null ? null : String(r.reviewed_at),
    athleteId: String(r.athlete_id),
    athleteNama: String(r.athlete_nama),
    zoneNama: String(r.zone_nama),
    eventNama: r.event_nama == null ? null : String(r.event_nama),
    eventDate: r.event_date == null ? null : String(r.event_date),
    company: r.applicant_company == null ? "" : String(r.applicant_company),
    email: r.applicant_email == null ? "" : String(r.applicant_email),
    note: r.note == null ? null : String(r.note),
    basePrice: n(r.base_price),
  }));
}
export async function getPendingRequestCount(): Promise<number> {
  const { count, error } = await db()
    .from("smb_sponsor_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}

export type PublicEvent = { id: string; nama: string; venue: string; date: string; isOpen: boolean };
export async function getPublicEvents(): Promise<PublicEvent[]> {
  const { data, error } = await db().rpc("smb_public_events");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    nama: String(r.nama),
    venue: String(r.venue),
    date: String(r.event_date),
    isOpen: Boolean(r.is_open),
  }));
}
