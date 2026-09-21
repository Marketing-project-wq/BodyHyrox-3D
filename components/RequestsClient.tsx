"use client";

import { useMemo, useState } from "react";
import type { SponsorRequest, RequestStatus } from "@/lib/data";
import { type Dict, type Locale, fmt } from "@/lib/i18n";
import type { BadgeTone } from "@/lib/config";
import { formatIDR, formatNumber, formatDayMonth } from "@/lib/format";
import { Badge } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { reviewRequest } from "@/app/admin/actions";

const TONE: Record<RequestStatus, BadgeTone> = {
  pending: "amber",
  approved: "green",
  rejected: "gray",
};

export function RequestsClient({
  requests,
  canReview,
  m,
}: {
  requests: SponsorRequest[];
  canReview: boolean;
  m: Dict;
  locale: Locale;
}) {
  const [filter, setFilter] = useState<"all" | RequestStatus>("pending");

  const label: Record<RequestStatus, string> = {
    pending: m.rq_pending,
    approved: m.rq_approved,
    rejected: m.rq_rejected,
  };

  const rows = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter],
  );
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const tabs: { key: "all" | RequestStatus; label: string; badge?: number }[] = [
    { key: "pending", label: m.rq_pending, badge: pendingCount },
    { key: "approved", label: m.rq_approved },
    { key: "rejected", label: m.rq_rejected },
    { key: "all", label: m.rq_all },
  ];

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      <div>
        <p className="text-sm text-muted">{m.rq_subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              filter === t.key ? "border-accent bg-accent-soft text-text" : "border-border text-muted hover:text-text"
            }`}
          >
            {t.label}
            {t.badge ? <span className="ml-1.5 tabnum text-accent">{formatNumber(t.badge)}</span> : null}
          </button>
        ))}
      </div>

      <div className="card flex flex-col overflow-hidden lg:min-h-0 lg:flex-1">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[860px]">
            <thead className="thead-sticky">
              <tr className="border-b border-border">
                <th className="th">{m.rq_brand}</th>
                <th className="th">{m.rq_athlete}</th>
                <th className="th">{m.rq_zone}</th>
                <th className="th">{m.rq_event}</th>
                <th className="th text-right">{m.rq_price}</th>
                <th className="th">{m.rq_submitted}</th>
                <th className="th">{m.status}</th>
                {canReview && <th className="th text-right">{m.action}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0 align-top">
                  <td className="td">
                    <div className="font-medium">{r.company}</div>
                    <div className="text-xs text-faint">{r.email}</div>
                    {r.note && <div className="mt-1 max-w-[220px] text-xs text-muted">“{r.note}”</div>}
                  </td>
                  <td className="td text-muted">{r.athleteNama}</td>
                  <td className="td">{r.zoneNama}</td>
                  <td className="td text-muted">{r.eventNama ?? "—"}</td>
                  <td className="td text-right tabnum">{formatIDR(r.basePrice)}</td>
                  <td className="td tabnum text-muted">{formatDayMonth(r.createdAt)}</td>
                  <td className="td"><Badge tone={TONE[r.status]}>{label[r.status]}</Badge></td>
                  {canReview && (
                    <td className="td text-right">
                      {r.status === "pending" ? (
                        <div className="flex justify-end gap-3">
                          <form action={reviewRequest} className="inline">
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="action" value="approve" />
                            <ConfirmButton
                              message={fmt(m.rq_confirmApprove, {
                                company: r.company,
                                zone: r.zoneNama,
                                athlete: r.athleteNama,
                              })}
                              className="text-xs font-medium text-green hover:underline"
                            >
                              {m.rq_approve}
                            </ConfirmButton>
                          </form>
                          <form action={reviewRequest} className="inline">
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="action" value="reject" />
                            <ConfirmButton
                              message={fmt(m.rq_confirmReject, { company: r.company })}
                              className="text-xs font-medium text-accent hover:underline"
                            >
                              {m.rq_reject}
                            </ConfirmButton>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canReview ? 8 : 7} className="td text-center text-faint">{m.rq_none}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
