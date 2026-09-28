"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type { PublicAthleteDetail } from "@/lib/data";
import { STAGE_ARENA, VIEWER_360, VIEWER_VIEWS, viewer360FrameStyle } from "@/lib/config";
import { VIEW_KEYS } from "@/lib/views";
import { type Dict } from "@/lib/i18n";
import { tGender } from "@/lib/i18n";
import { initials } from "@/lib/format";
import { AthleteViews, type AthleteViewsHandle } from "@/components/AthleteViews";
import type { ArenaHandle } from "@/components/StageArena3D";

// three.js + r3f load only on the client, after first paint, and only when WebGL
// exists; until then (or without WebGL) the flat CSS ring platform shows.
const StageArena3D = dynamic(() => import("@/components/StageArena3D").then((mod) => mod.StageArena3D), {
  ssr: false,
});

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

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

  // Fixed 4-view viewer. `view` = index into VIEW_KEYS (0 Depan, 1 Kanan,
  // 2 Belakang, 3 Kiri). The camera angle (3D arena + fallback ring ticks) is
  // continuous: each step turns it ±90° so the stage turns the matching way,
  // eased over the photo crossfade and written straight to the DOM/arena
  // (no React re-render per animation frame).
  const viewNames = [m.view_front, m.view_right, m.view_back, m.view_left];
  const [view, setView] = useState(0);
  const viewRef = useRef(0);
  const ticksRef = useRef<SVGGElement>(null);
  const arenaHandle = useRef<ArenaHandle>({ angleDeg: 0, invalidate: null });
  const platformRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const [arenaWanted, setArenaWanted] = useState(false);
  const [arenaOn, setArenaOn] = useState(false);
  useEffect(() => {
    setArenaWanted(hasWebGL());
  }, []);

  // ONE orbit angle (deg, continuous) is the single source of truth. Every
  // animation frame the same value is pushed to the 3D arena camera, the
  // fallback ring ticks and the athlete photo renderer, so stage and athlete
  // always turn together.
  const viewsRef = useRef<AthleteViewsHandle>(null);
  const angleRef = useRef(0); // what is painted now
  const targetRef = useRef(0); // where the current turn ends (multiple of 90)
  const tweenRef = useRef<number | null>(null);
  const dragBaseRef = useRef<number | null>(null);
  const renderAt = useCallback((deg: number, moving: boolean) => {
    angleRef.current = deg;
    ticksRef.current?.setAttribute("transform", `rotate(${(VIEWER_360.ringTurnDirection * deg).toFixed(2)})`);
    arenaHandle.current.angleDeg = deg;
    arenaHandle.current.invalidate?.();
    viewsRef.current?.render(deg, moving);
  }, []);
  const settleView = useCallback((deg: number) => {
    const v = ((Math.round(deg / 90) % 4) + 4) % 4;
    viewRef.current = v;
    setView(v);
  }, []);
  // Weak-phone safety net: repeated slow turns switch the 3D arena off (the
  // CSS ring platform takes over; the athlete keeps turning smoothly).
  const slowTurnsRef = useRef(0);
  const checkTurnFps = useCallback((frames: number, ms: number) => {
    if (!arenaHandle.current.invalidate || ms < 200) return;
    const fps = (frames * 1000) / ms;
    if (fps >= STAGE_ARENA.minTurnFps) {
      slowTurnsRef.current = 0;
      return;
    }
    slowTurnsRef.current += 1;
    if (slowTurnsRef.current >= STAGE_ARENA.slowTurnsToDisable) {
      setArenaOn(false);
      setArenaWanted(false);
    }
  }, []);
  // Turn from wherever the angle is now to `to` (retargets cleanly mid-turn).
  const turnTo = useCallback(
    (to: number) => {
      if (tweenRef.current != null) cancelAnimationFrame(tweenRef.current);
      tweenRef.current = null;
      targetRef.current = to;
      settleView(to); // tabs + readout jump to the destination right away
      const from = angleRef.current;
      const dist = Math.abs(to - from);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || dist < 0.01) {
        renderAt(to, false);
        return;
      }
      const { turnMs90, turnMs180, minTurnMs } = VIEWER_VIEWS;
      const dur =
        dist <= 90
          ? Math.max(minTurnMs, (turnMs90 * dist) / 90)
          : turnMs90 + ((turnMs180 - turnMs90) * Math.min(90, dist - 90)) / 90;
      const t0 = performance.now();
      let frames = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
        renderAt(from + (to - from) * e, t < 1);
        frames += 1;
        tweenRef.current = t < 1 ? requestAnimationFrame(tick) : null;
        if (t >= 1) checkTurnFps(frames, now - t0);
      };
      tweenRef.current = requestAnimationFrame(tick);
    },
    [renderAt, settleView, checkTurnFps],
  );
  useEffect(
    () => () => {
      if (tweenRef.current != null) cancelAnimationFrame(tweenRef.current);
    },
    [],
  );
  // Tabs: shortest way round (Front -> Back = one 180° turn).
  const goTo = useCallback(
    (target: number) => {
      const cur = ((Math.round(targetRef.current / 90) % 4) + 4) % 4;
      if (target === cur) return;
      let d = (((target - cur) % 4) + 4) % 4; // 1..3
      if (d === 3) d = -1;
      turnTo(targetRef.current + d * 90);
    },
    [turnTo],
  );
  // Arrows / keys: next = +90 (toward Kanan), previous = -90.
  const step = useCallback((delta: 1 | -1) => turnTo(targetRef.current + delta * 90), [turnTo]);
  // Swipe: the angle follows the finger (drag right = toward Kanan), then snaps.
  const onDragStart = useCallback(() => {
    if (tweenRef.current != null) cancelAnimationFrame(tweenRef.current);
    tweenRef.current = null;
    dragBaseRef.current = angleRef.current;
  }, []);
  const onDragMove = useCallback(
    (dx: number) => {
      if (dragBaseRef.current == null) return;
      renderAt(dragBaseRef.current + (dx / VIEWER_VIEWS.dragPxPer90) * 90, true);
    },
    [renderAt],
  );
  const onDragEnd = useCallback(
    (vx: number) => {
      const base = dragBaseRef.current ?? angleRef.current;
      dragBaseRef.current = null;
      const cur = angleRef.current;
      const startView = Math.round(base / 90) * 90;
      let to = Math.round(cur / 90) * 90;
      if (to === startView && Math.abs(vx) >= VIEWER_VIEWS.flickVelocity) to = startView + Math.sign(vx) * 90;
      turnTo(to);
    },
    [turnTo],
  );
  const tickAngles = useMemo(
    () => Array.from({ length: VIEWER_360.ringTicks }, (_, i) => (i * 360) / VIEWER_360.ringTicks),
    [],
  );

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
    <section
      className={`relative overflow-hidden rounded-3xl border border-white/10 bg-[#100a0c] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ${
        arenaOn ? "stagecard-arena-on" : ""
      }`}
    >
      {/* 3D neon arena (behind everything; fades in once WebGL is up) */}
      {arenaWanted && (
        <div
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-700"
          style={{ opacity: arenaOn ? 1 : 0 }}
          aria-hidden
        >
          <StageArena3D
            handle={arenaHandle}
            anchorRef={platformRef}
            figureRef={figureRef}
            onReady={() => setArenaOn(true)}
            onFail={() => {
              setArenaOn(false);
              setArenaWanted(false);
            }}
          />
        </div>
      )}
      {/* Keeps the stats legible over the arena */}
      {arenaOn && <div className="stagecard-arena-shade pointer-events-none absolute inset-0 z-0" aria-hidden />}
      {/* Ambient red wash + vignette across the whole card */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(620px 520px at 62% 42%, rgba(255,45,85,0.22), transparent 70%), radial-gradient(130% 100% at 50% 45%, transparent 55%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      <div className="relative z-10 grid gap-4 p-[var(--stagecard-pad)] [--stagecard-pad:1.25rem] sm:[--stagecard-pad:1.75rem] lg:grid-cols-[minmax(0,340px)_1fr] lg:gap-6">
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
        {/* container-type lets the platform (anchored inside the figure) size itself
            against this column's width; pb reserves room for the CTA below the ring. */}
        <div className="relative flex min-h-[56vh] items-center justify-center pb-32 pt-14 sm:pt-10 [container-type:inline-size] lg:min-h-[72vh] lg:pt-0">
          {/* Spotlight cone behind everything, from the card's top edge */}
          <div className="stagecard-spot" aria-hidden />

          {/* Active view readout + hint. Phones: one centred line above the
              figure. sm+: top-right, sized to the stage column and capped to the
              space beside the figure so it never runs off-card or into the head. */}
          {has360 && (
            <div className="stagecard-readout pointer-events-none z-20" aria-live="polite">
              <div className="stagecard-readout-name font-condensed font-bold uppercase leading-none">{viewNames[view]}</div>
              <div className="stagecard-readout-deg font-mono text-xs text-[#ff2d55] tabular-nums">{`${view * 90}°`}</div>
              <p className="stagecard-readout-hint font-mono text-[11px] leading-snug text-white/45">{m.sc_hint}</p>
            </div>
          )}

          {/* The figure */}
          <div ref={figureRef} className="relative isolate mx-auto w-full" style={{ maxWidth: "min(300px, 78vw)" }}>
            {/* Neon platform, centered on the athlete's feet line and painted before
                (so behind) the figure — the feet stay uncovered and untinted. */}
            <div
              ref={platformRef}
              className="stagecard-platform"
              style={{ bottom: `${VIEWER_360.feetLinePct}%` }}
              aria-hidden
            >
              <div className="stagecard-ring-outer" />
              <div className="stagecard-floorglow" />
              <div className="stagecard-ring" />
              {/* Tick marks on the ring, turning with the figure at the exact angle.
                  preserveAspectRatio="none" squashes the circle into the ring's
                  ellipse, so the rotation reads as a tilted turntable. */}
              <svg className="stagecard-ring-ticks" viewBox="-50 -50 100 100" preserveAspectRatio="none">
                <g ref={ticksRef}>
                  {tickAngles.map((a, i) => {
                    const major = i % (VIEWER_360.ringTicks / 4) === 0;
                    const r = (a * Math.PI) / 180;
                    const r1 = major ? 41 : 44;
                    return (
                      <line
                        key={a}
                        x1={Math.sin(r) * r1}
                        y1={Math.cos(r) * r1}
                        x2={Math.sin(r) * 48.5}
                        y2={Math.cos(r) * 48.5}
                        className={major ? "stagecard-tick-major" : "stagecard-tick"}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </g>
              </svg>
            </div>
            {has360 ? (
              <AthleteViews
                ref={viewsRef}
                athleteId={athlete.id}
                media={athlete.media360!}
                view={view}
                onStep={step}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                m={m}
                label={`${athlete.nama} — ${viewNames[view]}`}
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

          {/* View switcher: ‹ Depan · Kanan · Belakang · Kiri › (above the CTA) */}
          {has360 && (
            <div className="absolute inset-x-0 bottom-[3.75rem] z-20 flex items-center justify-center gap-1.5 px-2">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={m.view_prev}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur transition-colors hover:border-white/40 hover:text-white"
              >
                <ChevronLeft size={16} />
              </button>
              <div role="tablist" aria-label={m.view_tabs} className="flex rounded-full border border-white/10 bg-black/50 p-0.5 backdrop-blur">
                {VIEW_KEYS.map((k, i) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={view === i}
                    onClick={() => goTo(i)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors sm:px-3.5 sm:text-xs ${
                      view === i
                        ? "bg-[#ff2d55] text-white shadow-[0_0_14px_rgba(255,45,85,0.55)]"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    {viewNames[i]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={m.view_next}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur transition-colors hover:border-white/40 hover:text-white"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

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
