"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCw } from "lucide-react";
import { VIEW_KEYS, type Media360Views, type ViewKey } from "@/lib/views";
import { type Dict } from "@/lib/i18n";
import { setMediaViews } from "@/app/atlet/[id]/media-actions";

/**
 * Admin: pick which uploaded 360 photo shows Depan / Kanan / Belakang / Kiri on
 * the athlete page. Saved atomically (with audit) via smb_set_athlete_media_views.
 */
export function AthleteViewsPicker({
  athleteId,
  baseUrl,
  frames,
  views,
  saved,
  m,
}: {
  athleteId: string;
  baseUrl: string;
  frames: string[];
  views: Media360Views;
  /** False = nothing picked yet (the page uses evenly spaced photos). */
  saved: boolean;
  m: Dict;
}) {
  const router = useRouter();
  const [pick, setPick] = useState<Media360Views>(views);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const names: Record<ViewKey, string> = {
    front: m.view_front,
    right: m.view_right,
    back: m.view_back,
    left: m.view_left,
  };
  const base = baseUrl.replace(/\/$/, "");

  const save = () => {
    setOk(false);
    setError(null);
    start(async () => {
      try {
        await setMediaViews(athleteId, pick);
        setOk(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-text">{m.m360_views_title}</h2>
      <p className="mt-1 text-xs text-muted">{m.m360_views_hint}</p>
      {!saved && <p className="mt-1 text-xs text-faint">{m.m360_views_auto}</p>}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {VIEW_KEYS.map((k) => (
          <label key={k} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text">{names[k]}</span>
            <div className="aspect-[168/395] w-full overflow-hidden rounded-lg border border-border bg-[#141414]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${base}/${pick[k]}`} alt={names[k]} className="h-full w-full object-contain" loading="lazy" />
            </div>
            <select
              value={pick[k]}
              onChange={(e) => {
                setOk(false);
                setPick((p) => ({ ...p, [k]: e.target.value }));
              }}
              className="input text-xs"
            >
              {frames.map((f, i) => (
                <option key={f} value={f}>
                  {i + 1} · {f}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {error && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn btn-primary disabled:opacity-50">
          {pending ? <RotateCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {m.m360_views_save}
        </button>
        {ok && <span className="text-sm text-[#0f9d63]">{m.m360_views_saved}</span>}
      </div>
    </section>
  );
}
