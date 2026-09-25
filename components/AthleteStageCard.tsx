"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type { PublicAthleteDetail } from "@/lib/data";
import { viewer360FrameStyle } from "@/lib/config";
import { type Dict } from "@/lib/i18n";
import { tGender } from "@/lib/i18n";
import { initials } from "@/lib/format";
import { Viewer360 } from "@/components/Viewer360";

type NeighborLink = { id: string; nama: string } | null;

export function AthleteStageCard({
  athlete,
  prev,
  next,
  dots,
  locale,
  m,
}: {
  athlete: PublicAthleteDetail;
  prev: NeighborLink;
  next: NeighborLink;
  dots: { id: string; active: boolean }[];
  locale: "en" | "id";
  m: Dict;
}) {
  const intl = locale === "id" ? "id-ID" : "en-US";
  const has360 = !!athlete.media360 && athlete.media360.frames.length > 0;
  const total = has360 ? athlete.media360!.frames.length : 0;

  // Live rotation angle for the top-right readout (0° at the first frame).
  const [frame, setFrame] = useState(1);
  const angle = total > 0 ? Math.round(((frame - 1) / total) * 360) % 360 : 0;

  // Medal breakdown derived from real race placements (never fabricated).
  const medals = useMemo(() => {
    const acc = { gold: 0, silver: 0, bronze: 0 };
    for (const r of athlete.races) {
      if (r.placement === 1) acc.gold += 1;
      else if (r.placement === 2) acc.silver += 1;
      else if (r.placement === 3) acc.bronze += 1;
    }
    return acc;
  }, [athlete.races]);
  const hasMedals = medals.gold + medals.silver + medals.bronze > 0;

  const num = (v: number, max = 1) =>
    new Intl.NumberFormat(intl, { maximumFractionDigits: max }).format(v);

  // Only stat cells with real data are rendered.
  const statCells: { label: string; value: string; note?: string | null }[] = [];
  if (athlete.beratKg != null) statCells.push({ label: m.sc_weight, value: `${num(athlete.beratKg)} ${m.sc_unitKg}` });
  if (athlete.tinggiCm != null) statCells.push({ label: m.sc_height, value: `${num(athlete.tinggiCm)} ${m.sc_unitCm}` });
  if (athlete.usia != null) statCells.push({ label: m.sc_age, value: `${num(athlete.usia)} ${m.sc_unitYr}` });
  if (athlete.framesPerSeason > 0)
    statCells.push({ label: m.sc_seasonEvents, value: `${num(athlete.framesPerSeason)} ${m.sc_eventUnit}` });

  const figureStyle = viewer360FrameStyle();

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#100a0c] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
      {/* Ambient red wash + vignette across the whole card */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(620px 520px at 62% 42%, rgba(255,45,85,0.22), transparent 70%), radial-gradient(130% 100% at 50% 45%, transparent 55%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      <div className="relative z-10 grid gap-4 p-5 sm:p-7 lg:grid-cols-[minmax(0,340px)_1fr] lg:gap-6">
        {/* ------------------------------------------------- LEFT: identity + stats */}
        <div className="flex flex-col">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-sm text-[#ff2d55]">
              {athlete.rank != null ? String(athlete.rank).padStart(2, "0") : "--"}
            </span>
            <h1 className="font-condensed text-4xl font-bold uppercase leading-[0.92] sm:text-5xl">{athlete.nama}</h1>
          </div>
          <p className="mt-1.5 text-sm text-white/55">
            {[athlete.discipline ?? tGender(m, athlete.gender), athlete.kota].filter(Boolean).join(" · ")}
          </p>

          {/* Podium + medal breakdown */}
          <div className="mt-6 flex items-start gap-6">
            <div>
              <div className="font-condensed text-5xl font-bold leading-none">{num(athlete.podiumCount, 0)}</div>
              <div className="eyebrow mt-1 text-white/45">{m.sc_podiumSeason}</div>
            </div>
            {hasMedals && (
              <ul className="mt-1 flex flex-col gap-1.5 font-mono text-xs text-white/70">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#e8c15a" }} />
                  {num(medals.gold, 0)} {m.sc_gold}
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#c9ccd3" }} />
                  {num(medals.silver, 0)} {m.sc_silver}
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#c38a5c" }} />
                  {num(medals.bronze, 0)} {m.sc_bronze}
                </li>
              </ul>
            )}
          </div>

          {/* Profile stat grid (only filled cells) */}
          {(statCells.length > 0 || athlete.totalTerbaikKg != null) && (
            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4">
              {statCells.map((c) => (
                <div key={c.label}>
                  <div className="eyebrow text-white/45">{c.label}</div>
                  <div className="mt-0.5 font-condensed text-2xl font-bold">{c.value}</div>
                </div>
              ))}
              {athlete.totalTerbaikKg != null && (
                <div className="col-span-2">
                  <div className="eyebrow text-white/45">{m.sc_bestTotal}</div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="font-condensed text-2xl font-bold">
                      {num(athlete.totalTerbaikKg)} {m.sc_unitKg}
                    </span>
                    {athlete.totalTerbaikLabel && (
                      <span className="font-mono text-xs text-[#ff2d55]">{athlete.totalTerbaikLabel}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Athlete carousel dots (desktop pinned to bottom of the left column) */}
          {dots.length > 1 && (
            <div className="mt-8 hidden flex-wrap items-center gap-1.5 lg:flex">
              {dots.map((d) =>
                d.active ? (
                  <span key={d.id} className="h-1.5 w-5 rounded-full bg-[#ff2d55]" aria-current="true" />
                ) : (
                  <Link
                    key={d.id}
                    href={`/atlet/${d.id}`}
                    className="h-1.5 w-1.5 rounded-full bg-white/25 transition-colors hover:bg-white/50"
                    aria-label={m.sc_next}
                  />
                ),
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------- RIGHT: 360 stage */}
        <div className="relative flex min-h-[56vh] items-center justify-center pt-10 lg:min-h-[72vh] lg:pt-0">
          {/* Stage backdrops (spotlight cone + neon platform), centered on the figure */}
          <div className="stagecard-spot" aria-hidden />
          <div className="stagecard-ring-outer" aria-hidden />
          <div className="stagecard-ring" aria-hidden />
          <div className="stagecard-floorglow" aria-hidden />

          {/* Angle readout + hint (top-right of the stage) */}
          {has360 && (
            <div className="pointer-events-none absolute right-1 top-0 z-20 text-right">
              <div className="font-condensed text-4xl font-bold leading-none sm:text-5xl">{`${angle}°`}</div>
              <p className="mt-1 hidden max-w-[15rem] font-mono text-[11px] leading-snug text-white/45 sm:block">
                {m.sc_hint}
              </p>
            </div>
          )}

          {/* The figure */}
          <div className="relative mx-auto w-full" style={{ maxWidth: "min(300px, 78vw)" }}>
            {has360 ? (
              <Viewer360
                athleteId={athlete.id}
                media={athlete.media360!}
                m={m}
                onFrameChange={(f) => setFrame(f)}
                chrome={false}
              />
            ) : (
              <div className="relative mx-auto" style={figureStyle}>
                <div className="stage-contact" aria-hidden />
                {athlete.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={athlete.photoUrl}
                    alt={athlete.nama}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center font-condensed text-6xl font-bold text-white/20">
                    {initials(athlete.nama)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* View sponsors CTA (bottom-center) */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center">
            <a
              href="#zona-sponsor"
              className="rounded-full bg-[#ff2d55] px-8 py-3 text-sm font-semibold text-white shadow-[0_0_26px_rgba(255,45,85,0.45)] transition-colors hover:bg-[#e42648]"
            >
              {m.pub_viewSponsors}
            </a>
          </div>
        </div>
      </div>

      {/* Carousel arrows (card edges, vertically centered) */}
      {prev && (
        <Link
          href={`/atlet/${prev.id}`}
          aria-label={`${m.sc_prev}: ${prev.nama}`}
          className="absolute left-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/80 backdrop-blur transition-colors hover:border-white/40 hover:text-white sm:left-5"
        >
          <ChevronLeft size={20} />
        </Link>
      )}
      {next && (
        <Link
          href={`/atlet/${next.id}`}
          aria-label={`${m.sc_next}: ${next.nama}`}
          className="absolute right-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/80 backdrop-blur transition-colors hover:border-white/40 hover:text-white sm:right-5"
        >
          <ChevronRight size={20} />
        </Link>
      )}

      {/* Dots on mobile (below the stage, centered) */}
      {dots.length > 1 && (
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-1.5 pb-5 lg:hidden">
          {dots.map((d) =>
            d.active ? (
              <span key={d.id} className="h-1.5 w-5 rounded-full bg-[#ff2d55]" aria-current="true" />
            ) : (
              <Link key={d.id} href={`/atlet/${d.id}`} className="h-1.5 w-1.5 rounded-full bg-white/25" aria-label={m.sc_next} />
            ),
          )}
        </div>
      )}

      {/* Reduced-motion / no-JS friendly rotate hint under the readout is optional; the
          Viewer360 already renders its own counter + hint when active. */}
      <span className="sr-only">
        <RotateCcw size={12} /> {m.sc_dragOnly}
      </span>
    </section>
  );
}
