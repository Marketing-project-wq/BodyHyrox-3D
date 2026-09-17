"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { AthleteRow } from "@/lib/data";
import { ACTIVE_STATUS } from "@/lib/config";
import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/format";
import { Badge, Avatar } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { createAthlete, setAthleteStatus } from "@/app/admin/actions";

export function AthletesClient({
  athletes,
  canEdit,
  canToggle,
  initialQuery = "",
}: {
  athletes: AthleteRow[];
  canEdit: boolean;
  canToggle: boolean;
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [showAdd, setShowAdd] = useState(false);

  const total = athletes.length;
  const active = athletes.filter((a) => a.status === "active").length;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return athletes.filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (!term) return true;
      return (
        a.nama.toLowerCase().includes(term) ||
        a.handle.toLowerCase().includes(term) ||
        a.kota.toLowerCase().includes(term)
      );
    });
  }, [athletes, q, status]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Atlet</h1>
          <p className="mt-1 text-sm text-muted">
            {formatNumber(total)} atlet terdaftar · {formatNumber(active)} aktif
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
            <Plus size={16} /> Tambah atlet
          </button>
        )}
      </div>

      {showAdd && canEdit && (
        <form action={createAthlete} className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
          <input name="nama" required placeholder="Nama lengkap" className="input" />
          <input name="handle" required placeholder="@handle" className="input" />
          <input name="kota" required placeholder="Kota" className="input" />
          <select name="status" className="input" defaultValue="active">
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
          <div className="sm:col-span-4">
            <button className="btn btn-primary" type="submit">Simpan atlet</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama atau @handle…"
            className="input pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="input w-auto"
        >
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-border">
              <th className="th">Atlet</th>
              <th className="th text-right">Zona terjual</th>
              <th className="th text-right">Revenue</th>
              <th className="th">Kota</th>
              <th className="th">Status</th>
              {canToggle && <th className="th text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const st = ACTIVE_STATUS[a.status];
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
                  <td className="td text-right tabnum">{formatNumber(a.zonesSold)}</td>
                  <td className="td text-right tabnum">{formatIDRCompact(a.revenue)}</td>
                  <td className="td text-muted">{a.kota}</td>
                  <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                  {canToggle && (
                    <td className="td text-right">
                      <form action={setAthleteStatus} className="inline">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="status" value={next} />
                        <ConfirmButton
                          message={
                            next === "inactive"
                              ? `Nonaktifkan ${a.nama}? Zona atlet ini akan disembunyikan di halaman publik Sponsor My Body.`
                              : `Aktifkan kembali ${a.nama}?`
                          }
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
                <td colSpan={canToggle ? 6 : 5} className="td text-center text-faint">
                  Tidak ada atlet yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
