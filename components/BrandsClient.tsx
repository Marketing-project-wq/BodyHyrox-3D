"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { BrandRow } from "@/lib/data";
import { ACTIVE_STATUS } from "@/lib/config";
import { type Dict, tActive, fmt } from "@/lib/i18n";
import { formatIDRCompact, formatNumber } from "@/lib/format";
import { Badge, Avatar, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { createBrand, setBrandStatus } from "@/app/admin/actions";

export function BrandsClient({
  brands,
  canEdit,
  canToggle,
  m,
}: {
  brands: BrandRow[];
  canEdit: boolean;
  canToggle: boolean;
  m: Dict;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [showAdd, setShowAdd] = useState(false);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return brands.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (!term) return true;
      return b.nama.toLowerCase().includes(term) || b.kategori.toLowerCase().includes(term);
    });
  }, [brands, q, status]);

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="tabnum text-text">{formatNumber(brands.length)}</span> {m.br_registered}
        </p>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
            <Plus size={16} /> {m.br_add}
          </button>
        )}
      </div>

      {showAdd && canEdit && (
        <form action={createBrand} className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <input name="nama" required placeholder={m.br_formName} className="input" />
          <input name="kategori" required placeholder={m.br_category} className="input" />
          <select name="status" className="input" defaultValue="active">
            <option value="active">{m.active}</option>
            <option value="inactive">{m.inactive}</option>
          </select>
          <div className="sm:col-span-3">
            <button className="btn btn-primary" type="submit">{m.br_formSave}</button>
          </div>
        </form>
      )}

      {brands.length === 0 ? (
        <div className="card flex flex-1 items-center justify-center lg:min-h-0">
          <EmptyState
            title={m.br_empty}
            action={
              canEdit ? (
                <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
                  <Plus size={16} /> {m.br_add}
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={m.br_search} className="input pl-9" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="input w-auto">
          <option value="all">{m.allStatus}</option>
          <option value="active">{m.active}</option>
          <option value="inactive">{m.inactive}</option>
        </select>
      </div>

      <div className="card flex flex-col overflow-hidden lg:min-h-0 lg:flex-1">
       <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px]">
          <thead className="thead-sticky">
            <tr className="border-b border-border">
              <th className="th">{m.brand}</th>
              <th className="th text-right">{m.deal}</th>
              <th className="th text-right">{m.br_totalSpending}</th>
              <th className="th">{m.br_category}</th>
              <th className="th">{m.status}</th>
              {canToggle && <th className="th text-right">{m.action}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const next = b.status === "active" ? "inactive" : "active";
              return (
                <tr key={b.id} className="border-b border-border/60 last:border-0">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <Avatar name={b.nama} />
                      <span className="font-medium">{b.nama}</span>
                    </div>
                  </td>
                  <td className="td text-right tabnum">{formatNumber(b.dealCount)}</td>
                  <td className="td text-right tabnum">{formatIDRCompact(b.totalSpending)}</td>
                  <td className="td text-muted">{b.kategori}</td>
                  <td className="td"><Badge tone={ACTIVE_STATUS[b.status].tone}>{tActive(m, b.status)}</Badge></td>
                  {canToggle && (
                    <td className="td text-right">
                      <form action={setBrandStatus} className="inline">
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="status" value={next} />
                        <ConfirmButton
                          message={fmt(m.br_confirmToggle, {
                            action: next === "inactive" ? m.deactivate : m.activate,
                            name: b.nama,
                          })}
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
                <td colSpan={canToggle ? 6 : 5} className="td text-center text-faint">{m.br_noMatch}</td>
              </tr>
            )}
          </tbody>
        </table>
       </div>
      </div>
      </>
      )}
    </div>
  );
}
