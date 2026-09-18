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
    getRecentTransactions(20),
    getTopAthletes(5),
    getTopBrands(5),
    getUpcomingEvents(5),
  ]);

  const chart = monthly.map((m) => ({ label: monthLabel(m.monthStart), value: m.revenue }));
  const maxAthlete = Math.max(...topAthletes.map((a) => a.revenue), 1);

  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
      {/* KPI row */}
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Total revenue"
          value={formatIDRCompact(kpis.total_revenue)}
          delta={{ text: `${formatDelta(kpis.revenue_delta_pct)} vs bln lalu`, tone: kpis.revenue_delta_pct >= 0 ? "up" : "down" }}
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
          delta={{ text: `${formatDelta(kpis.tx_delta_pct)} vs bln lalu`, tone: kpis.tx_delta_pct >= 0 ? "up" : "down" }}
        />
      </div>

      {/* Row 2 — fills remaining height */}
      <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
        {/* Left (wider) */}
        <div className="flex flex-col gap-3 lg:col-span-2 lg:min-h-0">
          <SectionCard
            title="Revenue — 6 bulan terakhir"
            hint="juta Rupiah"
            className="lg:h-[42%] lg:shrink-0"
          >
            <RevenueChart points={chart} />
          </SectionCard>

          <SectionCard
            title="Recent Transactions"
            action={
              <Link href="/admin/transaksi" className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                Lihat semua <ArrowRight size={13} />
              </Link>
            }
            className="lg:min-h-0 lg:flex-1"
            bodyClassName="p-0 overflow-x-auto"
            scrollBody
          >
            <table className="w-full min-w-[560px]">
              <thead className="thead-sticky">
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
                    <tr key={t.id} className="border-b border-border/70 last:border-0">
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
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3 lg:min-h-0">
          <SectionCard title="Top 5 Atlet by Revenue" className="lg:min-h-0 lg:flex-1" scrollBody>
            <ul className="space-y-2.5">
              {topAthletes.map((a, i) => (
                <li key={a.id} className="flex items-center gap-2.5">
                  <span className="w-3 text-center text-[11px] font-semibold tabnum text-faint">{i + 1}</span>
                  <Avatar name={a.nama} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium">{a.nama}</span>
                      <span className="shrink-0 text-[11px] tabnum text-muted">{formatIDRCompact(a.revenue)}</span>
                    </div>
                    <Bar ratio={a.revenue / maxAthlete} />
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Top 5 Brand by Spending" className="lg:min-h-0 lg:flex-1" scrollBody>
            <ul className="space-y-2.5">
              {topBrands.map((b) => (
                <li key={b.id} className="flex items-center gap-2.5">
                  <Avatar name={b.nama} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{b.nama}</div>
                    <div className="text-[11px] tabnum text-faint">{formatNumber(b.dealCount)} deal</div>
                  </div>
                  <span className="shrink-0 text-[12px] tabnum text-muted">{formatIDRCompact(b.totalSpending)}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            title="Upcoming Events"
            className="lg:min-h-0 lg:flex-1"
            scrollBody
            action={
              <Link href="/admin/event" className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                Lihat semua <ArrowRight size={13} />
              </Link>
            }
          >
            <ul className="space-y-2.5">
              {events.map((e) => {
                const d = new Date(e.date);
                const day = new Intl.DateTimeFormat("id-ID", { day: "2-digit", timeZone: "Asia/Jakarta" }).format(d);
                const mon = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" }).format(d).toUpperCase();
                return (
                  <li key={e.id} className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-surface-2">
                      <span className="font-mono text-xs font-semibold leading-none">{day}</span>
                      <span className="text-[9px] text-faint">{mon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{e.nama}</div>
                      <div className="truncate text-[11px] text-faint">{e.venue}</div>
                    </div>
                    <span className="shrink-0 text-[11px] tabnum text-muted">{formatNumber(e.registeredAthletes)} atlet</span>
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
