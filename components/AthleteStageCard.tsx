"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import type { PublicAthleteDetail } from "@/lib/data";
import { STAGE_ARENA, STAGE_CTA, STAGE_FEET_BLEND, STAGE_MODE, STAGE_PLATFORM, STAGE_READOUT, STAGE_STATIC, STAGE_TURN_FRAMES_AUTO, STAGE_TURN_VIDEO_AUTO, STAGE_VIEW_CONTROLS, STAGE_VIDEO_BUNDLED, VIEWER_360, VIEWER_360_FRAME_CLASS, VIEWER_SPIN, VIEWER_VIDEO, VIEWER_VIEWS, stageFitVars, viewer360FrameStyle } from "@/lib/config";
import { decayVelocity, degreeLabel, nearestSide, nextSideTarget, norm360, shortestDelta, sideTarget } from "@/lib/spin";
import { VIEW_KEYS } from "@/lib/views";
import { parseStageVideo, turnVideoUsable } from "@/lib/stage-video";
import { withBundledFrames } from "@/lib/stage-frames";
import { type Dict, fmt } from "@/lib/i18n";
import { tGender } from "@/lib/i18n";
import { initials } from "@/lib/format";
import { AthleteViews, type AthleteViewsHandle } from "@/components/AthleteViews";
import type { ArenaHandle } from "@/components/StageArena3D";
import { StageMediaLightbox } from "@/components/StageMediaLightbox";
import type { StageScreen } from "@/lib/stage-media";

// three.js + r3f load only on the client, after first paint, and only when WebGL
// exists; until then (or without WebGL) the flat CSS ring platform shows.
const ViewportDebug = dynamic(() => import("@/components/ViewportDebug").then((mod) => mod.ViewportDebug), { ssr: false });
const StageArena3D = dynamic(() => import("@/components/StageArena3D").then((mod) => mod.StageArena3D), {
  ssr: false,
});

