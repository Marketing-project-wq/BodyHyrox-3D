import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  getKpis,
  getMonthlyRevenue,
  getRecentTransactions,
  getTopAthletes,
  getTopBrands,
  getUpcomingEvents,
} from "@/lib/data";
import {
  formatIDR,
  formatIDRCompact,
  formatNumber,
  formatDelta,
  formatDateTimeWIB,
  formatMonthYear,
  formatDayMonth,
} from "@/lib/format";
import { TX_STATUS } from "@/lib/config";
import { Badge, KpiCard, SectionCard, RevenueChart, Avatar, Bar } from "@/components/ui";

export const dynamic = "force-dynamic";

function monthLabel(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" })
    .format(new Date(iso))
    .toUpperCase();
}

export default async function OverviewPage() {
  const [kpis, monthly, recent, topAthletes, topBrands, events] = await Promise.all([
    getKpis(),
    getMonthlyRevenue(6),
    getRecentTransactions(6),
    getTopAthletes(5),
    getTopBrands(5),
    getUpcomingEvents(3),
  ]);

  const now = new Date();
  const chart = monthly.map((m) => ({ label: monthLabel(m.monthStart), value: m.revenue }));
  const maxAthlete = Math.max(...topAthletes.map((a) => a.revenue), 1);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted">Data per {formatDateTimeWIB(now)}</p>
        </div>
        <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted">
          {formatMonthYear(now)}
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Total revenue"
          value={formatIDRCompact(kpis.total_revenue)}
          delta={{
            text: `${formatDelta(kpis.revenue_delta_pct)} vs bln lalu`,
            tone: kpis.revenue_delta_pct >= 0 ? "up" : "down",
          }}
        />
        <KpiCard
          label="Atlet aktif"
          value={formatNumber(kpis.athletes_active)}
          delta={{ text: `+${formatNumber(kpis.athletes_new_month)} bulan ini`, tone: "neutral" }}
        />
        <KpiCard
          label="Brand terdaftar"
          value={formatNumber(kpis.brands_total)}
          delta={{ text: `+${formatNumber(kpis.brands_new_month)} bulan ini`, tone: "neutral" }}
        />
        <KpiCard
          label="Transaksi bulan ini"
          value={formatNumber(kpis.tx_month)}
          delta={{
            text: `${formatDelta(kpis.tx_delta_pct)} vs bln lalu`,
            tone: kpis.tx_delta_pct >= 0 ? "up" : "down",
          }}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left (wider) */}
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Revenue 6 bulan terakhir" hint="dalam juta Rupiah">
            <RevenueChart points={chart} />
          </SectionCard>

          <SectionCard
            title="Transaksi terbaru"
            action={
              <Link href="/admin/transaksi" className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                Lihat semua <ArrowRight size={13} />
              </Link>
            }
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="th">Brand</th>
                    <th className="th">Atlet</th>
                    <th className="th">Zona</th>
                    <th className="th text-right">Nominal</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((t) => {
                    const st = TX_STATUS[t.status];
                    return (
                      <tr key={t.id} className="border-b border-border/60 last:border-0">
                        <td className="td font-medium">{t.brand}</td>
                        <td className="td text-muted">{t.athlete}</td>
                        <td className="td text-muted">{t.zone}</td>
                        <td className="td text-right tabnum">{formatIDR(t.amount)}</td>
                        <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                        <td className="td text-right tabnum text-muted">{formatDayMonth(t.date)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <SectionCard title="Atlet teratas" hint="by revenue">
            <ul className="space-y-3">
              {topAthletes.map((a, i) => (
                <li key={a.id} className="flex items-center gap-3">
                  <span className="w-4 text-center text-xs font-semibold tabnum text-faint">{i + 1}</span>
                  <Avatar name={a.nama} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{a.nama}</span>
                      <span className="shrink-0 text-xs tabnum text-muted">{formatIDRCompact(a.revenue)}</span>
                    </div>
                    <Bar ratio={a.revenue / maxAthlete} />
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Brand teratas" hint="by spending">
            <ul className="space-y-3">
              {topBrands.map((b) => (
                <li key={b.id} className="flex items-center gap-3">
                  <Avatar name={b.nama} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{b.nama}</div>
                    <div className="text-xs tabnum text-faint">{formatNumber(b.dealCount)} deal</div>
                  </div>
                  <span className="shrink-0 text-sm tabnum text-muted">{formatIDRCompact(b.totalSpending)}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            title="Event mendatang"
            action={
              <Link href="/admin/event" className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                Lihat semua <ArrowRight size={13} />
              </Link>
            }
          >
            <ul className="space-y-3">
              {events.map((e) => {
                const d = new Date(e.date);
                const day = new Intl.DateTimeFormat("id-ID", { day: "2-digit", timeZone: "Asia/Jakarta" }).format(d);
                const mon = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" }).format(d).toUpperCase();
                return (
                  <li key={e.id} className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-border">
                      <span className="font-display text-sm font-bold tabnum leading-none">{day}</span>
                      <span className="text-[10px] text-faint">{mon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{e.nama}</div>
                      <div className="truncate text-xs text-faint">{e.venue}</div>
                    </div>
                    <span className="shrink-0 text-xs tabnum text-muted">{formatNumber(e.registeredAthletes)} atlet</span>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
