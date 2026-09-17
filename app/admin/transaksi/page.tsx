import Link from "next/link";
import { getTransactions } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { can, TX_STATUS, type TxStatus } from "@/lib/config";
import { formatIDR, formatDayMonth, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { refundTransaction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

const CHIPS: { key: string; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "paid", label: "Paid" },
  { key: "pending", label: "Pending" },
  { key: "refunded", label: "Refunded" },
];

function monthOptions() {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const label = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(d);
    out.push({ value, label });
  }
  return out;
}

export default async function TransaksiPage({
  searchParams,
}: {
  searchParams: { status?: string; month?: string };
}) {
  const statusFilter = (searchParams.status as TxStatus | "all") ?? "all";
  const month = searchParams.month;
  const [rows, session] = await Promise.all([
    getTransactions(statusFilter === "all" ? undefined : (statusFilter as TxStatus), month),
    getSession(),
  ]);
  const canRefund = can(session?.role, "transaction.refund");
  const months = monthOptions();

  const qs = (status: string) => {
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    if (month) p.set("month", month);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Transaksi</h1>
          <p className="mt-1 text-sm text-muted">{formatNumber(rows.length)} transaksi ditampilkan</p>
        </div>
        <form className="flex items-center gap-2">
          {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
          <select name="month" defaultValue={month ?? ""} className="input w-auto">
            <option value="">Semua bulan</option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <button className="btn btn-ghost" type="submit">Terapkan</button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => {
          const active = statusFilter === c.key;
          return (
            <Link
              key={c.key}
              href={`/admin/transaksi${qs(c.key)}`}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                active
                  ? "border-accent bg-accent-soft text-text"
                  : "border-border text-muted hover:text-text"
              }`}
            >
              {c.label}
            </Link>
          );
        })}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b border-border">
              <th className="th">Brand</th>
              <th className="th">Atlet</th>
              <th className="th">Zona</th>
              <th className="th text-right">Nominal</th>
              <th className="th">Status</th>
              <th className="th text-right">Tanggal</th>
              {canRefund && <th className="th text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const st = TX_STATUS[t.status];
              return (
                <tr key={t.id} className="border-b border-border/60 last:border-0">
                  <td className="td font-medium">{t.brand}</td>
                  <td className="td text-muted">{t.athlete}</td>
                  <td className="td text-muted">{t.zone}</td>
                  <td className="td text-right tabnum">{formatIDR(t.amount)}</td>
                  <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td className="td text-right tabnum text-muted">{formatDayMonth(t.date)}</td>
                  {canRefund && (
                    <td className="td text-right">
                      {t.status !== "refunded" ? (
                        <form action={refundTransaction} className="inline">
                          <input type="hidden" name="id" value={t.id} />
                          <ConfirmButton
                            message={`Refund transaksi ${t.brand} → ${t.athlete} (${formatIDR(t.amount)})? Ini menurunkan Total revenue & Top brand, dan tidak bisa dibatalkan.`}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Refund
                          </ConfirmButton>
                        </form>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canRefund ? 7 : 6} className="td text-center text-faint">Tidak ada transaksi.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
