"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCw, X } from "lucide-react";
import { VIEW_KEYS, type Media360Views } from "@/lib/views";
import type { SideHotspot } from "@/lib/media360-sides";
import type { AdminZoneRow } from "@/lib/data";
import { type Dict, fmt, errorMessage } from "@/lib/i18n";
import { unwrap } from "@/lib/action-result";
import { saveDraftSides } from "@/app/atlet/[id]/media-actions";

type Point = { x: number; y: number };

/**
 * Admin: place each body zone's marker on the Depan / Kanan / Belakang / Kiri
 * photos. Markers are keyed by the photo's file and saved into the DRAFT
 * (saveDraftSides), on the photo each side uses in the draft; they go live
 * with Publish in the studio.
 */
export function AthleteZonesPlacer({
  athleteId,
  srcs,
  views,
  viewsSaved,
  zones,
  initial,
  pending: draftPending,
  m,
}: {
  athleteId: string;
  /** Image URL per frame file. */
  srcs: Record<string, string>;
  views: Media360Views;
  viewsSaved: boolean;
  zones: AdminZoneRow[];
  /** Markers keyed by frame file. */
  initial: SideHotspot[];
  /** The draft carries markers that are not published yet. */
  pending: boolean;
  m: Dict;
}) {
  const router = useRouter();
  const placeable = useMemo(() => zones.filter((z) => z.athleteZoneId), [zones]);
  const [points, setPoints] = useState<Record<string, Record<string, Point>>>(() => {
    const o: Record<string, Record<string, Point>> = {};
    for (const h of initial) o[h.athleteZoneId] = { ...h.points };
    return o;
  });
  const [view, setView] = useState(0);
  const [selected, setSelected] = useState<string | null>(placeable[0]?.athleteZoneId ?? null);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const names = [m.view_front, m.view_right, m.view_back, m.view_left];
  const file = views[VIEW_KEYS[view]];
  const zoneName = (id: string) => placeable.find((z) => z.athleteZoneId === id)?.nama ?? "";
  const onThisView = Object.entries(points).filter(([, p]) => p[file]);

  const place = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selected) {
      setError(m.m360_zones_pick);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setError(null);
    setOk(false);
    setPoints((prev) => ({
      ...prev,
      [selected]: { ...(prev[selected] ?? {}), [file]: { x: +x.toFixed(4), y: +y.toFixed(4) } },
    }));
  };

  const remove = (id: string) => {
    setOk(false);
    setPoints((prev) => {
      const next = { ...prev, [id]: { ...(prev[id] ?? {}) } };
      delete next[id][file];
      return next;
    });
  };

  const save = () => {
    setOk(false);
    setError(null);
    const payload: SideHotspot[] = Object.entries(points)
      .filter(([, p]) => Object.keys(p).length > 0)
      .map(([athleteZoneId, p]) => ({ athleteZoneId, label: zoneName(athleteZoneId), points: p }));
    start(async () => {
      try {
        unwrap(await saveDraftSides(athleteId, { hotspots: payload }));
        setOk(true);
        router.refresh();
      } catch (err) {
        setError(errorMessage(m, err));
      }
    });
  };

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-text">{m.m360_zones_title}</h2>
      <p className="mt-1 text-xs text-muted">{m.m360_zones_hint}</p>
      {!viewsSaved && <p className="mt-1 text-xs text-faint">{m.m360_zones_needViews}</p>}
      {draftPending && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{m.m360_sides_pending}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist">
        {VIEW_KEYS.map((k, i) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === i}
            onClick={() => setView(i)}
            className={`min-h-11 rounded-full px-3 py-1 text-xs font-semibold ${
              view === i ? "bg-accent text-white" : "border border-border text-muted hover:text-text"
            }`}
          >
            {names[i]}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,260px)_1fr]">
        {/* Photo: click to place the selected zone on this side */}
        <div>
          <div
            onClick={place}
            className="relative aspect-[168/395] w-full cursor-crosshair overflow-hidden rounded-lg border border-border bg-[#141414]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={srcs[file]} alt={names[view]} draggable={false} className="pointer-events-none h-full w-full object-contain" />
            {onThisView.map(([id, p]) => {
              const pt = p[file];
              const active = id === selected;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(id);
                  }}
                  title={zoneName(id)}
                  className="group absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                  style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
                >
                  <span
                    className={`block h-3.5 w-3.5 rounded-full border-2 border-white shadow ${
                      active ? "bg-[#ff2d55] ring-2 ring-[#ff2d55]/40" : "bg-[#ff2d55]/70"
                    }`}
                  />
                  <span className="pointer-events-none absolute left-1/2 top-[calc(50%+0.625rem)] -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[9px] text-white">
                    {zoneName(id)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-faint">{fmt(m.m360_zones_count, { n: onThisView.length })}</p>
        </div>

        {/* Zone list: pick which zone the next click places */}
        <div className="flex flex-col gap-1.5">
          {placeable.map((z) => {
            const id = z.athleteZoneId!;
            const here = !!points[id]?.[file];
            const active = id === selected;
            return (
              <div
                key={id}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                  active ? "border-accent bg-accent-soft" : "border-border"
                }`}
              >
                <button type="button" onClick={() => setSelected(id)} className="flex min-h-11 flex-1 items-center gap-2 text-left text-text">
                  <span className={`h-2 w-2 rounded-full ${here ? "bg-[#ff2d55]" : "bg-border"}`} />
                  {z.nama}
                </button>
                {here && (
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    aria-label={m.m360_zones_remove}
                    title={m.m360_zones_remove}
                    className="-my-1.5 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-accent hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn btn-primary disabled:opacity-50">
          {pending ? <RotateCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {m.m360_zones_save}
        </button>
        {ok && <span className="text-sm text-[#0f9d63]">{m.m360_zones_savedDraft}</span>}
      </div>
    </section>
  );
}
