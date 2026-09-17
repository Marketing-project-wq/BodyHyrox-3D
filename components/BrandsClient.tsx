"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { BrandRow } from "@/lib/data";
import { ACTIVE_STATUS } from "@/lib/config";
import { formatIDRCompact, formatNumber } from "@/lib/format";
import { Badge, Avatar } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { createBrand, setBrandStatus } from "@/app/admin/actions";

export function BrandsClient({
  brands,
  canEdit,
  canToggle,
}: {
  brands: BrandRow[];
  canEdit: boolean;
  canToggle: boolean;
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Brand</h1>
          <p className="mt-1 text-sm text-muted">{formatNumber(brands.length)} brand terdaftar</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
            <Plus size={16} /> Tambah brand
          </button>
        )}
      </div>

      {showAdd && canEdit && (
        <form action={createBrand} className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <input name="nama" required placeholder="Nama brand" className="input" />
          <input name="kategori" required placeholder="Kategori" className="input" />
          <select name="status" className="input" defaultValue="active">
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
          <div className="sm:col-span-3">
            <button className="btn btn-primary" type="submit">Simpan brand</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari brand…" className="input pl-9" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="input w-auto">
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-border">
              <th className="th">Brand</th>
              <th className="th text-right">Deal</th>
              <th className="th text-right">Total spending</th>
              <th className="th">Kategori</th>
              <th className="th">Status</th>
              {canToggle && <th className="th text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const st = ACTIVE_STATUS[b.status];
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
                  <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                  {canToggle && (
                    <td className="td text-right">
                      <form action={setBrandStatus} className="inline">
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="status" value={next} />
                        <ConfirmButton
                          message={`${next === "inactive" ? "Nonaktifkan" : "Aktifkan"} brand ${b.nama}?`}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          {next === "inactive" ? "Nonaktifkan" : "Aktifkan"}
                        </ConfirmButton>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canToggle ? 6 : 5} className="td text-center text-faint">Tidak ada brand yang cocok.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
