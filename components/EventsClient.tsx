"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { EventRow } from "@/lib/data";
import { type Dict, type Locale } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui";
import { createEvent } from "@/app/admin/actions";

export function EventsClient({
  events,
  canManage,
  m,
  locale,
}: {
  events: EventRow[];
  canManage: boolean;
  m: Dict;
  locale: Locale;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const intl = locale === "id" ? "id-ID" : "en-US";

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="tabnum text-text">{formatNumber(events.length)}</span> {m.ev_count}
        </p>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
            <Plus size={16} /> {m.ev_create}
          </button>
        )}
      </div>

      {showAdd && canManage && (
        <form action={createEvent} className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <input name="nama" required placeholder={m.ev_formName} className="input" />
          <input name="venue" required placeholder={m.ev_formVenue} className="input" />
          <input name="event_date" required type="date" className="input" />
          <input name="registered" type="number" min={0} defaultValue={0} placeholder={m.ev_formRegistered} className="input" />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="registration_open" value="true" defaultChecked /> {m.ev_regOpen}
          </label>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" type="submit">{m.ev_formSave}</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:min-h-0 lg:flex-1 lg:content-start lg:overflow-y-auto lg:pr-1">
        {events.map((e) => {
          const d = new Date(e.date);
          const day = new Intl.DateTimeFormat(intl, { day: "2-digit", timeZone: "Asia/Jakarta" }).format(d);
          const mon = new Intl.DateTimeFormat(intl, { month: "short", timeZone: "Asia/Jakarta" }).format(d).toUpperCase();
          const year = new Intl.DateTimeFormat(intl, { year: "numeric", timeZone: "Asia/Jakarta" }).format(d);
          return (
            <div key={e.id} className="card p-4">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-card border border-border bg-surface-2">
                  <span className="font-mono text-xl font-bold leading-none">{day}</span>
                  <span className="text-[11px] text-faint">{mon} {year}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-semibold">{e.nama}</h3>
                  <p className="truncate text-sm text-faint">{e.venue}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {e.registrationOpen ? (
                      <Badge tone="green">{m.ev_regOpen}</Badge>
                    ) : (
                      <Badge tone="gray">{m.ev_regClosed}</Badge>
                    )}
                    <span className="text-sm tabnum text-muted">{formatNumber(e.registeredAthletes)} {m.athletesSuffix}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
