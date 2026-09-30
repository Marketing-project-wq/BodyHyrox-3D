"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Media360 } from "@/lib/data";
import { VIEW_ANGLES, VIEW_KEYS, frameAngles } from "@/lib/views";
import { STAGE_ARENA, VIEWER_360, VIEWER_360_FRAME_CLASS, VIEWER_SPIN, VIEWER_VIEWS, viewer360FrameStyle } from "@/lib/config";
import { blendAmount, bracket, loadOrder, nearestSide, norm360 } from "@/lib/spin";
import { FrameCache } from "@/lib/frame-cache";
import { type Dict } from "@/lib/i18n";
import { formatIDR } from "@/lib/format";
import { footIsCurrent, frameCss, measureFrame, soleLifted, transformFoot, type Foot } from "@/lib/media360";
import type { ArenaHandle } from "@/components/StageArena3D";
import type { MutableRefObject } from "react";
import { X } from "lucide-react";

/** Imperative API: the stage card's single orbit loop paints the athlete here. */
export type AthleteViewsHandle = {
  /**
   * Paint the athlete at this orbit angle (deg, any real number). `moving` hides
   * the zone markers; `turning` (a view change, not the idle spin) enables the
   * squeeze cue of the 4-photo fallback.
   */
  render: (angleDeg: number, moving: boolean, turning?: boolean) => void;
};

type DragCallbacks = {
  onDragStart: () => void;
  /** Horizontal finger/mouse offset since the drag started (px, + = right). */
  onDragMove: (dxPx: number) => void;
  /** Release velocity (px/ms, + = right). */
  onDragEnd: (vxPxPerMs: number) => void;
};

type GroundHit = { inside: boolean; scale: number };

/** Place a full-box .stage-shadow-t: centre (cx, cy) and size (w, h), as fractions of the box. */
const shadowTransform = (cx: number, cy: number, w: number, h: number) =>
  `translate(${(cx * 100).toFixed(2)}%, ${(cy * 100).toFixed(2)}%) scale(${w.toFixed(4)}, ${h.toFixed(4)}) translate(-50%, -50%)`;

const mixFoot = (p: Foot, q: Foot, t: number): Foot => ({
  toe: p.toe + (q.toe - p.toe) * t,
  back: p.back + (q.back - p.back) * t,
  left: p.left + (q.left - p.left) * t,
  right: p.right + (q.right - p.right) * t,
});

/**
 * Athlete, painted from one orbit angle on two stacked canvases: the nearest
 * frame below, the next one fading in on top (VIEWER_SPIN.crossfadeShare).
 * Frames load progressively (the four sides first, then spread evenly round
 * the turn) and every loaded frame is used right away, so the turn gets
 * smoother while it loads. Only a few frames are decoded at a time (see
 * FrameCache). If the frame order can't be mapped to angles, only the four
 * side photos are used, with a subtle squeeze/shift as a "turn" cue.
 */
export const AthleteViews = forwardRef<
  AthleteViewsHandle,
  {
    athleteId: string;
    media: Media360;
    /** Settled view index (0 Depan … 3 Kiri) — which zone markers to show. */
    view: number;
    m: Dict;
    label: string;
    /** ←/→ keys: turn by this many degrees (+ = toward Kanan). */
    onKeyTurn: (deltaDeg: number) => void;
    /** Space: play / pause the auto-rotation. */
    onTogglePlay?: () => void;
    /** Horizontal trackpad / wheel scroll over the athlete (px, deltaX). */
    onWheelTurn?: (deltaXPx: number) => void;
    /** The four view photos are decoded and painted. */
    onReady?: () => void;
    /** The 3D arena (when running): tells whether each sole lands on the platform top. */
    arena?: MutableRefObject<ArenaHandle>;
    /** ?debug=feet: draw the platform top face and each foot's contact point. */
    debug?: boolean;
    /** A zone card opened (touch) or closed: the stage holds its idle spin meanwhile. */
    onZoneCardChange?: (open: boolean) => void;
    /** Mouse over / off the athlete. */
    onHoverChange?: (over: boolean) => void;
    /** A press on the athlete that did not become a drag (tap / click). */
    onTap?: () => void;
    /** Keyboard focus on / off the athlete. */
    onFocusChange?: (focused: boolean) => void;
  } & DragCallbacks
