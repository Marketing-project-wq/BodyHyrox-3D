"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { ZoneRow } from "@/lib/data";
import { ZONE_STATUS } from "@/lib/config";
import { type Dict, tZoneStatus, tVisibility, fmt } from "@/lib/i18n";
import { formatIDR, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { updateZonePrice, setZoneActive } from "@/app/admin/actions";

export function ZonesClient({
  zones,
  canPricing,
  m,
}: {
  zones: ZoneRow[];
  canPricing: boolean;
  m: Dict;
}) {
  const [edit, setEdit] = useState(false);

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="tabnum text-text">{formatNumber(zones.length)}</span> {m.zn_count}
        </p>
        {canPricing && (
          <button className="btn btn-ghost" onClick={() => setEdit((v) => !v)}>
            <SlidersHorizontal size={16} /> {edit ? m.zn_done : m.zn_adjust}
          </button>
        )}
      </div>

      <div className="card flex flex-col overflow-hidden lg:min-h-0 lg:flex-1">
       <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[760px]">
          <thead className="thead-sticky">
            <tr className="border-b border-border">
              <th className="th">{m.zone}</th>
              <th className="th text-right">{m.zn_basePrice}</th>
              <th className="th text-right">{m.zn_sold}</th>
              <th className="th">{m.zn_visibility}</th>
              <th className="th">{m.status}</th>
              {canPricing && <th className="th text-right">{m.action}</th>}
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
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
                      <button className="btn btn-primary px-3 py-1.5 text-xs" type="submit">{m.save}</button>
                    </form>
                  ) : (
                    <span className="tabnum">{formatIDR(z.basePrice)}</span>
                  )}
                </td>
                <td className="td text-right tabnum">{formatNumber(z.sold)}</td>
                <td className="td text-muted">{tVisibility(m, z.visibility)}</td>
                <td className="td"><Badge tone={z.active ? ZONE_STATUS.available.tone : ZONE_STATUS.inactive.tone}>{tZoneStatus(m, z.active)}</Badge></td>
                {canPricing && (
                  <td className="td text-right">
                    <form action={setZoneActive} className="inline">
                      <input type="hidden" name="id" value={z.id} />
                      <input type="hidden" name="active" value={z.active ? "false" : "true"} />
                      <ConfirmButton
                        message={
                          z.active
                            ? fmt(m.zn_confirmDeactivate, { name: z.nama })
                            : fmt(m.zn_confirmActivate, { name: z.nama })
                        }
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        {z.active ? m.deactivate : m.activate}
                      </ConfirmButton>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
       </div>
      </div>
    </div>
  );
}
