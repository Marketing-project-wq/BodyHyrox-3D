"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { ZoneRow } from "@/lib/data";
import { VISIBILITY, ZONE_STATUS } from "@/lib/config";
import { formatIDR, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { updateZonePrice, setZoneActive } from "@/app/admin/actions";

export function ZonesClient({
  zones,
  canPricing,
}: {
  zones: ZoneRow[];
  canPricing: boolean;
}) {
  const [edit, setEdit] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Harga Zona</h1>
          <p className="mt-1 text-sm text-muted">{formatNumber(zones.length)} zona tubuh</p>
        </div>
        {canPricing && (
          <button className="btn btn-ghost" onClick={() => setEdit((v) => !v)}>
            <SlidersHorizontal size={16} /> {edit ? "Selesai" : "Sesuaikan harga"}
          </button>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-border">
              <th className="th">Zona</th>
              <th className="th text-right">Harga dasar</th>
              <th className="th text-right">Terjual</th>
              <th className="th">Visibilitas</th>
              <th className="th">Status</th>
              {canPricing && <th className="th text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => {
              const st = z.active ? ZONE_STATUS.available : ZONE_STATUS.inactive;
              return (
                <tr key={z.id} className="border-b border-border/60 last:border-0">
                  <td className="td font-medium">{z.nama}</td>
                  <td className="td text-right">
                    {edit && canPricing ? (
                      <form action={updateZonePrice} className="flex items-center justify-end gap-2">
                        <input type="hidden" name="id" value={z.id} />
                        <input
                          type="number"
                          name="base_price"
                          defaultValue={z.basePrice}
                          min={0}
                          step={100000}
                          className="input w-36 text-right tabnum"
                        />
                        <button className="btn btn-primary px-3 py-1.5 text-xs" type="submit">Simpan</button>
                      </form>
                    ) : (
                      <span className="tabnum">{formatIDR(z.basePrice)}</span>
                    )}
                  </td>
                  <td className="td text-right tabnum">{formatNumber(z.sold)}</td>
                  <td className="td text-muted">{VISIBILITY[z.visibility].label}</td>
                  <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                  {canPricing && (
                    <td className="td text-right">
                      <form action={setZoneActive} className="inline">
                        <input type="hidden" name="id" value={z.id} />
                        <input type="hidden" name="active" value={z.active ? "false" : "true"} />
                        <ConfirmButton
                          message={
                            z.active
                              ? `Nonaktifkan zona ${z.nama}? Zona ini tak bisa disponsori sampai diaktifkan lagi.`
                              : `Aktifkan kembali zona ${z.nama}?`
                          }
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          {z.active ? "Nonaktifkan" : "Aktifkan"}
                        </ConfirmButton>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
