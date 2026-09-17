"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { EventRow } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui";
import { createEvent } from "@/app/admin/actions";

export function EventsClient({
  events,
  canManage,
}: {
  events: EventRow[];
  canManage: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Event</h1>
          <p className="mt-1 text-sm text-muted">{formatNumber(events.length)} event</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
            <Plus size={16} /> Buat event
          </button>
        )}
      </div>

      {showAdd && canManage && (
        <form action={createEvent} className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <input name="nama" required placeholder="Nama event" className="input" />
          <input name="venue" required placeholder="Venue" className="input" />
          <input name="event_date" required type="date" className="input" />
          <input name="registered" type="number" min={0} defaultValue={0} placeholder="Atlet terdaftar" className="input" />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="registration_open" value="true" defaultChecked /> Registrasi dibuka
          </label>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" type="submit">Simpan event</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((e) => {
          const d = new Date(e.date);
          const day = new Intl.DateTimeFormat("id-ID", { day: "2-digit", timeZone: "Asia/Jakarta" }).format(d);
          const mon = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" }).format(d).toUpperCase();
          const year = new Intl.DateTimeFormat("id-ID", { year: "numeric", timeZone: "Asia/Jakarta" }).format(d);
          return (
            <div key={e.id} className="card p-4">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-card border border-border bg-surface-2">
                  <span className="font-display text-xl font-bold tabnum leading-none">{day}</span>
                  <span className="text-[11px] text-faint">{mon} {year}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-display text-base font-semibold">{e.nama}</h3>
                  <p className="truncate text-sm text-faint">{e.venue}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {e.registrationOpen ? (
                      <Badge tone="green">Registrasi dibuka</Badge>
                    ) : (
                      <Badge tone="gray">Registrasi ditutup</Badge>
                    )}
                    <span className="text-sm tabnum text-muted">{formatNumber(e.registeredAthletes)} atlet</span>
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
