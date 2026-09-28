"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Media360 } from "@/lib/data";
import { VIEW_ANGLES, VIEW_KEYS, frameAngles } from "@/lib/views";
import { VIEWER_VIEWS, viewer360FrameStyle } from "@/lib/config";
import { type Dict } from "@/lib/i18n";
import { formatIDR } from "@/lib/format";

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
    /** Mouse over / off the athlete. */
    onHoverChange?: (over: boolean) => void;
    /** A press on the athlete that did not become a drag (phones: tap). */
    onTap?: () => void;
    /** Keyboard focus on / off the athlete. */
    onFocusChange?: (focused: boolean) => void;
  } & DragCallbacks
>(function AthleteViews(
  { athleteId, media, view, m, label, onStep, onReady, onHoverChange, onTap, onFocusChange, onDragStart, onDragMove, onDragEnd },
  ref,
) {
  const router = useRouter();
  const base = media.baseUrl.replace(/\/$/, "");
  const frames = media.frames;
  const viewFiles = VIEW_KEYS.map((k) => media.views?.[k] ?? frames[0]);
  const viewIdx = viewFiles.map((f) => Math.max(0, frames.indexOf(f)));
  const angles = useMemo(() => frameAngles(frames, media.views), [frames, media.views]);

  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const stackRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<HTMLDivElement>(null);
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
      const EPS = 0.002;
      for (let i = 0; i < imgs.length; i++) {
        const el = imgs[i];
        if (!el) continue;
        const isLo = i === lo.i;
        const isHi = i === hi.i && t > EPS && hi.i !== lo.i;
        el.style.opacity = isLo ? "1" : isHi ? String(t) : "0";
        el.style.zIndex = isHi ? "2" : isLo ? "1" : "0";
        el.style.visibility = isLo || isHi ? "visible" : "hidden";
      }
      // Fallback "turn" cue (only when stepping between the 4 view photos).
      const stack = stackRef.current;
      if (stack) {
        if (!fullRef.current && turning) {
          const s = Math.sin(Math.PI * t);
          stack.style.transform = `translateX(${(VIEWER_VIEWS.fallbackShiftPct * s).toFixed(2)}%) scaleX(${(
            1 -
            VIEWER_VIEWS.fallbackSqueeze * s
          ).toFixed(4)})`;
        } else {
          stack.style.transform = "";
        }
      }
      // Zone markers: hidden while turning, back on the settled view.
      const mk = markersRef.current;
      if (mk) {
        mk.style.opacity = moving ? "0" : "1";
        mk.style.visibility = moving ? "hidden" : "visible";
      }
    },
    [keyframes],
  );

  useImperativeHandle(ref, () => ({ render: paint }), [paint]);

  // Phase 1: the four view photos (so the page is usable fast).
  useEffect(() => {
    let alive = true;
    const uniq = Array.from(new Set(viewIdx));
    Promise.all(uniq.map((i) => decode(url(i)).then((ok) => ok && loadedRef.current.add(i)))).then(() => {
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

  // Repaint once the view photos are ready (and whenever the image set changes).
  useEffect(() => {
    if (ready) paint(lastRef.current.a, lastRef.current.moving, lastRef.current.turning);
  }, [ready, paint]);
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

  return (
    <div
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
      {/* Ground-contact shadow (behind the photo) so the athlete stands, not floats */}
      <div className="stage-contact" aria-hidden />

      <div ref={stackRef} className="absolute inset-0" style={{ transformOrigin: "50% 100%" }}>
        {frames.map((f, i) => {
          const isView = viewIdx.includes(i);
          const src = isView || phase2 ? url(i) : undefined;
          const first = i === viewIdx[0];
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
              style={{ opacity: first ? 1 : 0, visibility: first ? "visible" : "hidden", zIndex: first ? 1 : 0 }}
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
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (canApply) router.push(`/atlet/${athleteId}/ajukan?zone=${h.athleteZoneId}`);
                }}
                className="group pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              >
                <span
                  className={`block h-3.5 w-3.5 rounded-full border-2 border-white shadow ${
                    taken ? "bg-white/40" : "bg-[#ff3b57]"
                  } ${canApply ? "cursor-pointer" : "cursor-default"}`}
                />
                <span className="pointer-events-none absolute left-1/2 top-5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black/85 px-2 py-1 text-[10px] text-white group-hover:block">
                  {h.zoneNama ?? h.label}
                  {taken ? ` · ${m.v360_taken}` : h.effectivePrice != null ? ` · ${formatIDR(h.effectivePrice)}` : ""}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
});
