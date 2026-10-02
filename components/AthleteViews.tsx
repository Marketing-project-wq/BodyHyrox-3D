"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Media360 } from "@/lib/data";
import { VIEW_ANGLES, VIEW_KEYS, frameAngles } from "@/lib/views";
import { STAGE_ARENA, STAGE_VIDEO_BUNDLED, VIEWER_360, VIEWER_360_FRAME_CLASS, VIEWER_SPIN, VIEWER_VIDEO, VIEWER_VIEWS, viewer360FrameStyle } from "@/lib/config";
import { alphaLooksRight, isHevc, parseStageVideo, sourceOrder, timeForAngle, videoAngle, type StageVideoSource } from "@/lib/stage-video";
import { blendAmount, bracket, loadOrder, nearestSide, norm360 } from "@/lib/spin";
import { contactsOf, footShift, mixContacts, parseVideoFeet, videoFootAt, type VideoFeet } from "@/lib/stage-feet";
import { FrameCache } from "@/lib/frame-cache";
import { type Dict } from "@/lib/i18n";
import { formatIDR } from "@/lib/format";
import { footIsCurrent, frameCss, measureFrame, transformFoot, type Foot } from "@/lib/media360";
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
  /**
   * "static-athlete" stage: show side `to` (0 Front, 1 Right, 2 Back, 3 Left),
   * crossfading from side `from` (t = 0..1; 1 = only `to`).
   */
  renderSide: (from: number, to: number, t: number, next?: number) => void;
  /**
   * Hybrid viewer (sets with media.video): `speed` = the auto-rotation's
   * share of its full speed (0 = held or turned by hand). Returns the angle of
   * the video frame on screen while the video shows (the stage then follows
   * it), else null (the frames show; the video starts at `envDeg` once it
   * can). The video's playback rate follows `speed`.
   */
  video: (speed: number, envDeg: number, now: number) => number | null;
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
 * frame below, the next one fading in on top (VIEWER_SPIN.crossfade*).
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
    /** Once: the turn video can play through, or there is none / it can't be used. */
    onVideoSettled?: () => void;
    /**
     * "static-athlete" stage: only the four side photos are loaded and shown
     * (renderSide); no turn, no turn video.
     */
    staticSides?: boolean;
    /** The 3D arena (when running): tells whether each sole lands on the platform top. */
    arena?: MutableRefObject<ArenaHandle>;
    /** ?debug=feet: draw the platform top face and each foot's contact point. */
    debug?: boolean;
    /** ?debug=perf: decode / draw counters on the element (data-perf). */
    debugPerf?: boolean;
    /** ?debug=video: video layer state on the element (data-video). */
    debugVideo?: boolean;
    /** Accessible name of the athlete picture at an angle (updated at rest only). */
    describe: (angleDeg: number) => string;
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
  { athleteId, media, view, m, label, onKeyTurn, onTogglePlay, onWheelTurn, onReady, onVideoSettled, staticSides = false, onHoverChange, onTap, onFocusChange, onDragStart, onDragMove, onDragEnd, arena, debug, debugPerf, debugVideo, describe, onZoneCardChange },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const debugRef = useRef<SVGSVGElement>(null);
  const arenaRef = useRef(arena);
  arenaRef.current = arena;
  const debugOn = useRef(!!debug);
  debugOn.current = !!debug;
  const perfOn = useRef(!!debugPerf);
  perfOn.current = !!debugPerf;
  const perf = useRef({ paints: 0, misses: 0 });
  const prevAngleRef = useRef(0);
  const speedRef = useRef({ a: 0, t: 0, v: 0 }); // turn speed (deg/s), smoothed
  const describeRef = useRef(describe);
  describeRef.current = describe;
  const imgLabelRef = useRef("");
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
  // True cross-dissolve needs mix-blend-mode: plus-lighter (checked once on the client).
  const [dissolveOn, setDissolveOn] = useState(false);
  const dissolveRef = useRef(false);
  useEffect(() => {
    const ok = VIEWER_SPIN.crossfadeDissolve && typeof CSS !== "undefined" && CSS.supports("mix-blend-mode", "plus-lighter");
    dissolveRef.current = ok;
    setDissolveOn(ok);
  }, []);
  const crispRef = useRef({ k: 0, t: 0 }); // 0 = follow the angle, 1 = nearest frame (at rest)
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
  // The turn video's own soles (one entry per video frame); "loading" holds the video back.
  const videoFeetRef = useRef<{ state: "none" | "loading" | "ok"; track: VideoFeet | null }>({ state: "none", track: null });
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
    // The frame's own (non-destructive) transform pivots on its measured feet;
    // paint puts the feet shift in front of it.
    const fc = frameCss(meta[frames[i]]?.t, rawFeetRef.current[i] ?? meta[frames[i]]?.foot);
    c.style.transformOrigin = fc.transformOrigin;
    layerCss.current[layer] = fc.transform === "none" ? "" : fc.transform;
    c.style.transform = `${layerShift.current[layer]} ${layerCss.current[layer]}`.trim();
    return true;
  };
  // Per canvas: the frame's own transform, and the feet shift put in front of it.
  const layerCss = useRef(["", ""]);
  const layerShift = useRef(["", ""]);
  const setLayerShift = (layer: number, shift: string) => {
    const c = canvasRefs.current[layer];
    layerShift.current[layer] = shift;
    if (c) c.style.transform = `${shift} ${layerCss.current[layer]}`.trim();
  };
  const forceRef = useRef<{ lo: number; hi: number; a: number; next?: number } | null>(null);
  // Leaving "static-athlete" (the stage card switches to the full turn after
  // mount): the given side no longer holds the picture, the angle picks it.
  useEffect(() => {
    if (!staticSides) forceRef.current = null;
  }, [staticSides]);
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
      // Turn speed; fast turns use an evenly spread subset of a large set.
      const now = performance.now();
      const sp = speedRef.current;
      const dt = (now - sp.t) / 1000;
      if (dt > 0 && dt < 0.25) sp.v = sp.v * 0.6 + (Math.abs(angleDeg - sp.a) / dt) * 0.4;
      else if (dt >= 0.25) sp.v = 0;
      sp.a = angleDeg;
      sp.t = now;
      const allKf = keyframes();
      const stride = Math.ceil(allKf.length / VIEWER_SPIN.fastTurnFrames);
      const kf =
        moving && stride > 1 && sp.v > VIEWER_SPIN.fastTurnDegPerSec
          ? allKf.filter((k, j) => j % stride === 0 || viewIdxRef.current.includes(k.i))
          : allKf;
      const fullTurn = !!angles && kf.length > 4;
      const br = bracket(A, kf);
      const t = Math.min(1, Math.max(0, br.t));
      // Upper frame's share: a blend over (part of) the step following the
      // angle, or the whole step between the 4 side photos of the fallback.
      let a = br.hi === br.lo ? 0 : angles ? blendAmount(t, media.blendShare ?? VIEWER_SPIN.crossfadeShare, VIEWER_SPIN.crossfadeCurve) : t;
      let base = br.lo;
      if (a >= 1) {
        base = br.hi; // past the blend: the next frame alone
        a = 0;
      }
      const lo = { i: base };
      const hi = { i: forceRef.current ? forceRef.current.hi : br.hi };
      // At rest the picture settles on the nearer of the two frames (eased over
      // restCrispMs, repainting until done); moving, it follows the angle.
      const dissolve = dissolveRef.current;
      const cr = crispRef.current;
      const wantCrisp = !moving && dissolve && VIEWER_SPIN.restCrispMs > 0 ? 1 : 0;
      const dtc = cr.t ? Math.min(0.1, (now - cr.t) / 1000) : 0;
      cr.t = now;
      cr.k += (wantCrisp - cr.k) * (1 - Math.exp((-dtc * 1000) / Math.max(1, VIEWER_SPIN.restCrispMs / 3)));
      if (Math.abs(wantCrisp - cr.k) < 0.01) cr.k = wantCrisp;
      else schedulePaint();
      a += ((a < 0.5 ? 0 : 1) - a) * cr.k;
      // "static-athlete": two given frames (the sides) and their crossfade.
      const force = forceRef.current;
      if (force) {
        base = force.lo;
        a = force.a;
      }
      // Draw: the frame below on canvas 0, the one fading in on canvas 1. A
      // frame not decoded yet keeps the previous picture for a moment.
      const cache = cacheRef.current;
      const EPS = 0.002;
      const showHi = force ? a > EPS && hi.i !== base : base === br.lo && a > EPS && br.hi !== br.lo;
      // While the turn video shows, no frame is decoded or drawn (it covers
      // them); after it pauses it stays up until the frames here are drawn.
      const vs = vid.current;
      if (cache && vs.state !== "on") {
        // At rest, the side coming next is drawn ahead on the hidden canvas, so
        // its crossfade only changes opacity (no draw on its first frame).
        const prep = force && !showHi && force.next !== undefined && force.next !== base ? force.next : -1;
        // hi: the next frame by angle, or the given side ("static-athlete").
        cache.pin(showHi ? [base, hi.i] : prep >= 0 ? [base, prep] : [base]);
        let loOk = drawLayer(0, base);
        const hiOk = showHi && drawLayer(1, hi.i);
        if (prep >= 0) drawLayer(1, prep);
        perf.current.paints++;
        if (!loOk || (showHi && !hiOk)) perf.current.misses++;
        // Not decoded yet (a fast turn on a slow phone): show the decoded
        // frame nearest to this angle rather than the stale previous one.
        if (!loOk) {
          let best = -1;
          let bestD = Infinity;
          for (const k of allKf) {
            if (!cache.has(k.i)) continue;
            const dd = Math.abs(((k.a - A + 540) % 360) - 180);
            if (dd < bestD) {
              bestD = dd;
              best = k.i;
            }
          }
          if (best >= 0) loOk = drawLayer(0, best);
        }
        const c0 = canvasRefs.current[0];
        const c1 = canvasRefs.current[1];
        // Dissolve: the frame below fades out as the next fades in (their sum
        // is the whole athlete where the poses overlap); else it stays opaque.
        if (c0) c0.style.opacity = dissolve && hiOk ? String(1 - a) : "1";
        if (c1) c1.style.opacity = hiOk ? String(a) : "0";
        if (vs.swapFrom) {
          if ((loOk && (!showHi || hiOk)) || now - vs.swapFrom > VIEWER_VIDEO.swapMaxMs) {
            vs.swapFrom = 0;
            showVideo(false);
          } else schedulePaint();
        }
        // ?debug=feet / perf: decoded frames (memory) and decode / draw counters.
        if ((debugOn.current || perfOn.current) && rootRef.current) rootRef.current.dataset.decoded = `${cache.decodedCount}/${cache.limit}`;
        if (perfOn.current && rootRef.current) rootRef.current.dataset.perf = JSON.stringify({ ...cache.stats, ...perf.current });
        // Decode ahead: while turning, further in the direction of the turn
        // (and 1 behind); at rest, a few on both sides.
        const at = kf.findIndex((k) => k.i === br.lo);
        const dA = angleDeg - prevAngleRef.current;
        prevAngleRef.current = angleDeg;
        const dir = moving && Math.abs(dA) > 1e-3 ? Math.sign(dA) : 0;
        const ahead = dir ? VIEWER_SPIN.prefetchAhead : VIEWER_SPIN.prefetch;
        const behind = dir ? 1 : VIEWER_SPIN.prefetch;
        const at2 = (d: number) => kf[(((at + d) % kf.length) + kf.length) % kf.length].i;
        for (let d = 1; at >= 0 && d <= Math.max(ahead, behind); d++) {
          if (d <= ahead) cache.request(at2(dir >= 0 ? d : -d));
          if (d <= behind) cache.request(at2(dir >= 0 ? -d : d));
        }
      }
      // Feet on the platform: every picture is shifted on its own so its sole
      // line lands exactly on the platform surface line (the feet line),
      // sinking FOOT_OVERLAP px into it so antialiasing never leaves a hairline
      // gap: the frame below, the frame fading in, and the turn video (with its
      // own soles per video frame). Values are fractions of the box, so it
      // holds at any size.
      const feet = feetRef.current;
      const fallback: Foot = { toe: 1 - VIEWER_360.feetLinePct / 100, back: 1 - VIEWER_360.feetLinePct / 100, left: 0.3, right: 0.7 };
      const fBase = feet[base] ?? fallback;
      const fHi = feet[hi.i] ?? fallback;
      const foot = showHi ? mixFoot(fBase, fHi, a) : fBase;
      const line = 1 - VIEWER_360.feetLinePct / 100; // platform surface, fraction of the box from the top
      const shiftOf = (toe: number) => `translateY(calc(${(footShift(toe, line) * 100).toFixed(3)}% + ${STAGE_ARENA.footOverlapPx}px))`;
      const shift = shiftOf(foot.toe);
      const track = videoFeetRef.current.track;
      const videoUp = vs.state === "on" || vs.swapFrom > 0; // the video is what's on screen
      const vFoot = track ? videoFootAt(track, A) : null;
      // Fallback "turn" cue (only when stepping between the 4 view photos).
      const stack = stackRef.current;
      const perPicture = !!angles;
      if (stack) {
        if (!fullTurn && !angles && turning) {
          const s = Math.sin(Math.PI * t);
          stack.style.transform = `${shift} translateX(${(VIEWER_VIEWS.fallbackShiftPct * s).toFixed(2)}%) scaleX(${(
            1 -
            VIEWER_VIEWS.fallbackSqueeze * s
          ).toFixed(4)})`;
        } else {
          stack.style.transform = perPicture ? "" : shift;
        }
      }
      setLayerShift(0, perPicture ? shiftOf(fBase.toe) : "");
      setLayerShift(1, perPicture ? shiftOf(fHi.toe) : "");
      const vEl = videoElRef.current;
      if (vEl) vEl.style.transform = perPicture ? shiftOf(vFoot ? vFoot.toe : foot.toe) : "";
      // Markers are stored on the untransformed photo of their side: carry
      // that frame's own transform so they stay on the body.
      const mk0 = markersRef.current;
      const sideFrame = viewIdxRef.current[nearestSide(A).side];
      if (mk0) {
        const fc = frameCss(meta[frames[sideFrame]]?.t, rawFeetRef.current[sideFrame] ?? meta[frames[sideFrame]]?.foot);
        mk0.style.transformOrigin = fc.transformOrigin;
        mk0.style.transform = fc.transform === "none" ? shift : `${shift} ${fc.transform}`;
      }
      // Contact shadows, one per sole, where the soles on screen are: the
      // video's own soles while it shows, else the two frames' soles mixed by
      // the crossfade (so they glide with it instead of jumping). A sole whose
      // contact point lands on the platform's top face (asked of the 3D camera)
      // is planted: tight dark shadow right under it, smaller further back like
      // the floor. A sole marked lifted in the studio, or off the platform:
      // faint, wider shadow. Plus a soft pool spanning the planted soles.
      const shadows = shadowsRef.current;
      const lead = showHi && a >= 0.5 ? fHi : fBase;
      const onScreen =
        videoUp && vFoot
          ? contactsOf(vFoot, line)
          : !perPicture // 4-photo fallback: one shift for the stack, the leading photo's soles
            ? contactsOf(lead, line).map((c) => ({ ...c, y: c.y - footShift(lead.toe, line) + footShift(foot.toe, line) }))
            : showHi
              ? mixContacts(contactsOf(fBase, line), contactsOf(fHi, line), a)
              : contactsOf(fBase, line);
      const S = STAGE_ARENA;
      const ground = arenaRef.current?.current.groundHit ?? null;
      // Raycasts are cached: redo them only for a new picture, a turn of more
      // than groundRecheckDeg, or a layout change.
      const hits: (GroundHit | null)[] = [];
      const leadIdx = videoUp && vFoot ? "v" : showHi && a >= 0.5 ? hi.i : base;
      const gc = groundCacheRef.current;
      const key = `${leadIdx}|${onScreen.length}|${feet[base] ? 1 : 0}|${ground ? 1 : 0}|${layoutVerRef.current}`;
      const dA = gc ? Math.abs(((A - gc.a + 540) % 360) - 180) : Infinity;
      const recheck = !gc || gc.key !== key || dA > S.groundRecheckDeg;
      const contacts = onScreen.map((c, k) => {
        const { x0, x1, y } = c;
        const cx = box ? box.left + ((x0 + x1) / 2) * box.width : 0;
        const cy = box ? box.top + y * box.height + S.footOverlapPx : 0;
        let planted = !c.lifted;
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
        return { x0, x1, b: y, planted, scale, cx, cy };
      });
      if (recheck) groundCacheRef.current = { key, a: A, hits };
      if (shadows) {
        shadows.style.transform = `translateY(${STAGE_ARENA.footOverlapPx}px)`;
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
      // Accessible name of the picture: only updated at rest, so a screen
      // reader is never flooded while it turns.
      const st = stackRef.current;
      if (st && !moving) {
        const lbl = describeRef.current(angleDeg);
        if (lbl !== imgLabelRef.current) {
          imgLabelRef.current = lbl;
          st.setAttribute("aria-label", lbl);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyframes, angles],
  );
  const paintRef = useRef(paint);
  paintRef.current = paint;

  // ---- Video layer (hybrid viewer; only for sets with media.video) ----
  // States: off (no video / not loaded yet), ready (source chosen, paused),
  // starting (seeked + playing, waiting for its first frame), on (showing),
  // failed (no usable source, autoplay refused, reduced motion, Save-Data).
  // The data's own video wins; else a video shipped with the site for this
  // athlete (STAGE_VIDEO_BUNDLED), until the database can hold one.
  const bundled = STAGE_VIDEO_BUNDLED[athleteId];
  const stageVideo = useMemo(
    () => (staticSides ? null : media.video ?? (bundled ? parseStageVideo(bundled.video) : null)),
    [staticSides, media.video, bundled],
  );
  const videoBase = media.video || !bundled ? base : bundled.baseUrl.replace(/\/$/, "");
  const videoElRef = useRef<HTMLVideoElement>(null);
  const vid = useRef({
    state: "off" as "off" | "ready" | "starting" | "on" | "failed",
    srcs: [] as StageVideoSource[],
    srcIdx: 0,
    verified: false,
    mediaTime: 0,
    at: 0,
    rvfc: false,
    blockedUntil: 0,
    swapFrom: 0, // paused video still shown since (ms), until the frames are drawn
    q: { at: 0, dropped: 0, total: 0, bad: 0 }, // playback quality at the last check
    stall: 0 as ReturnType<typeof setTimeout> | 0,
    reason: "",
  });
  const videoDebugOn = useRef(!!debugVideo);
  videoDebugOn.current = !!debugVideo;
  const videoBadgeRef = useRef<HTMLDivElement>(null);
  const showVideoDebug = () => {
    const v = vid.current;
    if (!videoDebugOn.current || !rootRef.current) return;
    rootRef.current.dataset.video = `${v.state}|${v.srcs[v.srcIdx]?.file ?? "-"}|${v.reason}`;
    // ?debug=video: the same, readable on the stage (no developer tools needed).
    if (videoBadgeRef.current) videoBadgeRef.current.textContent = `video: ${v.state}${v.reason ? ` (${v.reason})` : ""}`;
  };
  // The stage card holds the first turn until the video can play (or can't be used).
  const settledRef = useRef(false);
  const onVideoSettledRef = useRef(onVideoSettled);
  onVideoSettledRef.current = onVideoSettled;
  const settleVideo = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onVideoSettledRef.current?.();
  };
  // Frames and video swap visibility; the canvases keep being painted (at
  // the same angle) so the swap back is instant.
  const showVideo = (on: boolean) => {
    const el = videoElRef.current;
    if (el) el.style.opacity = on ? "1" : "0";
    for (const c of canvasRefs.current) if (c) c.style.visibility = on ? "hidden" : "";
  };
  // Is the frame on screen transparent around the athlete? (else the browser
  // shows this format without alpha, e.g. VP9 in Safari: a black box)
  const alphaOk = (el: HTMLVideoElement, src: StageVideoSource): boolean => {
    try {
      const W = 24;
      const H = 40;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d", { willReadFrequently: true });
      if (!g) return isHevc(src);
      g.drawImage(el, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      let max = 0;
      for (let i = 3; i < d.length; i += 4) max = Math.max(max, d[i]);
      const corner = [0, W - 1, (H - 1) * W, H * W - 1].map((p) => d[p * 4 + 3]);
      return alphaLooksRight(corner, max, VIEWER_VIDEO.alphaCornerMax);
    } catch {
      return isHevc(src); // pixels unreadable: trust Apple's HEVC alpha only
    }
  };
  const loadSource = (i: number) => {
    const v = vid.current;
    const el = videoElRef.current;
    if (!el) return;
    if (i >= v.srcs.length) {
      v.state = "failed";
      v.reason ||= "no-usable-source";
      el.removeAttribute("src");
      el.load();
      showVideo(false);
      showVideoDebug();
      settleVideo();
      return;
    }
    v.srcIdx = i;
    v.verified = false;
    v.state = "ready";
    el.src = `${videoBase}/${v.srcs[i].file}`;
    el.preload = "auto";
    el.load();
    showVideoDebug();
  };
  // Pause: the paused frame stays up until the frames at this angle are drawn
  // (paint swaps then), so the hand-over never shows a wrong pose.
  const stopVideo = () => {
    const v = vid.current;
    const el = videoElRef.current;
    if (el && !el.paused) el.pause();
    if (v.state === "on") {
      v.swapFrom = performance.now();
      schedulePaint();
    } else if (!v.swapFrom) showVideo(false);
    if (v.state === "on" || v.state === "starting") v.state = "ready";
    showVideoDebug();
  };
  const onFrame = (el: HTMLVideoElement, mediaTime: number) => {
    const v = vid.current;
    v.mediaTime = mediaTime;
    v.at = performance.now();
    if (v.state !== "starting") return;
    if (!v.verified) {
      if (!alphaOk(el, v.srcs[v.srcIdx])) {
        el.pause();
        v.reason = `no-alpha:${v.srcs[v.srcIdx].file}`;
        loadSource(v.srcIdx + 1);
        return;
      }
      v.verified = true;
    }
    v.state = "on";
    v.swapFrom = 0;
    v.q = { at: 0, dropped: 0, total: 0, bad: 0 };
    showVideo(true);
    showVideoDebug();
  };
  const startVideo = (envDeg: number, speed: number) => {
    const v = vid.current;
    const el = videoElRef.current;
    if (!el || !stageVideo) return;
    const leadDeg = (VIEWER_VIDEO.leadMs / 1000) * (360 / STAGE_ARENA.autoRotateSecPerTurn) * speed;
    v.state = "starting";
    el.playbackRate = (stageVideo.duration / STAGE_ARENA.autoRotateSecPerTurn) * speed;
    el.currentTime = timeForAngle(envDeg + leadDeg, stageVideo.duration);
    showVideoDebug();
    const watch = () => {
      if (v.rvfc) {
        const cb = (_now: number, md: { mediaTime: number }) => {
          if (el.paused || (v.state !== "starting" && v.state !== "on")) return;
          onFrame(el, md.mediaTime);
          (el as HTMLVideoElement & { requestVideoFrameCallback: (f: typeof cb) => number }).requestVideoFrameCallback(cb);
        };
        (el as HTMLVideoElement & { requestVideoFrameCallback: (f: typeof cb) => number }).requestVideoFrameCallback(cb);
      } else {
        const onPlaying = () => {
          el.removeEventListener("playing", onPlaying);
          onFrame(el, el.currentTime);
        };
        el.addEventListener("playing", onPlaying);
      }
    };
    el.play().then(watch, (e: unknown) => {
      // Autoplay refused (iPhone Low Power Mode, browser settings): frames.
      v.state = "ready";
      v.reason = `play:${(e as Error)?.name ?? "error"}`;
      v.blockedUntil = performance.now() + VIEWER_VIDEO.retryAfterMs;
      showVideo(false);
      showVideoDebug();
    });
  };
  const videoTick = useCallback(
    (speed: number, envDeg: number, now: number): number | null => {
      const v = vid.current;
      const el = videoElRef.current;
      if (!el || !stageVideo || v.state === "off" || v.state === "failed") return null;
      if (speed < VIEWER_VIDEO.minSpeedShare) {
        if (v.state === "on" || v.state === "starting") stopVideo();
        return null;
      }
      if (v.state === "ready") {
        if (now >= v.blockedUntil && videoFeetRef.current.state !== "loading") startVideo(envDeg, speed);
        return null;
      }
      // The spin eases in / out: the video plays at the same share of its speed.
      const fullRate = stageVideo.duration / STAGE_ARENA.autoRotateSecPerTurn;
      if (Math.abs(el.playbackRate - fullRate * speed) > fullRate * VIEWER_VIDEO.rateStep) el.playbackRate = fullRate * speed;
      if (v.state !== "on") return null;
      // A phone that can't decode it in time (many dropped frames in two
      // checks in a row): the frames take over, the video is tried again later.
      if (now - v.q.at > VIEWER_VIDEO.dropCheckMs) {
        const q = typeof el.getVideoPlaybackQuality === "function" ? el.getVideoPlaybackQuality() : null;
        let bad = 0;
        if (q && v.q.at) {
          const total = q.totalVideoFrames - v.q.total;
          const dropped = q.droppedVideoFrames - v.q.dropped;
          bad = total >= 10 && dropped / total > VIEWER_VIDEO.maxDropShare ? v.q.bad + 1 : 0;
          if (bad >= VIEWER_VIDEO.dropBadChecks) {
            v.reason = `dropping:${dropped}/${total}`;
            v.blockedUntil = now + VIEWER_VIDEO.dropRetryMs;
            stopVideo();
            return null;
          }
        }
        v.q = { at: now, dropped: q?.droppedVideoFrames ?? 0, total: q?.totalVideoFrames ?? 0, bad };
      }
      const t = v.rvfc ? v.mediaTime + ((now - v.at) / 1000) * el.playbackRate : el.currentTime;
      return videoAngle(t, stageVideo.duration);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stageVideo],
  );

  // Pick the source once the four sides are on screen (they load first).
  useEffect(() => {
    const el = videoElRef.current;
    if (!ready) return;
    if (!stageVideo || !el || !VIEWER_VIDEO.enabled) {
      settleVideo(); // no video: the stage card doesn't wait for one
      return;
    }
    const v = vid.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (reduced || saveData || STAGE_ARENA.autoRotateDirection !== 1) {
      v.state = "failed";
      v.reason = reduced ? "reduced-motion" : saveData ? "save-data" : "direction";
      showVideoDebug();
      settleVideo();
      return;
    }
    // The video's own soles: it shows only once they are here (else the
    // shadows would follow the frames' feet); no file = the frames' feet.
    let alive = true;
    const vf = videoFeetRef.current;
    if (stageVideo.feet && vf.state === "none") {
      vf.state = "loading";
      fetch(`${videoBase}/${stageVideo.feet}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!alive) return;
          vf.track = parseVideoFeet(j);
          vf.state = "ok";
          if (!vf.track) {
            v.reason = "no-feet"; // shadows follow the frames' feet
            showVideoDebug();
          }
        })
        .catch(() => {
          if (!alive) return;
          vf.state = "ok";
          v.reason = "no-feet";
          showVideoDebug();
        });
    }
    v.rvfc = "requestVideoFrameCallback" in el;
    v.srcs = sourceOrder(stageVideo.sources, (t) => el.canPlayType(t), /Apple/.test(navigator.vendor));
    // Buffering while shown: back to the frames, try again a little later.
    const onWaiting = () => {
      if (v.state !== "on") return;
      if (v.stall) clearTimeout(v.stall);
      v.stall = setTimeout(() => {
        v.stall = 0;
        if (v.state !== "on") return;
        v.reason = "stall";
        v.blockedUntil = performance.now() + VIEWER_VIDEO.retryAfterMs;
        stopVideo();
      }, VIEWER_VIDEO.stallFallbackMs);
    };
    const onPlaying = () => {
      if (v.stall) clearTimeout(v.stall);
      v.stall = 0;
    };
    const onCanPlay = () => settleVideo();
    const onError = () => {
      if (v.state === "failed") return;
      v.reason = `error:${v.srcs[v.srcIdx]?.file ?? ""}`;
      stopVideo();
      loadSource(v.srcIdx + 1);
    };
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("error", onError);
    el.addEventListener("canplaythrough", onCanPlay);
    const t = setTimeout(() => loadSource(0), VIEWER_VIDEO.startDelayMs);
    return () => {
      alive = false;
      if (vf.state === "loading") vf.state = "none";
      clearTimeout(t);
      if (v.stall) clearTimeout(v.stall);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("error", onError);
      el.removeEventListener("canplaythrough", onCanPlay);
      el.pause();
      v.state = "off";
      showVideo(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stageVideo, videoBase]);

  const renderSide = useCallback(
    (from: number, to: number, t: number, next?: number) => {
      const vi = viewIdxRef.current;
      // Two sides on the same photo (a set with fewer than 4 distinct sides): no fade.
      if (vi[from] === vi[to]) from = to;
      forceRef.current = { lo: vi[from], hi: vi[to], a: from === to ? 0 : t, next: next === undefined ? undefined : vi[next] };
      // At rest: decode the neighbouring sides ahead, so a crossfade never
      // waits on (or stalls for) a decode.
      if (from === to && t === 0) {
        cacheRef.current?.request(vi[(to + 1) % 4]);
        cacheRef.current?.request(vi[(to + 3) % 4]);
      }
      // At rest on `to` (zone markers, label); mid-crossfade counts as moving.
      paint(VIEW_ANGLES[t < 0.5 ? from : to], from !== to && t > 0 && t < 1, false);
    },
    [paint],
  );
  useImperativeHandle(ref, () => ({ render: paint, renderSide, video: videoTick }), [paint, renderSide, videoTick]);

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
    // "static-athlete": the four sides are all it ever shows.
    const order = angles && !staticSides ? loadOrder(angles, sides) : sides;
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
  }, [base, frames.join("|"), viewIdx.join(","), angles, staticSides]);

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
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical: the page scrolls
      // Horizontal over the stage: ours. Cancelling it also stops Mac browsers
      // from turning the two-finger swipe into back / forward navigation.
      e.preventDefault();
      if (ready) onWheelTurnRef.current?.(e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX);
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
      style={{ ...viewer360FrameStyle(), touchAction: "pan-y", overscrollBehaviorX: "contain" }}
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
        // Only while the stage itself has focus (a zone marker inside keeps its
        // own keys; elsewhere the page keeps Space / arrows for scrolling).
        if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
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
      {debugVideo && (
        <div
          ref={videoBadgeRef}
          className="pointer-events-none absolute left-2 top-2 z-30 rounded bg-black/70 px-2 py-1 font-mono text-[11px] text-white"
          aria-hidden
        >
          {stageVideo ? "video: off" : "video: none for this athlete"}
        </div>
      )}
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

      <div ref={stackRef} role="img" aria-label={describe(0)} className="absolute inset-0" style={{ transformOrigin: "50% 100%", isolation: "isolate" }}>
        {[0, 1].map((k) => (
          <canvas
            key={k}
            ref={(el) => {
              canvasRefs.current[k] = el;
            }}
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ opacity: k === 0 ? 1 : 0, zIndex: k + 1, mixBlendMode: k === 1 && dissolveOn ? ("plus-lighter" as never) : undefined }}
          />
        ))}
        {stageVideo && (
          // The turn video (hybrid viewer): same box and feet shift as the
          // frames, shown only while it plays the auto-rotation.
          <video
            ref={videoElRef}
            aria-hidden
            muted
            playsInline
            loop
            preload="none"
            crossOrigin="anonymous"
            disablePictureInPicture
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ opacity: 0, zIndex: 3, objectFit: "fill" }}
          />
        )}
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