>(function AthleteViews(
  { athleteId, media, view, m, label, onKeyTurn, onTogglePlay, onWheelTurn, onReady, onHoverChange, onTap, onFocusChange, onDragStart, onDragMove, onDragEnd, arena, debug, onZoneCardChange },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const debugRef = useRef<SVGSVGElement>(null);
  const arenaRef = useRef(arena);
  arenaRef.current = arena;
  const debugOn = useRef(!!debug);
  debugOn.current = !!debug;
  // Set below; paint() closes an open zone card when the stage starts moving.
  const closeCardRef = useRef<() => void>(() => {});
  const router = useRouter();
  const base = media.baseUrl.replace(/\/$/, "");
  const frames = media.frames;
  const viewFiles = VIEW_KEYS.map((k) => media.views?.[k] ?? frames[0]);
  const viewIdx = viewFiles.map((f) => Math.max(0, frames.indexOf(f)));
  const viewIdxRef = useRef(viewIdx);
  viewIdxRef.current = viewIdx;
  const angles = useMemo(() => frameAngles(frames, media.views), [frames, media.views]);

  // Two canvases: [0] = the frame below (opaque), [1] = the one fading in.
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([null, null]);
  const layerFrame = useRef<number[]>([-1, -1]); // frame drawn on each canvas
  const cacheRef = useRef<FrameCache | null>(null);
  const repaintRaf = useRef(0);
  const stackRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<HTMLDivElement>(null);
  const shadowsRef = useRef<HTMLDivElement>(null);
  // Cached stage box (client coords) and platform raycasts; see paint().
  const boxRef = useRef<DOMRect | null>(null);
  const layoutVerRef = useRef(0);
  const groundCacheRef = useRef<{ key: string; a: number; hits: (GroundHit | null)[] } | null>(null);
  const poolRef = useRef<HTMLDivElement>(null);
  const soleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const feetRef = useRef<(Foot | null)[]>([]); // per frame index, after its transform
  const rawFeetRef = useRef<(Foot | null)[]>([]); // as measured (transform pivot)
  const meta = media.frameMeta ?? {};
  const loadedRef = useRef<Set<number>>(new Set()); // files downloaded (compressed)
  const lastRef = useRef<{ a: number; moving: boolean; turning: boolean }>({ a: 0, moving: false, turning: false });
  const [ready, setReady] = useState(false);

  const url = useCallback((i: number) => `${base}/${frames[i]}`, [base, frames]);

  // Keyframes: every loaded frame at its angle (progressive), or only the 4
  // side photos when the frame order can't be mapped to angles.
  const keyframes = useCallback((): { a: number; i: number }[] => {
    const loaded = loadedRef.current;
    if (angles) {
      const k = angles.map((a, i) => ({ a: norm360(a), i })).filter((x) => loaded.has(x.i));
      if (k.length) return k.sort((x, y) => x.a - y.a);
    }
    return VIEW_ANGLES.map((a, k) => ({ a, i: viewIdx[k] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angles, viewIdx.join(",")]);

  // Canvas backing size = its CSS size × DPR (capped); frames decode at that height.
  const sizeCanvases = useCallback((box: DOMRect) => {
    const dpr = Math.min(window.devicePixelRatio || 1, VIEWER_SPIN.maxDpr);
    const w = Math.max(1, Math.round(box.width * dpr));
    const h = Math.max(1, Math.round(box.height * dpr));
    for (const c of canvasRefs.current) {
      if (c && (c.width !== w || c.height !== h)) {
        c.width = w;
        c.height = h;
        layerFrame.current = [-1, -1];
      }
    }
    cacheRef.current?.setTargetHeight(h);
  }, []);

  // Draw frame i on canvas `layer` (only when it changes). Returns false if its
  // bitmap isn't decoded yet (it is requested; the next paint draws it).
  const drawLayer = (layer: number, i: number): boolean => {
    const c = canvasRefs.current[layer];
    const cache = cacheRef.current;
    if (!c || !cache) return false;
    if (layerFrame.current[layer] === i) return true;
    const bmp = cache.get(i);
    if (!bmp) {
      cache.request(i).then((b) => {
        if (b) schedulePaint();
      });
      return false;
    }
    const g = c.getContext("2d");
    if (!g) return false;
    g.imageSmoothingQuality = "high";
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    layerFrame.current[layer] = i;
    // The frame's own (non-destructive) transform pivots on its measured feet.
    const fc = frameCss(meta[frames[i]]?.t, rawFeetRef.current[i] ?? meta[frames[i]]?.foot);
    c.style.transformOrigin = fc.transformOrigin;
    c.style.transform = fc.transform === "none" ? "" : fc.transform;
    return true;
  };
  const schedulePaint = () => {
    if (repaintRaf.current) return;
    repaintRaf.current = requestAnimationFrame(() => {
      repaintRaf.current = 0;
      paintRef.current(lastRef.current.a, lastRef.current.moving, lastRef.current.turning);
    });
  };

  const paint = useCallback(
    (angleDeg: number, moving: boolean, turning = false) => {
      lastRef.current = { a: angleDeg, moving, turning };
      // Layout read only after a resize / scroll invalidated the cached box.
      let box = boxRef.current;
      if (!box && rootRef.current) {
        box = rootRef.current.getBoundingClientRect();
        boxRef.current = box;
      }
      const A = norm360(angleDeg);
      const kf = keyframes();
      const fullTurn = !!angles && kf.length > 4;
      const br = bracket(A, kf);
      const t = Math.min(1, Math.max(0, br.t));
      // Upper frame's share: a centred blend (crisp frames at both ends), or the
      // whole step between the 4 side photos of the fallback.
      let a = br.hi === br.lo ? 0 : angles ? blendAmount(t, VIEWER_SPIN.crossfadeShare) : t;
      let base = br.lo;
      if (a >= 1) {
        base = br.hi; // past the blend: the next frame alone
        a = 0;
      }
      const lo = { i: base };
      const hi = { i: br.hi };
      // Draw: the frame below on canvas 0, the one fading in on canvas 1. A
      // frame not decoded yet keeps the previous picture for a moment.
      const cache = cacheRef.current;
      const EPS = 0.002;
      const showHi = base === br.lo && a > EPS && br.hi !== br.lo;
      if (cache) {
        cache.pin(showHi ? [base, br.hi] : [base]);
        drawLayer(0, base);
        const hiOk = showHi && drawLayer(1, br.hi);
        const c0 = canvasRefs.current[0];
        const c1 = canvasRefs.current[1];
        if (c0) c0.style.opacity = "1";
        if (c1) c1.style.opacity = hiOk ? String(a) : "0";
        // ?debug=feet also shows how many frames are decoded (memory check).
        if (debugOn.current && rootRef.current) rootRef.current.dataset.decoded = `${cache.decodedCount}/${cache.limit}`;
        // Decode the next frames on both sides ahead of the turn.
        const at = kf.findIndex((k) => k.i === base);
        for (let d = 1; at >= 0 && d <= VIEWER_SPIN.prefetch; d++) {
          cache.request(kf[(at + d) % kf.length].i);
          cache.request(kf[(at - d + kf.length * 4) % kf.length].i);
        }
      }
      // Feet on the platform: shift the photo (and its zone markers) so the
      // shown frame's sole line lands exactly on the platform surface line
      // (the feet line), sinking FOOT_OVERLAP px into it so antialiasing never
      // leaves a hairline gap. Values are fractions of the box, so it holds at
      // any size. Blends mix the two frames' feet the same way as the photos.
      const feet = feetRef.current;
      const fallback: Foot = { toe: 1 - VIEWER_360.feetLinePct / 100, back: 1 - VIEWER_360.feetLinePct / 100, left: 0.3, right: 0.7 };
      const fBase = feet[base] ?? fallback;
      const foot = showHi ? mixFoot(fBase, feet[hi.i] ?? fallback, a) : fBase;
      const line = 1 - VIEWER_360.feetLinePct / 100; // platform surface, fraction of the box from the top
      const shift = `translateY(calc(${((line - foot.toe) * 100).toFixed(3)}% + ${STAGE_ARENA.footOverlapPx}px))`;
      // Fallback "turn" cue (only when stepping between the 4 view photos).
      const stack = stackRef.current;
      if (stack) {
        if (!fullTurn && !angles && turning) {
          const s = Math.sin(Math.PI * t);
          stack.style.transform = `${shift} translateX(${(VIEWER_VIEWS.fallbackShiftPct * s).toFixed(2)}%) scaleX(${(
            1 -
            VIEWER_VIEWS.fallbackSqueeze * s
          ).toFixed(4)})`;
        } else {
          stack.style.transform = shift;
        }
      }
      // Markers are stored on the untransformed photo of their side: carry
      // that frame's own transform so they stay on the body.
      const mk0 = markersRef.current;
      const sideFrame = viewIdxRef.current[nearestSide(A).side];
      if (mk0) {
        const fc = frameCss(meta[frames[sideFrame]]?.t, rawFeetRef.current[sideFrame] ?? meta[frames[sideFrame]]?.foot);
        mk0.style.transformOrigin = fc.transformOrigin;
        mk0.style.transform = fc.transform === "none" ? shift : `${shift} ${fc.transform}`;
      }
      // Contact shadows (drawn in the photo's own coordinates, shifted with it),
      // one per sole, from whichever frame dominates the blend. A sole whose
      // contact point lands on the platform's top face (asked of the 3D camera)
      // is planted: tight dark shadow right under it, smaller further back like
      // the floor. A sole marked lifted in the studio, or off the platform:
      // faint, wider shadow. Plus a soft pool spanning the planted soles.
      const shadows = shadowsRef.current;
      const lead = showHi && a >= 0.5 ? feet[hi.i] ?? foot : foot;
      const soles = lead.soles?.length ? lead.soles : [[lead.left, lead.right, lead.toe]];
      const S = STAGE_ARENA;
      const ground = arenaRef.current?.current.groundHit ?? null;
      const shiftFrac = line - foot.toe; // same shift as the photo
      // Raycasts are cached: redo them only for a new leading frame, a turn of
      // more than groundRecheckDeg, or a layout change.
      const hits: (GroundHit | null)[] = [];
      const leadIdx = showHi && a >= 0.5 ? hi.i : base;
      const gc = groundCacheRef.current;
      const key = `${leadIdx}|${feet[leadIdx] ? 1 : 0}|${ground ? 1 : 0}|${layoutVerRef.current}`;
      const dA = gc ? Math.abs(((A - gc.a + 540) % 360) - 180) : Infinity;
      const recheck = !gc || gc.key !== key || dA > S.groundRecheckDeg;
      const contacts = soles.map((sole, k) => {
        const [x0, x1, b] = sole;
        const cx = box ? box.left + ((x0 + x1) / 2) * box.width : 0;
        const cy = box ? box.top + (b + shiftFrac) * box.height + S.footOverlapPx : 0;
        let planted = !soleLifted(sole);
        let scale = 1;
        if (planted && ground && box) {
          const cached = recheck ? undefined : gc?.hits[k];
          const g = cached !== undefined ? cached : ground(cx, cy);
          if (recheck) hits[k] = g;
          if (g) {
            planted = g.inside;
            scale = Math.min(1.2, Math.max(0.6, g.scale));
          }
        }
        return { x0, x1, b, planted, scale, cx, cy };
      });
      if (recheck) groundCacheRef.current = { key, a: A, hits };
      if (shadows) {
        shadows.style.transform = shift;
        soleRefs.current.forEach((el, k) => {
          if (!el) return;
          const c = contacts[k];
          if (!c) {
            el.style.opacity = "0";
            return;
          }
          const wide = c.planted ? 1 : S.liftedShadowWidth;
          const tall = c.planted ? 1 : S.liftedShadowHeight;
          el.style.opacity = c.planted ? "1" : String(S.liftedShadowOpacity);
          el.style.transform = shadowTransform(
            (c.x0 + c.x1) / 2,
            c.b - S.soleShadowRise * c.scale,
            Math.max(c.x1 - c.x0, S.soleShadowMinSpan) * S.soleShadowWidth * wide * c.scale,
            S.soleShadowHeight * tall * c.scale,
          );
        });
        const pool = poolRef.current;
        if (pool) {
          const ps = contacts.some((c) => c.planted) ? contacts.filter((c) => c.planted) : contacts;
          const x0 = Math.min(...ps.map((c) => c.x0));
          const x1 = Math.max(...ps.map((c) => c.x1));
          const b1 = Math.max(...ps.map((c) => c.b));
          const b0 = Math.min(...ps.map((c) => c.b));
          pool.style.transform = shadowTransform((x0 + x1) / 2, (b0 + b1) / 2 - S.soleShadowRise, (x1 - x0) * 1.35, b1 - b0 + S.poolShadowHeight);
        }
      }
      // ?debug=feet overlay: platform top face (cyan), each contact point
      // (yellow = planted, red = lifted / off the platform), feet line (red).
      const dbg = debugRef.current;
      if (dbg && debugOn.current && box) {
        const poly = arenaRef.current?.current.outline?.() ?? [];
        const pts = poly.map(([x, y]) => `${(x - box.left).toFixed(1)},${(y - box.top).toFixed(1)}`).join(" ");
        const gy = (line * box.height + S.footOverlapPx).toFixed(1);
        dbg.innerHTML =
          (pts ? `<polygon points="${pts}" fill="rgba(0,255,255,0.12)" stroke="#22d3ee" stroke-width="2"/>` : "") +
          `<line x1="-40" x2="${box.width + 40}" y1="${gy}" y2="${gy}" stroke="#ff2d55" stroke-dasharray="6 4"/>` +
          contacts
            .map((c) => {
              const x = (c.cx - box.left).toFixed(1);
              const y = (c.cy - box.top).toFixed(1);
              const col = c.planted ? "#facc15" : "#ef4444";
              const x0 = (c.x0 * box.width).toFixed(1);
              const x1 = (c.x1 * box.width).toFixed(1);
              return `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="5" fill="${col}" stroke="#000"/>`;
            })
            .join("");
      }
      // Zone markers (option A): a side's markers show while the athlete is
      // at rest within VIEWER_SPIN.markerWindowDeg of that side.
      const mk = markersRef.current;
      if (moving) closeCardRef.current();
      const near = nearestSide(A).off <= VIEWER_SPIN.markerWindowDeg;
      const showMk = !moving && near;
      if (!near) closeCardRef.current();
      if (mk) {
        mk.style.opacity = showMk ? "1" : "0";
        mk.style.visibility = showMk ? "visible" : "hidden";
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyframes, angles],
  );
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useImperativeHandle(ref, () => ({ render: paint }), [paint]);

  // Feet metrics: the precomputed feet.json next to the frames, else measure
  // each decoded frame in the browser, else the config feet line.
  const feetJsonRef = useRef<Record<string, Foot> | null | undefined>(undefined);
  // Visitor-side measuring: a small copy of the frame, never full resolution.
  const measureSmall = async (i: number): Promise<Foot | null> => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res) => {
      img.onload = () => res();
      img.onerror = () => res();
      img.src = url(i);
    });
    return img.naturalWidth ? measureFrame(img, VIEWER_360.footMeasureMaxW) : null;
  };
  // One measurement per idle slot, in the order asked (the four views first).
  const idleQueue = useRef<(() => Promise<void>)[]>([]);
  const idleBusy = useRef(false);
  const whenIdle = (job: () => Promise<void>) => {
    idleQueue.current.push(job);
    if (idleBusy.current) return;
    idleBusy.current = true;
    const ric: (cb: () => void) => void =
      typeof window.requestIdleCallback === "function"
        ? (cb) => window.requestIdleCallback(cb, { timeout: 2000 })
        : (cb) => setTimeout(cb, 200);
    const next = () =>
      ric(async () => {
        const j = idleQueue.current.shift();
        if (j) await j().catch(() => undefined);
        if (idleQueue.current.length) next();
        else idleBusy.current = false;
      });
    next();
  };
  const ensureFoot = useCallback(
    async (i: number) => {
      if (feetRef.current[i]) return;
      const fm = meta[frames[i]];
      const setFoot = (f: Foot | null) => {
        rawFeetRef.current[i] = f;
        feetRef.current[i] = f ? transformFoot(f, fm?.t) : null;
        // The transform pivots on the measured feet: redraw a canvas showing i.
        layerFrame.current = layerFrame.current.map((x) => (x === i ? -1 : x));
      };
      // Stored feet only when measured with the current (two-contact) rules
      // or placed by hand. Older ones anchor with their stored toe right away;
      // their contact points are measured small, in idle time.
      // (cast: keep TS from narrowing fm.foot to never below)
      if (footIsCurrent(fm?.foot as Foot | undefined)) {
        setFoot(fm!.foot!);
        return;
      }
      const old: Foot | undefined = fm?.foot ?? undefined;
      if (old) {
        setFoot({ toe: old.toe, back: old.back, left: old.left, right: old.right });
        whenIdle(async () => {
          const r = await measureSmall(i);
          if (!r?.soles?.length) return;
          // Keep the stored anchor: move the small-scale soles onto its toe.
          const d = old.toe - r.toe;
          setFoot({ toe: old.toe, back: old.back, left: old.left, right: old.right, soles: r.soles.map(([x0, x1, b, ...rest]) => [x0, x1, b + d, ...rest]) });
          groundCacheRef.current = null;
          paint(lastRef.current.a, lastRef.current.moving, lastRef.current.turning);
        });
        return;
      }
      if (feetJsonRef.current === undefined) {
        feetJsonRef.current = null;
        try {
          const r = await fetch(`${base}/feet.json?v=3`, { cache: "force-cache" });
          if (r.ok) {
            const j = (await r.json()) as { version?: number; frames?: Record<string, Foot> };
            feetJsonRef.current = j.version === 3 ? j.frames ?? null : null;
          }
        } catch {
          /* no metadata: measure below */
        }
      }
      const fromJson = feetJsonRef.current?.[frames[i]];
      if (fromJson) {
        setFoot(fromJson);
        return;
      }
      setFoot(await measureSmall(i));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, frames, url],
  );

  // Load: the four side photos first (then the stage is usable), the other
  // frames spread evenly round the turn afterwards; each one is used as soon
  // as it has arrived. Only compressed files are kept; FrameCache decodes the
  // few that are drawn.
  useEffect(() => {
    let alive = true;
    const cache = new FrameCache(frames.map((_, i) => url(i)));
    cacheRef.current = cache;
    loadedRef.current = new Set();
    layerFrame.current = [-1, -1];
    const sides = Array.from(new Set(viewIdx));
    const order = angles ? loadOrder(angles, sides) : sides;
    let pending = new Set(sides);
    const box = rootRef.current?.getBoundingClientRect();
    if (box) sizeCanvases(box);
    cache.load(order, (i, ok) => {
      if (!alive) return;
      if (ok) loadedRef.current.add(i);
      ensureFoot(i).then(() => alive && schedulePaint());
      if (pending.has(i)) {
        pending.delete(i);
        if (pending.size === 0) {
          pending = new Set();
          // Ready once the first side is decoded and on screen.
          cache.request(viewIdx[0]).then(() => {
            if (!alive) return;
            setReady(true);
            schedulePaint();
          });
        }
      } else schedulePaint();
    });
    return () => {
      alive = false;
      cache.dispose();
      if (cacheRef.current === cache) cacheRef.current = null;
      if (repaintRaf.current) cancelAnimationFrame(repaintRaf.current);
      repaintRaf.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, frames.join("|"), viewIdx.join(","), angles]);

  // Layout changes invalidate the cached box and raycasts, then repaint once.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const invalidate = () => {
      boxRef.current = null;
      layoutVerRef.current++;
      sizeCanvases(root.getBoundingClientRect());
      if (raf || !ready) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        paint(lastRef.current.a, lastRef.current.moving, lastRef.current.turning);
      });
    };
    const ro = new ResizeObserver(invalidate);
    ro.observe(root);
    window.addEventListener("scroll", invalidate, { passive: true, capture: true });
    window.addEventListener("resize", invalidate, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", invalidate, { capture: true });
      window.removeEventListener("resize", invalidate);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [paint, ready, sizeCanvases]);

  // Trackpad / wheel: a mostly horizontal scroll turns the athlete (vertical
  // scrolling stays with the page). Native listener: React's is passive.
  const onWheelTurnRef = useRef(onWheelTurn);
  onWheelTurnRef.current = onWheelTurn;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      if (!ready || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault(); // also keeps Mac browsers from swiping back a page
      onWheelTurnRef.current?.(e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [ready]);

  // Repaint once the view photos are ready (and whenever the image set changes).
  useEffect(() => {
    if (ready) paint(lastRef.current.a, lastRef.current.moving, lastRef.current.turning);
  }, [ready, paint, arena, debug]);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    if (ready) onReadyRef.current?.();
  }, [ready]);

  // Drag (mouse + touch). Only a mostly-horizontal gesture becomes a drag, so
  // vertical page scrolling on phones keeps working (touch-action: pan-y).
  const dragRef = useRef<{
    id: number;
    x0: number;
    y0: number;
    active: boolean;
    samples: { t: number; x: number }[];
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ready) return;
    dragRef.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, samples: [{ t: performance.now(), x: e.clientX }] };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.active) {
      if (Math.abs(dx) < VIEWER_VIEWS.dragStartPx || Math.abs(dx) < Math.abs(dy)) {
        if (Math.abs(dy) > VIEWER_VIEWS.dragStartPx * 2) dragRef.current = null; // it's a scroll
        return;
      }
      d.active = true;
      closeCardRef.current();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
      onDragStart();
    }
    const now = performance.now();
    d.samples.push({ t: now, x: e.clientX });
    while (d.samples.length > 2 && now - d.samples[0].t > 90) d.samples.shift();
    onDragMove(dx);
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && d.id === e.pointerId && !d.active && e.type === "pointerup") {
      onTap?.();
      return;
    }
    if (!d || d.id !== e.pointerId || !d.active) return;
    const s = d.samples;
    const first = s[0];
    const last = s[s.length - 1];
    const dt = last.t - first.t;
    onDragEnd(dt > 0 ? (last.x - first.x) / dt : 0);
  };

  const frameNo = String(viewIdx[view] + 1);
  const activeHotspots = media.hotspots.filter((h) => h.points[frameNo]);

  // ---- zone markers: touch opens a card, mouse/pen hovers + clicks through ----
  // Decided per event from the pointer that pressed the marker (not a media
  // query), so an iPad with a trackpad or a touch laptop behaves right either way.
  const markerPointer = useRef<string>("");
  const [hoverZone, setHoverZone] = useState<string | null>(null);
  const [card, setCard] = useState<{ key: string; x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardOpen = useRef(false);
  const onZoneCardChangeRef = useRef(onZoneCardChange);
  onZoneCardChangeRef.current = onZoneCardChange;
  const closeCard = useCallback(() => {
    if (!cardOpen.current) return;
    cardOpen.current = false;
    setCard(null);
    onZoneCardChangeRef.current?.(false);
  }, []);
  closeCardRef.current = closeCard;
  const openCard = (key: string, el: HTMLElement) => {
    const root = rootRef.current?.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (!root) return;
    cardOpen.current = true;
    setCard({ key, x: b.left + b.width / 2 - root.left, y: b.top + b.height / 2 - root.top });
    onZoneCardChangeRef.current?.(true);
  };
  // Close on a press outside the card / markers, on Escape, and when the view changes.
  useEffect(() => {
    if (!card) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (cardRef.current?.contains(t) || markersRef.current?.contains(t)) return;
      closeCard();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCard();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [card, closeCard]);
  useEffect(() => {
    closeCard();
  }, [view, closeCard]);
  useEffect(() => () => closeCard(), [closeCard]);
  // Keep the card inside the stage card (and the screen), flipping above the
  // marker when there is no room below.
  useLayoutEffect(() => {
    const el = cardRef.current;
    const root = rootRef.current;
    if (!card || !el || !root) return;
    const r = root.getBoundingClientRect();
    const bounds = (root.closest("section") ?? document.body).getBoundingClientRect();
    const pad = 8;
    const minX = Math.max(bounds.left, 0) + pad;
    const maxX = Math.min(bounds.right, window.innerWidth) - pad;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = r.left + card.x - w / 2;
    left = Math.min(Math.max(left, minX), maxX - w);
    const gap = 26;
    let top = r.top + card.y + gap;
    const maxY = Math.min(bounds.bottom, window.innerHeight) - pad;
    if (top + h > maxY) top = r.top + card.y - gap - h;
    top = Math.max(top, Math.max(bounds.top, 0) + pad);
    el.style.left = `${left - r.left}px`;
    el.style.top = `${top - r.top}px`;
    el.style.visibility = "visible";
  }, [card]);
  const cardZone = card ? activeHotspots.find((h) => h.label + frameNo === card.key) : null;

  return (
    <div
      ref={rootRef}
      className={`relative mx-auto select-none outline-none focus-visible:ring-2 focus-visible:ring-[#ff2d55]/70 ${VIEWER_360_FRAME_CLASS}`}
      style={{ ...viewer360FrameStyle(), touchAction: "pan-y" }}
      tabIndex={0}
      role="group"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onHoverChange?.(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onHoverChange?.(false);
      }}
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => onFocusChange?.(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onKeyTurn(VIEWER_SPIN.keyStepDeg);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          onKeyTurn(-VIEWER_SPIN.keyStepDeg);
        } else if (e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          onTogglePlay?.();
        }
      }}
    >
      {debug && (
        <svg
          ref={debugRef}
          className="pointer-events-none absolute inset-0 z-30 h-full w-full"
          style={{ overflow: "visible" }}
          aria-hidden
        />
      )}
      {/* Contact shadows (behind the photo, on the platform): a soft pool plus
          one tight shadow under each sole, so the athlete stands, not floats */}
      <div ref={shadowsRef} className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div ref={poolRef} className="stage-shadow-t stage-shadow-soft" />
        {[0, 1].map((k) => (
          <div
            key={k}
            ref={(el) => {
              soleRefs.current[k] = el;
            }}
            className="stage-shadow-t stage-shadow-core"
          />
        ))}
      </div>

      <div ref={stackRef} className="absolute inset-0" style={{ transformOrigin: "50% 100%" }}>
        {[0, 1].map((k) => (
          <canvas
            key={k}
            ref={(el) => {
              canvasRefs.current[k] = el;
            }}
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ opacity: k === 0 ? 1 : 0, zIndex: k + 1 }}
          />
        ))}
      </div>

      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-white/60">{m.v360_loading}</div>
      )}

      <div
        ref={markersRef}
        className="absolute inset-0 z-10"
        style={{
          transition: `opacity ${VIEWER_VIEWS.markerFadeMs}ms ease, visibility ${VIEWER_VIEWS.markerFadeMs}ms`,
          pointerEvents: "none",
        }}
      >
        {ready &&
          activeHotspots.map((h) => {
            const p = h.points[frameNo];
            const taken = h.status === "terisi";
            const canApply = !!h.athleteZoneId && h.status === "tersedia";
            return (
              <button
                key={h.label + frameNo}
                type="button"
                title={
                  h.zoneNama
                    ? `${h.zoneNama}${h.effectivePrice != null && !taken ? " · " + formatIDR(h.effectivePrice) : taken ? " · " + m.v360_taken : ""}`
                    : h.label
                }
                aria-expanded={card?.key === h.label + frameNo}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  markerPointer.current = e.pointerType;
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "touch") setHoverZone(h.label + frameNo);
                }}
                onPointerLeave={() => setHoverZone(null)}
                onClick={(e) => {
                  const touch = markerPointer.current === "touch";
                  markerPointer.current = "";
                  if (touch) {
                    // Touch: first tap shows what the zone is; the card's button applies.
                    if (card?.key === h.label + frameNo) closeCard();
                    else openCard(h.label + frameNo, e.currentTarget);
                    return;
                  }
                  if (canApply) router.push(`/atlet/${athleteId}/ajukan?zone=${h.athleteZoneId}`);
                }}
                className="pointer-events-auto absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              >
                <span
                  className={`block h-3.5 w-3.5 rounded-full border-2 border-white shadow ${
                    taken ? "bg-white/40" : "bg-[#ff3b57]"
                  } ${canApply ? "cursor-pointer" : "cursor-default"}`}
                />
                {hoverZone === h.label + frameNo && !card && (
                  <span className="pointer-events-none absolute left-1/2 top-9 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/85 px-2 py-1 text-[10px] text-white">
                    {h.zoneNama ?? h.label}
                    {taken ? ` · ${m.v360_taken}` : h.effectivePrice != null ? ` · ${formatIDR(h.effectivePrice)}` : ""}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {/* Zone card (touch): what the tapped zone is, and the way to apply */}
      {card && cardZone && (
        <div
          ref={cardRef}
          role="dialog"
          aria-label={cardZone.zoneNama ?? cardZone.label}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-40 w-[min(15rem,calc(100vw-2rem))] rounded-xl border border-white/15 bg-[#140a0d]/95 p-3 text-white shadow-2xl"
          style={{ left: 0, top: 0, visibility: "hidden" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 pt-1">
              <div className="truncate text-sm font-semibold">{cardZone.zoneNama ?? cardZone.label}</div>
              <div className="mt-0.5 text-xs text-white/60">
                {cardZone.status === "terisi"
                  ? m.v360_taken
                  : cardZone.effectivePrice != null
                    ? formatIDR(cardZone.effectivePrice)
                    : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={closeCard}
              aria-label={m.v360_close}
              className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {!!cardZone.athleteZoneId && cardZone.status === "tersedia" && (
            <button
              type="button"
              onClick={() => router.push(`/atlet/${athleteId}/ajukan?zone=${cardZone.athleteZoneId}`)}
              className="mt-2 flex min-h-11 w-full items-center justify-center rounded-full bg-[#ff2d55] px-4 text-sm font-semibold text-white"
            >
              {m.v360_apply_zone}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
