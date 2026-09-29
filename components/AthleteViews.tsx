"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Media360 } from "@/lib/data";
import { VIEW_ANGLES, VIEW_KEYS, frameAngles } from "@/lib/views";
import { STAGE_ARENA, VIEWER_360, VIEWER_VIEWS, viewer360FrameStyle } from "@/lib/config";
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
   * fallback squeeze cue.
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

const norm360 = (a: number) => ((a % 360) + 360) % 360;

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
 * Athlete photo, painted from one orbit angle. With the in-between frames loaded
 * the figure really turns (two nearest frames blended by the exact angle: the
 * lower one opaque, the upper fading in on top); until then — or if the frame
 * order can't be mapped to angles — only the four view photos are used, with a
 * subtle squeeze/shift as a "turn" cue. The four view photos load first; the
 * in-between frames stream in afterwards in the background.
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
    /** ←/→ keys: +1 = next (Kanan direction), -1 = previous. */
    onStep: (delta: 1 | -1) => void;
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
    /** A press on the athlete that did not become a drag (phones: tap). */
    onTap?: () => void;
    /** Keyboard focus on / off the athlete. */
    onFocusChange?: (focused: boolean) => void;
  } & DragCallbacks
>(function AthleteViews(
  { athleteId, media, view, m, label, onStep, onReady, onHoverChange, onTap, onFocusChange, onDragStart, onDragMove, onDragEnd, arena, debug, onZoneCardChange },
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
  const angles = useMemo(() => frameAngles(frames, media.views), [frames, media.views]);

  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
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
  const loadedRef = useRef<Set<number>>(new Set());
  const fullRef = useRef(false); // all frames decoded and angle-mapped -> real turn
  const lastRef = useRef<{ a: number; moving: boolean; turning: boolean }>({ a: 0, moving: false, turning: false });
  const [ready, setReady] = useState(false);
  const [phase2, setPhase2] = useState(false); // in-between frames requested

  const url = useCallback((i: number) => `${base}/${frames[i]}`, [base, frames]);

  const decode = (u: string) =>
    new Promise<boolean>((res) => {
      const img = new Image();
      img.onload = () => {
        if (typeof img.decode === "function") img.decode().then(() => res(true), () => res(true));
        else res(true);
      };
      img.onerror = () => res(false);
      img.src = u;
    });

  // Keyframes for the current mode: every frame (real turn) or the 4 views.
  const keyframes = useCallback((): { a: number; i: number }[] => {
    if (fullRef.current && angles) return angles.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a);
    return VIEW_ANGLES.map((a, k) => ({ a, i: viewIdx[k] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angles, viewIdx.join(",")]);

  const paint = useCallback(
    (angleDeg: number, moving: boolean, turning = false) => {
      lastRef.current = { a: angleDeg, moving, turning };
      // Layout read only after a resize / scroll invalidated the cached box.
      let box = boxRef.current;
      if (!box && rootRef.current) {
        box = rootRef.current.getBoundingClientRect();
        boxRef.current = box;
      }
      const imgs = imgRefs.current;
      const A = norm360(angleDeg);
      const kf = keyframes();
      // Bracket A between two keyframes (wrapping 360 -> first).
      let lo = kf[kf.length - 1];
      let hi = { a: kf[0].a + 360, i: kf[0].i };
      let loA = lo.a - 360;
      for (let k = 0; k < kf.length; k++) {
        const nextA = k + 1 < kf.length ? kf[k + 1].a : kf[0].a + 360;
        if (A >= kf[k].a && A < nextA) {
          lo = kf[k];
          loA = kf[k].a;
          hi = { a: nextA, i: k + 1 < kf.length ? kf[k + 1].i : kf[0].i };
          break;
        }
      }
      const span = hi.a - loA || 1;
      const t = Math.min(1, Math.max(0, (A - loA) / span));
      // How much of the upper frame shows (over the opaque lower one).
      //  - view turn / swipe: blend across the whole step (fast, reads as motion)
      //  - slow idle spin: hold one crisp photo and switch at mid-step with a
      //    very short blend, so two different poses are never overlaid for long
      //    (that long overlay is what reads as a "ghost" at 10°/s).
      let a = t;
      let base = lo.i;
      if (moving && !turning) {
        const blendDeg = Math.min(
          span,
          (360 / STAGE_ARENA.autoRotateSecPerTurn) * (STAGE_ARENA.idleBlendMs / 1000),
        );
        const mid = loA + span / 2;
        const u = Math.min(1, Math.max(0, (A - (mid - blendDeg / 2)) / blendDeg));
        a = u * u * (3 - 2 * u);
        if (a >= 1) {
          base = hi.i; // past the switch: the next photo alone
          a = 0;
        }
      }
      const EPS = 0.002;
      for (let i = 0; i < imgs.length; i++) {
        const el = imgs[i];
        if (!el) continue;
        const isLo = i === base;
        const isHi = base === lo.i && i === hi.i && a > EPS && hi.i !== lo.i;
        el.style.opacity = isLo ? "1" : isHi ? String(a) : "0";
        el.style.zIndex = isHi ? "2" : isLo ? "1" : "0";
        el.style.visibility = isLo || isHi ? "visible" : "hidden";
      }
      // Feet on the platform: shift the photo (and its zone markers) so the
      // shown frame's sole line lands exactly on the platform surface line
      // (the feet line), sinking FOOT_OVERLAP px into it so antialiasing never
      // leaves a hairline gap. Values are fractions of the box, so it holds at
      // any size. Blends mix the two frames' feet the same way as the photos.
      const feet = feetRef.current;
      const fallback: Foot = { toe: 1 - VIEWER_360.feetLinePct / 100, back: 1 - VIEWER_360.feetLinePct / 100, left: 0.3, right: 0.7 };
      const fBase = feet[base] ?? fallback;
      const foot = base === lo.i && a > EPS && hi.i !== lo.i ? mixFoot(fBase, feet[hi.i] ?? fallback, a) : fBase;
      const line = 1 - VIEWER_360.feetLinePct / 100; // platform surface, fraction of the box from the top
      const shift = `translateY(calc(${((line - foot.toe) * 100).toFixed(3)}% + ${STAGE_ARENA.footOverlapPx}px))`;
      // Fallback "turn" cue (only when stepping between the 4 view photos).
      const stack = stackRef.current;
      if (stack) {
        if (!fullRef.current && turning) {
          const s = Math.sin(Math.PI * t);
          stack.style.transform = `${shift} translateX(${(VIEWER_VIEWS.fallbackShiftPct * s).toFixed(2)}%) scaleX(${(
            1 -
            VIEWER_VIEWS.fallbackSqueeze * s
          ).toFixed(4)})`;
        } else {
          stack.style.transform = shift;
        }
      }
      // Markers are stored on the untransformed photo: carry the settled
      // frame's own transform so they stay on the body.
      const mk0 = markersRef.current;
      if (mk0) {
        const fc = frameCss(meta[frames[base]]?.t, rawFeetRef.current[base] ?? meta[frames[base]]?.foot);
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
      const lead = base === lo.i && a >= 0.5 && hi.i !== lo.i ? feet[hi.i] ?? foot : foot;
      const soles = lead.soles?.length ? lead.soles : [[lead.left, lead.right, lead.toe]];
      const S = STAGE_ARENA;
      const ground = arenaRef.current?.current.groundHit ?? null;
      const shiftFrac = line - foot.toe; // same shift as the photo
      // Raycasts are cached: redo them only for a new leading frame, a turn of
      // more than groundRecheckDeg, or a layout change.
      const hits: (GroundHit | null)[] = [];
      const leadIdx = base === lo.i && a >= 0.5 && hi.i !== lo.i ? hi.i : base;
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
      // Zone markers: hidden while turning, back on the settled view.
      const mk = markersRef.current;
      if (moving) closeCardRef.current();
      if (mk) {
        mk.style.opacity = moving ? "0" : "1";
        mk.style.visibility = moving ? "hidden" : "visible";
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyframes],
  );

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
        // The transform pivots on the measured feet (same point the markers use).
        const el = imgRefs.current[i];
        if (el && fm?.t && f) {
          const fc = frameCss(fm.t, f);
          el.style.transformOrigin = fc.transformOrigin;
          el.style.transform = fc.transform;
        }
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

  // Phase 1: the four view photos (so the page is usable fast).
  useEffect(() => {
    let alive = true;
    const uniq = Array.from(new Set(viewIdx));
    Promise.all(
      uniq.map((i) =>
        decode(url(i))
          .then((ok) => ok && loadedRef.current.add(i))
          .then(() => ensureFoot(i)),
      ),
    ).then(() => {
      if (!alive) return;
      setReady(true);
      setPhase2(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, frames.join("|"), viewIdx.join(",")]);

  // Phase 2: in-between frames, decoded in the background. The real turn is
  // switched on only while the figure is at rest, so a transition never changes
  // mode half-way.
  useEffect(() => {
    if (!phase2 || !angles) return;
    let alive = true;
    (async () => {
      for (let i = 0; i < frames.length; i++) {
        if (!alive) return;
        if (loadedRef.current.has(i)) continue;
        if (await decode(url(i))) loadedRef.current.add(i);
        await ensureFoot(i);
      }
      if (!alive || loadedRef.current.size < frames.length) return;
      const arm = () => {
        if (!alive) return;
        // Switch to the real turn between view changes (the slow idle spin is
        // fine to switch during; a fast view turn is not).
        if (lastRef.current.turning) {
          setTimeout(arm, 120);
          return;
        }
        fullRef.current = true;
        paint(lastRef.current.a, lastRef.current.moving, false);
      };
      arm();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase2, angles]);

  // Layout changes invalidate the cached box and raycasts, then repaint once.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const invalidate = () => {
      boxRef.current = null;
      layoutVerRef.current++;
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
  }, [paint, ready]);

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
      className="relative mx-auto select-none outline-none focus-visible:ring-2 focus-visible:ring-[#ff2d55]/70"
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
          onStep(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          onStep(-1);
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
        {frames.map((f, i) => {
          const isView = viewIdx.includes(i);
          const src = isView || phase2 ? url(i) : undefined;
          const first = i === viewIdx[0];
          const fc = frameCss(meta[f]?.t, meta[f]?.foot);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={f}
              ref={(el) => {
                imgRefs.current[i] = el;
              }}
              src={src}
              alt=""
              draggable={false}
              decoding="async"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              style={{
                opacity: first ? 1 : 0,
                visibility: first ? "visible" : "hidden",
                zIndex: first ? 1 : 0,
                transform: fc.transform,
                transformOrigin: fc.transformOrigin,
              }}
            />
          );
        })}
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
