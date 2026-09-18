"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { AthleteRow } from "@/lib/data";
import { ACTIVE_STATUS } from "@/lib/config";
import { type Dict, tActive, tGender, fmt } from "@/lib/i18n";
import { formatIDRCompact, formatNumber } from "@/lib/format";
import { Badge, Avatar } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { createAthlete, setAthleteStatus } from "@/app/admin/actions";

export function AthletesClient({
  athletes,
  canEdit,
  canToggle,
  initialQuery = "",
  m,
}: {
  athletes: AthleteRow[];
  canEdit: boolean;
  canToggle: boolean;
  initialQuery?: string;
  m: Dict;
}) {
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [showAdd, setShowAdd] = useState(false);

  const total = athletes.length;
  const active = athletes.filter((a) => a.status === "active").length;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return athletes.filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (gender !== "all" && a.gender !== gender) return false;
      if (!term) return true;
      return (
        a.nama.toLowerCase().includes(term) ||
        a.handle.toLowerCase().includes(term) ||
        a.kota.toLowerCase().includes(term)
      );
    });
  }, [athletes, q, status, gender]);

  const genderTabs: { key: "all" | "male" | "female"; label: string }[] = [
    { key: "all", label: m.allGenders },
    { key: "male", label: m.male },
    { key: "female", label: m.female },
  ];

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="tabnum text-text">{formatNumber(total)}</span> {m.ath_registered} ·{" "}
          <span className="tabnum text-text">{formatNumber(active)}</span> {m.ath_active}
        </p>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
            <Plus size={16} /> {m.ath_add}
          </button>
        )}
      </div>

      {showAdd && canEdit && (
        <form action={createAthlete} className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-5">
          <input name="nama" required placeholder={m.ath_formName} className="input" />
          <input name="handle" required placeholder={m.ath_formHandle} className="input" />
          <input name="kota" required placeholder={m.city} className="input" />
          <select name="gender" className="input" defaultValue="male">
            <option value="male">{m.male}</option>
            <option value="female">{m.female}</option>
          </select>
          <select name="status" className="input" defaultValue="active">
            <option value="active">{m.active}</option>
            <option value="inactive">{m.inactive}</option>
          </select>
          <div className="sm:col-span-5">
            <button className="btn btn-primary" type="submit">{m.ath_formSave}</button>
          </div>
        </form>
      )}

      {/* Gender separation */}
      <div className="flex flex-wrap gap-2">
        {genderTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setGender(t.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              gender === t.key ? "border-accent bg-accent-soft text-text" : "border-border text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={m.ath_search} className="input pl-9" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="input w-auto">
          <option value="all">{m.allStatus}</option>
          <option value="active">{m.active}</option>
          <option value="inactive">{m.inactive}</option>
        </select>
      </div>

      <div className="card flex flex-col overflow-hidden lg:min-h-0 lg:flex-1">
       <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[780px]">
          <thead className="thead-sticky">
            <tr className="border-b border-border">
              <th className="th">{m.athlete}</th>
              <th className="th">{m.gender}</th>
              <th className="th text-right">{m.ath_zonesSold}</th>
              <th className="th text-right">{m.col_revenue}</th>
              <th className="th">{m.city}</th>
              <th className="th">{m.status}</th>
              {canToggle && <th className="th text-right">{m.action}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const next = a.status === "active" ? "inactive" : "active";
              return (
                <tr key={a.id} className="border-b border-border/60 last:border-0">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <Avatar name={a.nama} />
                      <div>
                        <div className="font-medium">{a.nama}</div>
                        <div className="text-xs text-faint">{a.handle}</div>
                      </div>
                    </div>
                  </td>
                  <td className="td text-muted">{tGender(m, a.gender)}</td>
                  <td className="td text-right tabnum">{formatNumber(a.zonesSold)}</td>
                  <td className="td text-right tabnum">{formatIDRCompact(a.revenue)}</td>
                  <td className="td text-muted">{a.kota}</td>
                  <td className="td"><Badge tone={ACTIVE_STATUS[a.status].tone}>{tActive(m, a.status)}</Badge></td>
                  {canToggle && (
                    <td className="td text-right">
                      <form action={setAthleteStatus} className="inline">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="status" value={next} />
                        <ConfirmButton
                          message={
                            next === "inactive"
                              ? fmt(m.ath_confirmDeactivate, { name: a.nama })
                              : fmt(m.ath_confirmActivate, { name: a.nama })
                          }
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          {next === "inactive" ? m.deactivate : m.activate}
                        </ConfirmButton>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canToggle ? 7 : 6} className="td text-center text-faint">{m.ath_noMatch}</td>
              </tr>
            )}
          </tbody>
        </table>
       </div>
      </div>
    </div>
  );
}