// The CSS ring fallback is squashed by the same camera tilt the 3D arena uses.
const NO_SCREENS: StageScreen[] = [];
const STAGE_TILT = Math.sin((STAGE_ARENA.cameraElevationDeg * Math.PI) / 180).toFixed(3);

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
  // A picture turn shipped with the site replaces the data's frames.
  const media360 = useMemo(() => withBundledFrames(athlete.id, athlete.media360), [athlete.id, athlete.media360]);
  const has360 = !!media360 && media360.frames.length > 0;

  // Free rotation. `view` = the side nearest to the current angle (index into
  // VIEW_KEYS: 0 Depan, 1 Kanan, 2 Belakang, 3 Kiri) for the tabs, readout
  // name and zone markers; the angle itself is continuous and written straight
  // to the DOM/arena (no React re-render per animation frame).
  const viewNames = [m.view_front, m.view_right, m.view_back, m.view_left];
  const [view, setView] = useState(0);
  const viewRef = useRef(0);
  const ticksRef = useRef<SVGGElement>(null);
  const arenaHandle = useRef<ArenaHandle>({ angleDeg: 0, invalidate: null, setDpr: null, groundHit: null, outline: null, pick: null, mediaHit: null });
  // ?debug=feet: draw the platform top face and each foot's contact point.
  // ?debug=viewport: viewport / toolbar measuring overlay (both: debug=feet,viewport).
  const [debugFeet, setDebugFeet] = useState(false);
  const [debugViewport, setDebugViewport] = useState(false);
  const [debugPerf, setDebugPerf] = useState(false);
  const [debugVideo, setDebugVideo] = useState(false);
  const debugPerfRef = useRef(false);
  debugPerfRef.current = debugPerf;
  // Platform shape: STAGE_PLATFORM, or ?platform=round|hex to preview the other.
  const [platform, setPlatform] = useState<"hex" | "round">(STAGE_PLATFORM);
  // Stage mode: STAGE_MODE, or ?stage=turntable|static to preview the other.
  const [stageMode, setStageMode] = useState<"static-athlete" | "turntable">(STAGE_MODE);
  const isStatic = stageMode === "static-athlete";
  const staticRef = useRef(isStatic);
  staticRef.current = isStatic;
  useEffect(() => {
    const debug = (new URLSearchParams(window.location.search).get("debug") ?? "").split(",");
    setDebugFeet(debug.includes("feet"));
    setDebugViewport(debug.includes("viewport"));
    setDebugPerf(debug.includes("perf"));
    setDebugVideo(debug.includes("video"));
    const shape = new URLSearchParams(window.location.search).get("platform");
    if (shape === "round" || shape === "hex") setPlatform(shape);
    const mode = new URLSearchParams(window.location.search).get("stage");
    if (mode === "turntable") setStageMode("turntable");
    else if (mode === "static") setStageMode("static-athlete");
    else if (STAGE_TURN_FRAMES_AUTO && has360 && media360?.turn && STAGE_ARENA.autoRotateDirection === 1) {
      // An athlete with a turn set (data, or the temporary bundled one): the full turn in every browser.
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setStageMode("turntable");
    } else if (STAGE_TURN_VIDEO_AUTO && has360 && STAGE_ARENA.autoRotateDirection === 1) {
      // An athlete with a turn video: the full turn, where this browser can show it.
      const video = parseStageVideo(media360?.video ?? STAGE_VIDEO_BUNDLED[athlete.id]?.video);
      const el = document.createElement("video");
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
      if (turnVideoUsable(video, (t) => el.canPlayType(t), /Apple/.test(navigator.vendor), reduced, saveData)) {
        pausesRef.current.add("video"); // the first turn waits for the video (as in STAGE_MODE "turntable")
        setStageMode("turntable");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const platformRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const [arenaWanted, setArenaWanted] = useState(false);
  const [arenaOn, setArenaOn] = useState(false);
  useEffect(() => {
    setArenaWanted(hasWebGL());
  }, []);

  // ONE stage clock (a single requestAnimationFrame loop, delta-time based)
  // drives everything, with no React state per frame:
  //   viewAngle  = the view turn (tween on tab/arrow/key, or the finger on swipe)
  //   autoAngle  = the arena's slow idle rotation (eases in/out, pausable)
  //   arena + fallback ring  <- autoAngle + viewAngle
  //   athlete photo          <- viewAngle   (stays on its view while idle)
  const viewsRef = useRef<AthleteViewsHandle>(null);
  const viewAngleRef = useRef(0); // painted view angle
  // A turn to a side (tab/arrow) or by a few degrees (key); `to` = view angle.
  const tweenRef = useRef<{ from: number; to: number; t0: number; dur: number; frames: number; toSide: boolean } | null>(null);
  const dragRef = useRef<{ base: number; angle: number } | null>(null);
  const inertiaRef = useRef(0); // deg/s after a released drag (0 = none)
  // Visitor's Play/Pause: the auto-rotation runs only on Play. A manual turn
  // (drag, tab, arrow, key, wheel, tap) only holds it: the spin comes back by
  // itself VIEWER_SPIN.manualResumeMs after the turn ends. Only Pause stops it.
  const [playing, setPlayingState] = useState(true);
  const playingRef = useRef(true);
  const degRef = useRef<HTMLDivElement>(null);
  // Screen readers hear the side + degrees only when the athlete comes to rest.
  const liveRef = useRef<HTMLSpanElement>(null);
  const wasMovingRef = useRef(false);
  const sideNameRef = useRef<HTMLDivElement>(null);
  const autoAngleRef = useRef(0);
  const autoFactorRef = useRef(0); // 0..1 eased speed factor
  // "video": the first turn waits for the turn video (AthleteViews settles it).
  const pausesRef = useRef(new Set<string>(has360 && STAGE_MODE === "turntable" ? ["loading", "video"] : ["loading"]));
  // "static-athlete": the side on screen (index into VIEW_KEYS) and a running
  // crossfade to another side; the scenery behind orbits on autoAngle.
  const sideRef = useRef(0);
  const fadeRef = useRef<{ from: number; to: number; t0: number; dur: number } | null>(null);
  const bgTweenRef = useRef<{ from: number; to: number; t0: number; dur: number } | null>(null);
  // The side whose zone markers show (follows a crossfade from its middle on).
  const [shownSide, setShownSide] = useState(0);
  const shownSideRef = useRef(0);
  const startFadeRef = useRef<(to: number, ms: number) => void>(() => {});
  const sidePaintRef = useRef(-1); // side painted at rest (-1 = repaint)
  const sideRestRef = useRef({ at: 0, prepped: -1 }); // when that rest paint was, side whose next one is drawn ahead
  const bgLinesRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTRef = useRef(0);
  const lastViewPaintRef = useRef<{ a: number; moving: boolean } | null>(null);
  const qualityRef = useRef({ t0: 0, frames: 0, level: 0, slow: 0 }); // level 0 full, 1 dpr 1, 2 half rate
  const clockStartRef = useRef(0); // when the stage started (quality warm-up)
  const frameParityRef = useRef(0);
  const manualTurnRef = useRef(false); // a drag / inertia / tween was running last frame
  const releaseManualRef = useRef<() => void>(() => {}); // schedules the resume after a manual turn

  const settleView = useCallback((deg: number) => {
    const v = ((Math.round(deg / 90) % 4) + 4) % 4;
    viewRef.current = v;
    setView(v);
  }, []);

  const disableArena = useCallback(() => {
    setArenaOn(false);
    setArenaWanted(false);
  }, []);

  // Weak-phone safety net for view turns (see STAGE_ARENA.minTurnFps).
  const slowTurnsRef = useRef(0);
  const checkTurnFps = useCallback(
    (frames: number, ms: number) => {
      if (!arenaHandle.current.invalidate || ms < 200) return;
      if (!clockStartRef.current || performance.now() - clockStartRef.current < STAGE_ARENA.qualityWarmupMs) return;
      const fps = (frames * 1000) / ms;
      if (fps >= STAGE_ARENA.minTurnFps) {
        slowTurnsRef.current = 0;
        return;
      }
      slowTurnsRef.current += 1;
      if (slowTurnsRef.current >= STAGE_ARENA.slowTurnsToDisable) disableArena();
    },
    [disableArena],
  );

  const tick = useCallback(
    (now: number) => {
      const rawDt = Math.max(0, (now - lastTRef.current) / 1000);
      const dt = Math.min(0.05, rawDt); // s, clamped
      lastTRef.current = now;

      // "static-athlete": the athlete stands still on a side photo; only the
      // scenery orbits, held by Pause, a hidden tab, the card off screen or
      // loading. With autoSides the photo follows the orbit side by side, a
      // tab / swipe / key turns the scenery to that side (orbit back
      // resumeMs later) and an open zone card holds it.
      if (staticRef.current) {
        // The orbit keeps its speed down to slow frame rates (clamped wider).
        const dt = Math.min(STAGE_STATIC.maxStepMs / 1000, rawDt);
        const p = pausesRef.current;
        const auto = STAGE_STATIC.autoSides;
        const held = p.has("hidden") || p.has("offscreen") || p.has("loading") || (auto && (p.has("manual") || p.has("zone")));
        const wantBg = playingRef.current && !held ? 1 : 0;
        const tauS = STAGE_STATIC.easeMs / 1000 / 3;
        let fs = autoFactorRef.current + (wantBg - autoFactorRef.current) * (1 - Math.exp(-dt / tauS));
        if (Math.abs(wantBg - fs) < 0.002) fs = wantBg;
        autoFactorRef.current = fs;
        const twS = bgTweenRef.current;
        if (twS) {
          // A tab / swipe / key: the shortest way to that side, eased.
          const t = Math.min(1, (now - twS.t0) / twS.dur);
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          autoAngleRef.current = twS.from + (twS.to - twS.from) * e;
          if (t >= 1) bgTweenRef.current = null;
        } else {
          autoAngleRef.current += (STAGE_STATIC.direction * 360 * dt * fs) / STAGE_STATIC.secPerTurn;
        }
        const bg = autoAngleRef.current;
        // ?debug=perf: the scenery angle on the card (tests read it).
        if (debugPerfRef.current && sectionRef.current) sectionRef.current.dataset.bg = bg.toFixed(2);
        // The side follows the orbit: it starts crossfading half a fade before
        // the side boundary, so the fade is centred on it. Not while a tab
        // turn, a fade, a manual hold or a zone card is on.
        if (auto && !bgTweenRef.current && !fadeRef.current && !p.has("manual") && !p.has("zone")) {
          const lead = (STAGE_STATIC.direction * (STAGE_STATIC.autoFadeMs / 2000) * 360) / STAGE_STATIC.secPerTurn;
          const target = ((Math.round((bg + lead) / 90) % 4) + 4) % 4;
          if (target !== sideRef.current) startFadeRef.current(target, STAGE_STATIC.autoFadeMs);
        }
        const hs = arenaHandle.current;
        hs.angleDeg = bg;
        // During a side crossfade the scenery redraws at half rate: the two
        // blended photos get the frame time (no stutter on weak phones).
        const halfRateS = qualityRef.current.level >= 2 || !!fadeRef.current;
        frameParityRef.current ^= 1;
        if (!halfRateS || frameParityRef.current === 0) hs.invalidate?.();
        // No WebGL: neon lines behind the athlete drift sideways instead.
        const lines = bgLinesRef.current;
        if (lines) {
          const period = STAGE_STATIC.cssLinePeriodPx;
          const off = (((bg / 360) * STAGE_STATIC.cssPeriodsPerTurn * period) % period + period) % period;
          lines.style.transform = `translate3d(${(-off).toFixed(2)}px,0,0)`;
        }
        // Side crossfade. The zone markers follow the new side from its
        // middle on (they are hidden while it runs, so never on the wrong photo).
        const fd = fadeRef.current;
        if (fd) {
          const t = fd.dur > 0 ? Math.min(1, (now - fd.t0) / fd.dur) : 1;
          if (t >= 0.5 && shownSideRef.current !== fd.to) {
            shownSideRef.current = fd.to;
            setShownSide(fd.to);
          }
          if (t < 1) viewsRef.current?.renderSide(fd.from, fd.to, t);
          else {
            fadeRef.current = null;
            sidePaintRef.current = -1;
          }
        }
        if (!fadeRef.current && sidePaintRef.current !== sideRef.current && viewsRef.current) {
          viewsRef.current.renderSide(sideRef.current, sideRef.current, 0);
          sidePaintRef.current = sideRef.current;
          sideRestRef.current = { at: now, prepped: -1 };
        }
        // A moment after that, the side the orbit reaches next is drawn ahead
        // (hidden), so its crossfade starts without a draw.
        const rest = sideRestRef.current;
        if (auto && fs > 0 && !fadeRef.current && sidePaintRef.current === sideRef.current && rest.prepped !== sideRef.current && now - rest.at > STAGE_STATIC.prepNextMs && viewsRef.current) {
          const s = sideRef.current;
          viewsRef.current.renderSide(s, s, 0, (((s + STAGE_STATIC.direction) % 4) + 4) % 4);
          rest.prepped = s;
        }
        // Adaptive quality while the scenery turns (same rules as the turn).
        if (!clockStartRef.current && fs > 0.5) clockStartRef.current = now;
        const warmS = clockStartRef.current > 0 && now - clockStartRef.current > STAGE_ARENA.qualityWarmupMs;
        if (hs.invalidate && fs > 0.5 && warmS) {
          const q = qualityRef.current;
          if (!q.t0) q.t0 = now;
          q.frames += 1;
          if (now - q.t0 >= STAGE_ARENA.qualityWindowMs) {
            const fps = (q.frames * 1000) / (now - q.t0);
            if (fps < STAGE_ARENA.dprDropFps && q.level < 1) {
              q.level = 1;
              hs.setDpr?.(1);
            } else if (fps < STAGE_ARENA.halfRateFps && q.level < 2) {
              q.level = 2;
            } else if (fps < STAGE_ARENA.minTurnFps && q.level >= 2) {
              q.slow += 1;
              if (q.slow >= STAGE_ARENA.slowWindowsToDisable) disableArena();
            } else {
              q.slow = 0;
            }
            q.t0 = now;
            q.frames = 0;
          }
        }
        const busyS = fs > 0 || wantBg > 0 || !!fadeRef.current || !!bgTweenRef.current || (!!viewsRef.current && sidePaintRef.current !== sideRef.current);
        rafRef.current = busyS ? requestAnimationFrame(tick) : null;
        return;
      }

      // View angle: tween, finger, or at rest.
      let moving = false;
      const tw = tweenRef.current;
      if (dragRef.current) {
        viewAngleRef.current = dragRef.current.angle;
        moving = true;
      } else if (inertiaRef.current) {
        viewAngleRef.current += inertiaRef.current * dt;
        inertiaRef.current = decayVelocity(inertiaRef.current, dt, VIEWER_SPIN.inertiaTauMs, VIEWER_SPIN.inertiaMinDegPerSec);
        moving = inertiaRef.current !== 0; // the last inertia step is already "at rest" (the loop stops after it)
      } else if (tw) {
        const t = Math.min(1, (now - tw.t0) / tw.dur);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
        viewAngleRef.current = tw.from + (tw.to - tw.from) * e;
        tw.frames += 1;
        moving = t < 1;
        if (t >= 1) {
          tweenRef.current = null;
          checkTurnFps(tw.frames, now - tw.t0);
        }
      }

      // Auto-rotate (only on Play): ease the speed factor toward 1 or 0.
      const want = playingRef.current && pausesRef.current.size === 0 ? 1 : 0;
      const tau = STAGE_ARENA.autoRotateEaseMs / 1000 / 3;
      let f = autoFactorRef.current + (want - autoFactorRef.current) * (1 - Math.exp(-dt / tau));
      if (Math.abs(want - f) < 0.002) f = want;
      autoFactorRef.current = f;
      const autoStep = (STAGE_ARENA.autoRotateDirection * 360 * dt * f) / STAGE_ARENA.autoRotateSecPerTurn;
      autoAngleRef.current += autoStep;
      // A set with a turn video plays it while auto-rotating (at the spin's
      // current speed); then the video's angle drives the stage (the arena
      // follows the athlete).
      const va = viewsRef.current?.video(moving ? 0 : f, autoAngleRef.current + viewAngleRef.current, now) ?? null;
      if (va != null) {
        // Follow the video; when it is a little behind (its clock vs ours while
        // the rate changes) the stage holds still until it catches up, so the
        // arena never turns backwards and never runs ahead of the athlete.
        const d = shortestDelta(norm360(autoAngleRef.current + viewAngleRef.current), va);
        autoAngleRef.current += d < 0 && d > -VIEWER_VIDEO.holdBackDeg ? Math.max(d, -Math.abs(autoStep)) : d;
      }

      // Paint: stage AND athlete follow the same combined angle (turntable).
      const env = autoAngleRef.current + viewAngleRef.current;
      const turning = moving; // a view turn / swipe (not just the idle spin)
      moving = moving || f > 0.001;
      // Tabs + readout follow the side the athlete is nearest to (a turn to
      // a side shows its destination right away); the degrees are exact.
      const near = nearestSide(env);
      if (!tweenRef.current?.toSide && near.side !== viewRef.current) {
        viewRef.current = near.side;
        setView(near.side);
      }
      const deg = degRef.current;
      const label = degreeLabel(env);
      if (deg && deg.textContent !== label) deg.textContent = label;
      const nameEl = sideNameRef.current;
      if (nameEl) {
        const op = near.off <= VIEWER_SPIN.sideReadoutDeg || tweenRef.current?.toSide ? "1" : "0.45";
        if (nameEl.style.opacity !== op) nameEl.style.opacity = op;
      }
      ticksRef.current?.setAttribute("transform", `rotate(${(VIEWER_360.ringTurnDirection * env).toFixed(2)})`);
      const h = arenaHandle.current;
      h.angleDeg = env;
      const halfRate = qualityRef.current.level >= 2 && !moving;
      frameParityRef.current ^= 1;
      if (!halfRate || frameParityRef.current === 0) h.invalidate?.();
      if (wasMovingRef.current && !moving && liveRef.current) liveRef.current.textContent = `${viewNames[near.side]}, ${label}`;
      wasMovingRef.current = moving;
      const lv = lastViewPaintRef.current;
      if (!lv || lv.a !== env || lv.moving !== moving) {
        viewsRef.current?.render(env, moving, turning);
        lastViewPaintRef.current = { a: env, moving };
      }

      // Adaptive quality while the arena runs continuously (after a warm-up,
      // since images/fonts still decode right after load).
      if (!clockStartRef.current && f > 0.5) clockStartRef.current = now;
      const warm = clockStartRef.current > 0 && now - clockStartRef.current > STAGE_ARENA.qualityWarmupMs;
      if (h.invalidate && f > 0.5 && warm) {
        const q = qualityRef.current;
        if (!q.t0) q.t0 = now;
        q.frames += 1;
        if (now - q.t0 >= STAGE_ARENA.qualityWindowMs) {
          const fps = (q.frames * 1000) / (now - q.t0);
          // Step down gently; only give up on the arena after repeated slow
          // windows at the lowest quality.
          if (fps < STAGE_ARENA.dprDropFps && q.level < 1) {
            q.level = 1;
            h.setDpr?.(1);
          } else if (fps < STAGE_ARENA.halfRateFps && q.level < 2) {
            q.level = 2;
          } else if (fps < STAGE_ARENA.minTurnFps && q.level >= 2) {
            q.slow += 1;
            if (q.slow >= STAGE_ARENA.slowWindowsToDisable) disableArena();
          } else {
            q.slow = 0;
          }
          q.t0 = now;
          q.frames = 0;
        }
      } else {
        qualityRef.current.t0 = 0;
        qualityRef.current.frames = 0;
      }

      // A manual turn just ended (finger up and inertia / tween done): the
      // spin comes back a little later.
      const manualTurn = !!dragRef.current || !!tweenRef.current || !!inertiaRef.current;
      if (manualTurnRef.current && !manualTurn) releaseManualRef.current();
      manualTurnRef.current = manualTurn;

      const busy = manualTurn || f > 0 || want > 0;
      rafRef.current = busy ? requestAnimationFrame(tick) : null;
    },
    [checkTurnFps, disableArena],
  );

  const ensureLoop = useCallback(() => {
    if (rafRef.current != null) return;
    lastTRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(
    (reason: string) => {
      pausesRef.current.add(reason);
      ensureLoop(); // ease out
    },
    [ensureLoop],
  );
  // Stop the idle spin right away (user interaction), then resume later.
  const resumeTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const holdNow = useCallback(
    (reason: string) => {
      const t = resumeTimersRef.current.get(reason);
      if (t) clearTimeout(t);
      resumeTimersRef.current.delete(reason);
      pausesRef.current.add(reason);
      autoFactorRef.current = 0;
      ensureLoop();
    },
    [ensureLoop],
  );
  const resume = useCallback(
    (reason: string) => {
      pausesRef.current.delete(reason);
      ensureLoop(); // ease in
    },
    [ensureLoop],
  );
  const resumeLater = useCallback(
    (reason: string, ms: number) => {
      const prev = resumeTimersRef.current.get(reason);
      if (prev) clearTimeout(prev);
      resumeTimersRef.current.set(
        reason,
        setTimeout(() => {
          resumeTimersRef.current.delete(reason);
          resume(reason);
        }, ms),
      );
    },
    [resume],
  );

  releaseManualRef.current = () => resumeLater("manual", VIEWER_SPIN.manualResumeMs);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      resumeTimersRef.current.forEach((t) => clearTimeout(t));
    },
    [],
  );

  // Pause while the tab is hidden or the card is scrolled out of view.
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const onVis = () => (document.hidden ? pause("hidden") : resume("hidden"));
    onVis();
    document.addEventListener("visibilitychange", onVis);
    let io: IntersectionObserver | null = null;
    if (sectionRef.current && "IntersectionObserver" in window) {
      io = new IntersectionObserver(([e]) => (e.isIntersecting ? resume("offscreen") : pause("offscreen")));
      io.observe(sectionRef.current);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      io?.disconnect();
    };
  }, [pause, resume]);

  // Start once the athlete photos (and the arena, when there is one) are ready.
  const [photosReady, setPhotosReady] = useState(!has360);
  useEffect(() => {
    if (!photosReady) return;
    if (!arenaWanted || arenaOn) {
      resume("loading");
      return;
    }
    // Arena still loading: don't hold the idle rotation forever (CSS ring fallback).
    const t = setTimeout(() => resume("loading"), 4000);
    return () => clearTimeout(t);
  }, [photosReady, arenaWanted, arenaOn, resume]);
  // The turn video: don't hold the first turn forever either (slow network).
  useEffect(() => {
    if (!photosReady) return;
    const t = setTimeout(() => resume("video"), VIEWER_VIDEO.firstWaitMaxMs);
    return () => clearTimeout(t);
  }, [photosReady, resume]);

  // Play / Pause (the button eases the spin in / out). Play also ends a
  // manual-turn hold at once.
  const setPlaying = useCallback(
    (p: boolean, now = false) => {
      playingRef.current = p;
      setPlayingState(p);
      if (!p && now) autoFactorRef.current = 0;
      if (p) {
        const t = resumeTimersRef.current.get("manual");
        if (t) clearTimeout(t);
        resumeTimersRef.current.delete("manual");
        pausesRef.current.delete("manual");
      }
      ensureLoop();
    },
    [ensureLoop],
  );
  // prefers-reduced-motion: start on Pause (the visitor can still press Play).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false, true);
  }, [setPlaying]);
  const togglePlay = useCallback(() => setPlaying(!playingRef.current), [setPlaying]);
  // A manual turn: hold the spin at once (so the athlete stays exactly where
  // the visitor puts it) and drop any running inertia. Play/Pause is left
  // as it is; the hold ends manualResumeMs after the turn ends.
  const takeOver = useCallback(() => {
    holdNow("manual");
    inertiaRef.current = 0;
  }, [holdNow]);

  // "static-athlete": crossfade the photo to a side; the tabs and readout
  // follow at once (the zone markers from the fade's middle on).
  const startFade = (to: number, ms: number) => {
    const fd = fadeRef.current;
    const from = fd ? fd.to : sideRef.current;
    sideRef.current = to;
    viewRef.current = to;
    setView(to);
    if (degRef.current) degRef.current.textContent = `${to * 90}°`;
    if (to === from) return;
    fadeRef.current = ms > 0 ? { from, to, t0: performance.now(), dur: ms } : null;
    if (!fadeRef.current) {
      shownSideRef.current = to;
      setShownSide(to);
    }
    sidePaintRef.current = -1;
    ensureLoop();
  };
  startFadeRef.current = startFade;
  // A visitor picks a side (tab / swipe / key). With autoSides the scenery
  // turns the shortest way to it and the orbit comes back resumeMs later;
  // instant under reduced motion. Only these are announced (not the orbit's).
  const changeSide = useCallback(
    (target: number) => {
      const to = ((target % 4) + 4) % 4;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (liveRef.current && to !== (fadeRef.current ? fadeRef.current.to : sideRef.current)) liveRef.current.textContent = viewNames[to];
      if (!STAGE_STATIC.autoSides) {
        startFade(to, reduced ? 0 : STAGE_STATIC.sideFadeMs);
        return;
      }
      const ms = reduced ? 0 : STAGE_STATIC.turnToSideMs;
      const from = autoAngleRef.current;
      const goal = from + shortestDelta(norm360(from), to * 90);
      if (ms > 0) bgTweenRef.current = { from, to: goal, t0: performance.now(), dur: ms };
      else {
        bgTweenRef.current = null;
        autoAngleRef.current = goal;
      }
      autoFactorRef.current = 0;
      pausesRef.current.add("manual");
      resumeLater("manual", ms + STAGE_STATIC.resumeMs);
      startFade(to, ms);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ensureLoop, resumeLater],
  );
  const swipeRef = useRef(0);

  const combined = () => autoAngleRef.current + viewAngleRef.current;
  // Where the athlete is heading (end of a running turn) or is.
  const aimed = () => (tweenRef.current ? autoAngleRef.current + tweenRef.current.to : combined());

  // Turn so the combined (stage + athlete) angle ends at `toC`, from wherever
  // it is now; retargets cleanly mid-turn. Instant under reduced motion.
  const turnTo = useCallback(
    (toC: number, opts: { toSide: boolean; ms?: number }) => {
      if (opts.toSide) settleView(Math.round(toC / 90) * 90); // tabs + readout jump to the destination
      const from = viewAngleRef.current;
      const to = toC - autoAngleRef.current;
      const dist = Math.abs(to - from);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || dist < 0.01) {
        tweenRef.current = null;
        viewAngleRef.current = to;
        ensureLoop();
        return;
      }
      const { turnMs90, turnMs180, minTurnMs } = VIEWER_VIEWS;
      const dur =
        opts.ms ??
        (dist <= 90
          ? Math.max(minTurnMs, (turnMs90 * dist) / 90)
          : turnMs90 + ((turnMs180 - turnMs90) * Math.min(90, dist - 90)) / 90);
      tweenRef.current = { from, to, t0: performance.now(), dur, frames: 0, toSide: opts.toSide };
      ensureLoop();
    },
    [settleView, ensureLoop],
  );
  // Tabs: shortest way round through the frames in between.
  const goTo = useCallback(
    (target: number) => {
      if (staticRef.current) return changeSide(target);
      takeOver();
      turnTo(sideTarget(aimed(), target), { toSide: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [turnTo, takeOver, changeSide],
  );
  // Arrows (lg): the next side in that direction (+1 = toward Kanan).
  const step = useCallback(
    (delta: 1 | -1) => {
      if (staticRef.current) return changeSide(sideRef.current + delta);
      takeOver();
      turnTo(nextSideTarget(aimed(), delta), { toSide: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [turnTo, takeOver, changeSide],
  );
  // ←/→ keys on the athlete: a few degrees per press (holding repeats).
  const onKeyTurn = useCallback(
    (deltaDeg: number) => {
      if (staticRef.current) {
        if (!fadeRef.current) changeSide(sideRef.current + Math.sign(deltaDeg)); // a held key: one side per crossfade
        return;
      }
      const from = tweenRef.current && !tweenRef.current.toSide ? aimed() : combined();
      takeOver();
      turnTo(from + deltaDeg, { toSide: false, ms: VIEWER_SPIN.keyTurnMs });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [turnTo, takeOver, changeSide],
  );
  // Horizontal trackpad / wheel: turns like a drag (the OS momentum is the inertia).
  const onWheelTurn = useCallback(
    (dx: number) => {
      if (staticRef.current) return; // sides switch on tabs / swipe / keys only
      takeOver();
      tweenRef.current = null;
      viewAngleRef.current -= dx * VIEWER_SPIN.wheelDegPerPx;
      releaseManualRef.current(); // each wheel event restarts the delay
      ensureLoop();
    },
    [takeOver, ensureLoop],
  );
  // Mouse / pen over the athlete: hold the spin while there (no snapping).
  const onHoverChange = useCallback(
    (over: boolean) => {
      if (staticRef.current) return; // the scenery keeps turning
      if (over) holdNow("hover");
      else resumeLater("hover", STAGE_ARENA.hoverResumeMs);
    },
    [holdNow, resumeLater],
  );
  // A tap / click on the athlete (not a drag): hold it where it is for a moment.
  const onTap = useCallback(() => {
    if (staticRef.current) return;
    takeOver();
    if (!manualTurnRef.current) releaseManualRef.current();
  }, [takeOver]);
  // A zone card is open (touch): no spin until it closes.
  const onZoneCardChange = useCallback(
    (open: boolean) => {
      if (staticRef.current) {
        if (!STAGE_STATIC.autoSides) return; // the scenery may keep turning behind a zone card
        // autoSides: no orbit and no side change while a sponsor reads the card.
        if (open) {
          const t = resumeTimersRef.current.get("zone");
          if (t) clearTimeout(t);
          resumeTimersRef.current.delete("zone");
          pausesRef.current.add("zone");
          ensureLoop();
        } else resumeLater("zone", STAGE_STATIC.resumeMs);
        return;
      }
      if (open) holdNow("zone");
      else resumeLater("zone", STAGE_ARENA.autoRotateResumeMs);
    },
    [holdNow, resumeLater],
  );
  // Stage frame media: tap a screen (not the athlete, not a button) → lightbox;
  // the spin holds while it is open, like a zone card.
  const screens = athlete.stageScreens ?? NO_SCREENS;
  const [media, setMedia] = useState<StageScreen | null>(null);
  const openMedia = useCallback(
    (sc: StageScreen | null) => {
      setMedia(sc);
      onZoneCardChange(!!sc);
    },
    [onZoneCardChange],
  );
  const closeMedia = useCallback(() => openMedia(null), [openMedia]);
  const tapRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const screenAt = (e: React.PointerEvent) => {
    const el = e.target as HTMLElement;
    if (!screens.length || el.closest("a,button,input,select,[role=dialog]") || figureRef.current?.contains(el)) return null;
    const slot = arenaHandle.current.mediaHit?.(e.clientX, e.clientY);
    return slot == null ? null : screens.find((x) => x.slot === slot) ?? null;
  };
  const onStagePointerDown = (e: React.PointerEvent) => {
    tapRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onStagePointerUp = (e: React.PointerEvent) => {
    const d = tapRef.current;
    tapRef.current = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 600) return;
    const sc = screenAt(e);
    if (sc) openMedia(sc);
  };
  const onStagePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !screens.length || !sectionRef.current) return;
    sectionRef.current.style.cursor = screenAt(e) ? "pointer" : "";
  };

  // Keyboard focus on the athlete no longer holds the spin: keyboard users
  // pause / play with Space (a focus hold made Space→Play look broken).
  const onFocusChange = useCallback(() => {}, []);
  // Drag: the angle follows the finger / pointer (right = toward Kanan); on
  // release it keeps turning a little and slows down (inertia), then stays
  // exactly there (no snapping to a side) until the spin comes back.
  const onDragStart = useCallback(() => {
    swipeRef.current = 0;
    if (staticRef.current) return;
    takeOver();
    tweenRef.current = null;
    dragRef.current = { base: viewAngleRef.current, angle: viewAngleRef.current };
  }, [takeOver]);
  const onDragMove = useCallback(
    (dx: number) => {
      swipeRef.current = dx;
      const d = dragRef.current;
      if (!d) return;
      d.angle = d.base + (dx / VIEWER_VIEWS.dragPxPer90) * 90;
      ensureLoop();
    },
    [ensureLoop],
  );
  const onDragEnd = useCallback(
    (vx: number) => {
      if (staticRef.current) {
        // A swipe: right = the next side toward Kanan (as the turn's drag).
        const dx = swipeRef.current;
        if (Math.abs(dx) >= STAGE_STATIC.swipeMinPx) changeSide(sideRef.current + (dx > 0 ? 1 : -1));
        return;
      }
      const d = dragRef.current;
      dragRef.current = null;
      if (d) viewAngleRef.current = d.angle;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const v = vx * 1000 * (90 / VIEWER_VIEWS.dragPxPer90); // deg/s
      const cap = VIEWER_SPIN.inertiaMaxDegPerSec;
      inertiaRef.current = reduced || Math.abs(v) < VIEWER_SPIN.inertiaMinDegPerSec ? 0 : Math.max(-cap, Math.min(cap, v));
      ensureLoop();
    },
    [ensureLoop, changeSide],
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
      ref={sectionRef}
      className={`relative overflow-hidden rounded-3xl border border-white/10 bg-[#100a0c] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ${
        arenaOn ? "stagecard-arena-on" : ""
      } stagecard-fit`}
      style={{ ["--stage-tilt" as string]: STAGE_TILT, ...stageFitVars() } as React.CSSProperties}
      onPointerDown={onStagePointerDown}
      onPointerUp={onStagePointerUp}
      onPointerMove={onStagePointerMove}
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
            platform={platform}
            platformLocked={isStatic}
            screens={screens}
            screensActive={photosReady}
            onFail={() => {
              setArenaOn(false);
              setArenaWanted(false);
            }}
          />
        </div>
      )}
      {/* "static-athlete" without WebGL: neon lines behind the athlete drift
          sideways as the scenery orbits (the CSS ring platform stays still). */}
      {isStatic && has360 && !arenaOn && (
        <div className="stagecard-bglines pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
          <div
            ref={bgLinesRef}
            className="stagecard-bglines-track absolute inset-y-0 left-0"
            style={{ ["--bgl-period" as string]: `${STAGE_STATIC.cssLinePeriodPx}px` }}
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
            "radial-gradient(620px 520px at 62% 42%, rgba(0,180,255,0.22), transparent 70%), radial-gradient(130% 100% at 50% 45%, transparent 55%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      <div className="relative z-10 grid gap-4 p-[var(--stagecard-pad)] [--stagecard-pad:1.25rem] max-lg:flex max-lg:flex-col max-lg:gap-0 sm:[--stagecard-pad:1.75rem] lg:grid-cols-[minmax(0,340px)_1fr] lg:gap-6">
        {/* ------------------------------------------------- LEFT: identity + stats
            Below lg this column dissolves (contents) so the stage comes right
            after the name and the athlete keeps its full size; podium and
            stats follow below the stage. */}
        <div className="flex flex-col max-lg:contents">
          <div className="flex items-baseline gap-3 max-lg:order-1">
            <span className="font-mono text-sm text-[#00b4ff]">
              {athlete.rank != null ? String(athlete.rank).padStart(2, "0") : "--"}
            </span>
            <h1 className="font-condensed text-4xl font-bold uppercase leading-[0.92] sm:text-5xl">{athlete.nama}</h1>
          </div>
          <p className="mt-1.5 text-sm text-white/55 max-lg:order-2">
            {[athlete.discipline ?? tGender(m, athlete.gender), athlete.kota].filter(Boolean).join(" · ")}
          </p>

          {/* Podium + medal breakdown */}
          <div className="mt-6 flex items-start gap-6 max-lg:order-4 max-lg:mt-2">
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
            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 max-lg:order-5">
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
                      <span className="font-mono text-xs text-[#00b4ff]">{athlete.totalTerbaikLabel}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Athlete carousel dots (desktop pinned to bottom of the left column) */}
          {dots.length > 1 && (
            // Position indicator only: dots are far too small to tap (44px each
            // would not fit); the 44px prev/next arrows at the card edges navigate.
            <div className="mt-8 hidden flex-wrap items-center gap-1.5 lg:flex" aria-hidden>
              {dots.map((d) => (
                <span key={d.id} className={d.active ? "h-1.5 w-5 rounded-full bg-[#00b4ff]" : "h-1.5 w-1.5 rounded-full bg-white/25"} />
              ))}
            </div>
          )}
        </div>

        {/* ------------------------------------------------- RIGHT: 360 stage */}
        {/* container-type lets the platform (anchored inside the figure) size itself
            against this column's width; pb reserves room for the CTA below the ring. */}
        <div className="relative flex min-h-[56vh] items-center justify-center pb-32 pt-14 max-lg:order-3 max-lg:mt-2 supports-[height:1svh]:min-h-[56svh] sm:pt-10 [container-type:inline-size] lg:min-h-[72vh] lg:pt-0 lg:supports-[height:1svh]:min-h-[72svh]">
          {/* Spotlight cone behind everything, from the card's top edge */}
          <div className="stagecard-spot" aria-hidden />

          {/* Active view readout + hint. Phones: one centred line above the
              figure. sm+: top-right, sized to the stage column and capped to the
              space beside the figure so it never runs off-card or into the head. */}
          {has360 && (
            <div
              className="stagecard-readout pointer-events-none z-20"
              aria-hidden
              style={
                {
                  "--ro-scrim-full": STAGE_READOUT.scrimOpacity,
                  "--ro-spread": `${STAGE_READOUT.scrimSpreadPx}px`,
                  "--ro-shadow-full": STAGE_READOUT.textShadowOpacity,
                  "--ro-hint": STAGE_READOUT.hintOpacity,
                  "--ro-glow-full": `${STAGE_READOUT.textGlowPx}px`,
                  "--ro-scrim-compact": STAGE_READOUT.compact.scrimOpacity,
                  "--ro-shadow-compact": STAGE_READOUT.compact.textShadowOpacity,
                  "--ro-glow-compact": `${STAGE_READOUT.compact.textGlowPx}px`,
                } as React.CSSProperties
              }
            >
              <div ref={sideNameRef} className="stagecard-readout-name font-condensed font-bold uppercase leading-none transition-opacity">
                {viewNames[view]}
              </div>
              <div ref={degRef} className="stagecard-readout-deg font-mono text-xs text-[#00b4ff] tabular-nums">
                0°
              </div>
              <p className="stagecard-readout-hint font-mono text-[11px] leading-snug">{isStatic ? m.sc_hintStatic : m.sc_hint}</p>
            </div>
          )}

          {/* The figure */}
          <div ref={figureRef} className="relative isolate mx-auto w-full" style={{ maxWidth: "min(300px, 78vw)" }}>
            {/* Neon platform, centered on the athlete's feet line and painted before
                (so behind) the figure — the feet stay uncovered and untinted. */}
            <div
              ref={platformRef}
              className="stagecard-platform"
              style={{ bottom: `${VIEWER_360.feetLinePct}%`, ["--feet-forward" as string]: STAGE_ARENA.feetForward }}
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
                media={media360!}
                view={isStatic ? shownSide : view}
                onKeyTurn={onKeyTurn}
                onTogglePlay={togglePlay}
                onWheelTurn={onWheelTurn}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onHoverChange={onHoverChange}
                onTap={onTap}
                onFocusChange={onFocusChange}
                onReady={() => {
                  setPhotosReady(true);
                  sidePaintRef.current = -1; // paint the side once its photo is in
                  ensureLoop();
                }}
                staticSides={isStatic}
                onVideoSettled={() => resume("video")}
                onZoneCardChange={onZoneCardChange}
                arena={arenaOn ? arenaHandle : undefined}
                debug={debugFeet}
                debugPerf={debugPerf}
                debugVideo={debugVideo}
                describe={(a) =>
                  isStatic
                    ? fmt(m.sc_stageSide, { name: athlete.nama, side: viewNames[nearestSide(a).side].toLocaleLowerCase(intl) })
                    : fmt(m.sc_stageImg, { name: athlete.nama, side: viewNames[nearestSide(a).side], deg: degreeLabel(a) })
                }
                m={m}
                label={`${athlete.nama}. ${isStatic ? m.sc_keysHintStatic : m.sc_keysHint}`}
              />
            ) : (
              <div className={`relative mx-auto ${VIEWER_360_FRAME_CLASS}`} style={figureStyle}>
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
            {/* "Place Your Logo" CTA just under the platform's front edge: anchored
                to the feet line (the platform scales with the figure), so it never
                covers the feet. Below the zone markers (z-10) and the zone card. */}
            <a
              href="#zona-sponsor"
              className="absolute left-1/2 z-[5] -translate-x-1/2 whitespace-nowrap rounded-full bg-[#00b4ff] px-8 py-3 text-sm font-semibold text-white shadow-[0_0_26px_rgba(0,180,255,0.45)] transition-colors hover:bg-[#0093d1]"
              style={{ top: `${100 - VIEWER_360.feetLinePct + STAGE_CTA.dropPct}%` }}
            >
              {m.pub_placeLogo}
            </a>
            {/* Feet glow: platform light rising over the shoes, so the soles blend
                into the lit floor instead of ending on a hard edge. */}
            <div
              aria-hidden
              className="stage-feet-glow pointer-events-none absolute inset-x-0 z-[4]"
              style={
                {
                  bottom: `${VIEWER_360.feetLinePct - STAGE_FEET_BLEND.glowHeightPct / 2}%`,
                  height: `${STAGE_FEET_BLEND.glowHeightPct}%`,
                  "--feet-glow": STAGE_FEET_BLEND.glowOpacity,
                } as React.CSSProperties
              }
            />
          </div>

          {/* View switcher: ‹ ⏯ Depan · Kanan · Belakang · Kiri › (above the CTA);
              below lg without the ‹ › (swipe, tabs and keys turn the athlete).
              Hidden while STAGE_VIEW_CONTROLS is off. */}
          {has360 && STAGE_VIEW_CONTROLS && (
            <div className="absolute inset-x-0 bottom-[3.75rem] z-20 flex items-center justify-center gap-1.5 px-2">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={m.view_prev}
                className="group flex h-11 w-11 shrink-0 items-center justify-center max-lg:hidden"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur [@media(pointer:coarse)]:bg-black/65 [@media(pointer:coarse)]:backdrop-blur-none transition-colors group-hover:border-white/40 group-hover:text-white">
                  <ChevronLeft size={16} />
                </span>
              </button>
              {/* Play / Pause of the auto-rotation (44px target). */}
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isStatic ? m.sc_bgRotate : m.sc_autoRotate}
                aria-pressed={playing}
                title={isStatic ? (playing ? m.sc_pauseBg : m.sc_playBg) : playing ? m.sc_pause : m.sc_play}
                className="group flex h-11 w-11 shrink-0 items-center justify-center"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur [@media(pointer:coarse)]:bg-black/65 [@media(pointer:coarse)]:backdrop-blur-none transition-colors group-hover:border-white/40 group-hover:text-white">
                  {playing ? <Pause size={14} /> : <Play size={14} className="translate-x-px" />}
                </span>
              </button>
              {/* Tabs: 44px tall touch targets; the pill track stays slim (drawn behind). */}
              <div role="tablist" aria-label={m.view_tabs} className="relative flex px-0.5">
                <span aria-hidden className="absolute inset-x-0 top-1/2 h-[30px] -translate-y-1/2 rounded-full border border-white/10 bg-black/50 backdrop-blur [@media(pointer:coarse)]:bg-black/65 [@media(pointer:coarse)]:backdrop-blur-none" />
                {VIEW_KEYS.map((k, i) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={view === i}
                    onClick={() => goTo(i)}
                    className="group relative flex h-11 items-center"
                  >
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors sm:px-3.5 sm:text-xs ${
                        view === i
                          ? "bg-[#00b4ff] text-white shadow-[0_0_14px_rgba(0,180,255,0.55)]"
                          : "text-white/60 group-hover:text-white"
                      }`}
                    >
                      {viewNames[i]}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={m.view_next}
                className="group flex h-11 w-11 shrink-0 items-center justify-center max-lg:hidden"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur [@media(pointer:coarse)]:bg-black/65 [@media(pointer:coarse)]:backdrop-blur-none transition-colors group-hover:border-white/40 group-hover:text-white">
                  <ChevronRight size={16} />
                </span>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Stage frame media for keyboard / screen readers (the 3D screens are
          tap targets only): hidden until focused. */}
      {screens.length > 0 && (
        <ul className="absolute left-3 top-3 z-40 flex flex-col gap-1">
          {screens.map((sc) => (
            <li key={sc.slot}>
              <button
                type="button"
                onClick={() => openMedia(sc)}
                className="sr-only rounded-full bg-black/80 px-4 py-2 text-xs font-semibold text-white focus:not-sr-only focus:inline-flex focus:min-h-11 focus:items-center"
              >
                {fmt(sc.kind === "image" ? m.sml_view : sc.kind === "instagram" ? m.sml_open_ig : m.sml_play, { title: sc.title || fmt(m.sml_screen, { n: sc.slot + 1 }) })}
              </button>
            </li>
          ))}
        </ul>
      )}
      {media && <StageMediaLightbox screen={media} m={m} onClose={closeMedia} />}

      {/* Carousel arrows (card edges, vertically centered) */}
      {prev && (
        <Link
          href={`/atlet/${prev.id}`}
          aria-label={`${m.sc_prev}: ${prev.nama}`}
          className="absolute left-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/80 backdrop-blur [@media(pointer:coarse)]:bg-black/60 [@media(pointer:coarse)]:backdrop-blur-none transition-colors hover:border-white/40 hover:text-white sm:left-5"
        >
          <ChevronLeft size={20} />
        </Link>
      )}
      {next && (
        <Link
          href={`/atlet/${next.id}`}
          aria-label={`${m.sc_next}: ${next.nama}`}
          className="absolute right-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/80 backdrop-blur [@media(pointer:coarse)]:bg-black/60 [@media(pointer:coarse)]:backdrop-blur-none transition-colors hover:border-white/40 hover:text-white sm:right-5"
        >
          <ChevronRight size={20} />
        </Link>
      )}

      {/* Dots on mobile (below the stage, centered) */}
      {dots.length > 1 && (
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-1.5 pb-5 lg:hidden" aria-hidden>
          {dots.map((d) => (
            <span key={d.id} className={d.active ? "h-1.5 w-5 rounded-full bg-[#00b4ff]" : "h-1.5 w-1.5 rounded-full bg-white/25"} />
          ))}
        </div>
      )}

      {/* Reduced-motion / no-JS friendly rotate hint under the readout is optional; the
          Viewer360 already renders its own counter + hint when active. */}
      <span className="sr-only">
        <RotateCcw size={12} /> {isStatic ? m.sc_dragOnlyStatic : m.sc_dragOnly}
      </span>
      <span ref={liveRef} className="sr-only" aria-live="polite" />
      {debugViewport && <ViewportDebug sectionRef={sectionRef} />}
    </section>
  );
}
