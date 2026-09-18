import Link from "next/link";
import { getTransactions } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { can, TX_STATUS, type TxStatus } from "@/lib/config";
import { getMessages, getLocale } from "@/lib/i18n-server";
import { tTxStatus, fmt } from "@/lib/i18n";
import { formatIDR, formatDayMonth, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { refundTransaction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

function monthOptions(intl: string) {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const label = new Intl.DateTimeFormat(intl, { month: "long", year: "numeric" }).format(d);
    out.push({ value, label });
  }
  return out;
}

export default async function TransaksiPage({
  searchParams,
}: {
  searchParams: { status?: string; month?: string };
}) {
  const m = getMessages();
  const locale = getLocale();
  const intl = locale === "id" ? "id-ID" : "en-US";
  const statusFilter = (searchParams.status as TxStatus | "all") ?? "all";
  const month = searchParams.month;
  const [rows, session] = await Promise.all([
    getTransactions(statusFilter === "all" ? undefined : (statusFilter as TxStatus), month),
    getSession(),
  ]);
  const canRefund = can(session?.role, "transaction.refund");
  const months = monthOptions(intl);

  const chips: { key: string; label: string }[] = [
    { key: "all", label: m.chip_all },
    { key: "paid", label: m.st_paid },
    { key: "pending", label: m.st_pending },
    { key: "refunded", label: m.st_refunded },
  ];

  const qs = (status: string) => {
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    if (month) p.set("month", month);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="tabnum text-text">{formatNumber(rows.length)}</span> {m.tx_shown}
        </p>
        <form className="flex items-center gap-2">
          {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
          <select name="month" defaultValue={month ?? ""} className="input w-auto">
            <option value="">{m.tx_allMonths}</option>
            {months.map((mo) => (
              <option key={mo.value} value={mo.value}>{mo.label}</option>
            ))}
          </select>
          <button className="btn btn-ghost" type="submit">{m.tx_apply}</button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const activeChip = statusFilter === c.key;
          return (
            <Link
              key={c.key}
              href={`/admin/transaksi${qs(c.key)}`}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                activeChip ? "border-accent bg-accent-soft text-text" : "border-border text-muted hover:text-text"
              }`}
            >
              {c.label}
            </Link>
          );
        })}
      </div>

      <div className="card flex flex-col overflow-hidden lg:min-h-0 lg:flex-1">
       <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[820px]">
          <thead className="thead-sticky">
            <tr className="border-b border-border">
              <th className="th">{m.brand}</th>
              <th className="th">{m.athlete}</th>
              <th className="th">{m.zone}</th>
              <th className="th text-right">{m.amount}</th>
              <th className="th">{m.status}</th>
              <th className="th text-right">{m.date}</th>
              {canRefund && <th className="th text-right">{m.action}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-border/60 last:border-0">
                <td className="td font-medium">{t.brand}</td>
                <td className="td text-muted">{t.athlete}</td>
                <td className="td text-muted">{t.zone}</td>
                <td className="td text-right tabnum">{formatIDR(t.amount)}</td>
                <td className="td"><Badge tone={TX_STATUS[t.status].tone}>{tTxStatus(m, t.status)}</Badge></td>
                <td className="td text-right tabnum text-muted">{formatDayMonth(t.date)}</td>
                {canRefund && (
                  <td className="td text-right">
                    {t.status !== "refunded" ? (
                      <form action={refundTransaction} className="inline">
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmButton
                          message={fmt(m.tx_confirmRefund, {
                            brand: t.brand,
                            athlete: t.athlete,
                            amount: formatIDR(t.amount),
                          })}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          {m.refund}
                        </ConfirmButton>
                      </form>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canRefund ? 7 : 6} className="td text-center text-faint">{m.tx_none}</td>
              </tr>
            )}
          </tbody>
        </table>
       </div>
      </div>
    </div>
  );
}
