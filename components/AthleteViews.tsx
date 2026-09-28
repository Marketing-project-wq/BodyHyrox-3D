"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Media360 } from "@/lib/data";
import { VIEW_KEYS } from "@/lib/views";
import { VIEWER_VIEWS, viewer360FrameStyle } from "@/lib/config";
import { type Dict } from "@/lib/i18n";
import { formatIDR } from "@/lib/format";

/**
 * Fixed 4-view athlete photo (Depan / Kanan / Belakang / Kiri). Controlled: the
 * parent owns the active view (tabs, arrows) and this component crossfades to
 * it. Only the four view photos are loaded — and decoded up front — so switching
 * is instant. Swipe (phones) and ←/→ (keyboard) ask the parent to step.
 */
export function AthleteViews({
  athleteId,
  media,
  view,
  onStep,
  m,
  label,
}: {
  athleteId: string;
  media: Media360;
  /** Active view index into VIEW_KEYS (0 = front). */
  view: number;
  /** Swipe / arrow-key request: +1 = next (to the right), -1 = previous. */
  onStep: (delta: 1 | -1) => void;
  m: Dict;
  /** Accessible name for the photo region. */
  label: string;
}) {
  const router = useRouter();
  const base = media.baseUrl.replace(/\/$/, "");
  const files = VIEW_KEYS.map((k) => media.views?.[k] ?? media.frames[0]);
  const urls = files.map((f) => `${base}/${f}`);

  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const topRef = useRef(view); // photo fading in / shown
  const underRef = useRef<number | null>(null); // previous photo held opaque underneath
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeRef = useRef<{ x: number; y: number; id: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Load + decode the four view photos before enabling (no flash on switch).
  useEffect(() => {
    let alive = true;
    const unique = Array.from(new Set(urls));
    Promise.all(
      unique.map(
        (u) =>
          new Promise<void>((res) => {
            const img = new Image();
            img.onload = () => {
              if (typeof img.decode === "function") img.decode().catch(() => {}).finally(res);
              else res();
            };
            img.onerror = () => res();
            img.src = u;
          }),
      ),
    ).then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join("|")]);

  // Crossfade to the requested view: the new photo fades in ON TOP of the old
  // one (which stays fully opaque, so the body never looks see-through), then
  // the old one is hidden. A click mid-transition retargets without a glitch:
  // whichever photo is more visible right now becomes the base underneath.
  useEffect(() => {
    const imgs = imgRefs.current;
    const target = view;
    const prevTop = topRef.current;
    if (target === prevTop) return;
    const dur = reduced ? 0 : VIEWER_VIEWS.transitionMs;
    const now = performance.now();
    let under = prevTop;
    if (underRef.current !== null && dur > 0 && (now - startRef.current) / dur < 0.5) under = underRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);

    imgs.forEach((el, i) => {
      if (!el) return;
      el.style.transition = "none";
      const isTarget = i === target;
      const isUnder = i === under && dur > 0;
      el.style.zIndex = isTarget ? "2" : isUnder ? "1" : "0";
      el.style.opacity = isUnder ? "1" : isTarget ? (dur > 0 ? "0" : "1") : "0";
      el.style.visibility = isTarget || isUnder ? "visible" : "hidden";
    });
    topRef.current = target;
    underRef.current = dur > 0 ? under : null;
    startRef.current = now;

    if (dur > 0) {
      const el = imgs[target];
      if (el) {
        void el.offsetWidth; // commit opacity 0 before animating
        el.style.transition = `opacity ${dur}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        el.style.opacity = "1";
      }
      timerRef.current = setTimeout(() => {
        const u = underRef.current;
        if (u !== null && u !== topRef.current && imgs[u]) {
          imgs[u]!.style.opacity = "0";
          imgs[u]!.style.visibility = "hidden";
        }
        underRef.current = null;
      }, dur + 40);
    }
  }, [view, reduced]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // Zones: hotspot points are stored per 1-based frame number; show the ones
  // for the frame this view uses.
  const frameNo = String(media.frames.indexOf(files[view]) + 1);
  const activeHotspots = media.hotspots.filter((h) => h.points[frameNo]);

  const onPointerDown = (e: React.PointerEvent) => {
    swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) >= VIEWER_VIEWS.swipeThresholdPx && Math.abs(dx) > Math.abs(dy) * 1.2) {
      onStep(dx < 0 ? 1 : -1); // swipe left = next side
    }
  };

  return (
    <div
      className="relative mx-auto select-none outline-none focus-visible:ring-2 focus-visible:ring-[#ff2d55]/70 focus-visible:ring-offset-0"
      style={{ ...viewer360FrameStyle(), touchAction: "pan-y" }}
      tabIndex={0}
      role="group"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipeRef.current = null)}
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

      {urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={VIEW_KEYS[i]}
          ref={(el) => {
            imgRefs.current[i] = el;
          }}
          src={u}
          alt=""
          draggable={false}
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          style={{ opacity: i === view ? 1 : 0, visibility: i === view ? "visible" : "hidden", zIndex: i === view ? 2 : 0 }}
        />
      ))}

      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-white/60">{m.v360_loading}</div>
      )}

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
              onClick={() => {
                if (canApply) router.push(`/atlet/${athleteId}/ajukan?zone=${h.athleteZoneId}`);
              }}
              className="group absolute z-10 -translate-x-1/2 -translate-y-1/2"
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
  );
}
