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
import { getMessages, getLocale } from "@/lib/i18n-server";
import { tTxStatus } from "@/lib/i18n";
import { TX_STATUS } from "@/lib/config";
import { Badge, KpiCard, SectionCard, RevenueChart, Avatar, Bar, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

function monthLabel(iso: string, intl: string) {
  return new Intl.DateTimeFormat(intl, { month: "short", timeZone: "Asia/Jakarta" })
    .format(new Date(iso))
    .toUpperCase();
}

export default async function OverviewPage() {
  const m = getMessages();
  const intl = getLocale() === "id" ? "id-ID" : "en-US";
  const [kpis, monthly, recent, topAthletes, topBrands, events] = await Promise.all([
    getKpis(),
    getMonthlyRevenue(6),
    getRecentTransactions(20),
    getTopAthletes(5),
    getTopBrands(5),
    getUpcomingEvents(5),
  ]);

  const chart = monthly.map((mo) => ({ label: monthLabel(mo.monthStart, intl), value: mo.revenue }));
  const maxAthlete = Math.max(...topAthletes.map((a) => a.revenue), 1);

  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
      {/* KPI row */}
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={m.kpi_totalRevenue}
          value={formatIDRCompact(kpis.total_revenue)}
          delta={{ text: `${formatDelta(kpis.revenue_delta_pct)} ${m.vsLastMonth}`, tone: kpis.revenue_delta_pct >= 0 ? "up" : "down" }}
        />
        <KpiCard
          label={m.kpi_activeAthletes}
          value={formatNumber(kpis.athletes_active)}
          delta={{ text: `+${formatNumber(kpis.athletes_new_month)} ${m.thisMonthSuffix}`, tone: "neutral" }}
        />
        <KpiCard
          label={m.kpi_registeredBrands}
          value={formatNumber(kpis.brands_total)}
          delta={{ text: `+${formatNumber(kpis.brands_new_month)} ${m.thisMonthSuffix}`, tone: "neutral" }}
        />
        <KpiCard
          label={m.kpi_txThisMonth}
          value={formatNumber(kpis.tx_month)}
          delta={{ text: `${formatDelta(kpis.tx_delta_pct)} ${m.vsLastMonth}`, tone: kpis.tx_delta_pct >= 0 ? "up" : "down" }}
        />
      </div>

      {/* Row 2 — fills remaining height */}
      <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
        {/* Left (wider) */}
        <div className="flex flex-col gap-3 lg:col-span-2 lg:min-h-0">
          <SectionCard title={m.revenue6m} hint={m.inMillionRp} className="overflow-hidden lg:flex-[2] lg:min-h-0">
            <RevenueChart points={chart} emptyLabel={m.ov_noRevenue} />
          </SectionCard>

          <SectionCard
            title={m.recentTransactions}
            action={
              <Link href="/admin/transaksi" className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                {m.seeAll} <ArrowRight size={13} />
              </Link>
            }
            className="lg:flex-[3] lg:min-h-0"
            bodyClassName="p-0 overflow-x-auto"
            scrollBody
          >
            {recent.length === 0 ? (
              <EmptyState compact title={m.ov_noTx} className="h-full justify-center" />
            ) : (
            <table className="w-full min-w-[560px]">
              <thead className="thead-sticky">
                <tr className="border-b border-border">
                  <th className="th">{m.brand}</th>
                  <th className="th">{m.athlete}</th>
                  <th className="th">{m.zone}</th>
                  <th className="th text-right">{m.amount}</th>
                  <th className="th">{m.status}</th>
                  <th className="th text-right">{m.date}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} className="border-b border-border/70 last:border-0">
                    <td className="td font-medium">{t.brand}</td>
                    <td className="td text-muted">{t.athlete}</td>
                    <td className="td text-muted">{t.zone}</td>
                    <td className="td text-right tabnum">{formatIDR(t.amount)}</td>
                    <td className="td"><Badge tone={TX_STATUS[t.status].tone}>{tTxStatus(m, t.status)}</Badge></td>
                    <td className="td text-right tabnum text-muted">{formatDayMonth(t.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3 lg:min-h-0">
          <SectionCard title={m.ov_topAthletes} hint={m.ov_byRevenue} className="lg:min-h-0 lg:flex-1" scrollBody>
            {topAthletes.length === 0 ? (
              <EmptyState compact title={m.ov_noAthleteData} />
            ) : (
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
            )}
          </SectionCard>

          <SectionCard title={m.ov_topBrands} hint={m.ov_bySpending} className="lg:min-h-0 lg:flex-1" scrollBody>
            {topBrands.length === 0 ? (
              <EmptyState compact title={m.ov_noBrandData} />
            ) : (
            <ul className="space-y-2.5">
              {topBrands.map((b) => (
                <li key={b.id} className="flex items-center gap-2.5">
                  <Avatar name={b.nama} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{b.nama}</div>
                    <div className="text-[11px] tabnum text-faint">{formatNumber(b.dealCount)} {m.deal}</div>
                  </div>
                  <span className="shrink-0 text-[12px] tabnum text-muted">{formatIDRCompact(b.totalSpending)}</span>
                </li>
              ))}
            </ul>
            )}
          </SectionCard>

          <SectionCard
            title={m.ov_upcomingEvents}
            className="lg:min-h-0 lg:flex-1"
            scrollBody
            action={
              <Link href="/admin/event" className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                {m.seeAll} <ArrowRight size={13} />
              </Link>
            }
          >
            {events.length === 0 ? (
              <EmptyState compact title={m.ov_noEvents} />
            ) : (
            <ul className="space-y-2.5">
              {events.map((e) => {
                const d = new Date(e.date);
                const day = new Intl.DateTimeFormat(intl, { day: "2-digit", timeZone: "Asia/Jakarta" }).format(d);
                const mon = new Intl.DateTimeFormat(intl, { month: "short", timeZone: "Asia/Jakarta" }).format(d).toUpperCase();
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
                    <span className="shrink-0 text-[11px] tabnum text-muted">{formatNumber(e.registeredAthletes)} {m.athletesSuffix}</span>
                  </li>
                );
              })}
            </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
