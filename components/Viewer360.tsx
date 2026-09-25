"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import type { Media360 } from "@/lib/data";
import { VIEWER_360, viewer360FrameStyle } from "@/lib/config";
import { type Dict, fmt } from "@/lib/i18n";
import { formatIDR } from "@/lib/format";

const DRAG_THRESHOLD = 4; // px of movement before a tap becomes a drag

export function Viewer360({
  athleteId,
  media,
  m,
  onFrameChange,
  chrome = true,
}: {
  athleteId: string;
  media: Media360;
  m: Dict;
  /** Fires when the nearest displayed frame changes (1-based). Used for the angle readout. */
  onFrameChange?: (frame: number, total: number) => void;
  /** Show the built-in title/counter/hint. Off when the parent supplies its own (stage card). */
  chrome?: boolean;
}) {
  const router = useRouter();
  const total = media.frames.length;
  const onFrameChangeRef = useRef(onFrameChange);
  useEffect(() => {
    onFrameChangeRef.current = onFrameChange;
  }, [onFrameChange]);
  const framesPerPx = total > 0 ? total / VIEWER_360.dragFullTurnPx : 0;

  const [ready, setReady] = useState(false);
  const [displayFrame, setDisplayFrame] = useState(1); // 1-based, for hotspots + counter

  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const targetRef = useRef(0); // where the finger/momentum wants to be (fractional frame)
  const renderRef = useRef(0); // what is actually painted; eases toward target
  const velRef = useRef(0); // frames per ms (momentum, applied to target)
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const lastTRef = useRef(0);
  const draggingRef = useRef(false);
  const didDragRef = useRef(false);
  const startXRef = useRef(0);
  const lastXRef = useRef(0);
  const samplesRef = useRef<{ t: number; pos: number }[]>([]);
  const displayFrameRef = useRef(1);

  const urls = media.frames.map((f) => `${media.baseUrl.replace(/\/$/, "")}/${f}`);

  const norm = useCallback((p: number) => ((p % total) + total) % total, [total]);
  // shortest signed distance from a to b around the loop, range [-total/2, total/2]
  const wrapDelta = useCallback(
    (d: number) => {
      let x = ((d % total) + total) % total;
      if (x > total / 2) x -= total;
      return x;
    },
    [total],
  );

  // Paint the two nearest frames with crossfade opacity from renderRef.
  const paint = useCallback(() => {
    if (total === 0) return;
    const pos = renderRef.current;
    const base = Math.floor(pos) % total;
    const frac = pos - Math.floor(pos);
    const next = (base + 1) % total;
    const imgs = imgRefs.current;
    if (VIEWER_360.crossfade) {
      for (let i = 0; i < imgs.length; i++) {
        const el = imgs[i];
        if (!el) continue;
        el.style.opacity = i === base ? String(1 - frac) : i === next ? String(frac) : "0";
      }
    } else {
      const nearest = Math.round(pos) % total;
      for (let i = 0; i < imgs.length; i++) {
        const el = imgs[i];
        if (el) el.style.opacity = i === nearest ? "1" : "0";
      }
    }
    const rounded = (Math.round(pos) % total) + 1; // 1-based
    if (rounded !== displayFrameRef.current) {
      displayFrameRef.current = rounded;
      setDisplayFrame(rounded);
      onFrameChangeRef.current?.(rounded, total);
    }
  }, [total]);

  // Single animation loop: momentum moves target, render eases toward target.
  const ensureLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastTRef.current = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - lastTRef.current, 64);
      lastTRef.current = now;

      // Momentum (only when not actively dragging) nudges the target.
      if (!draggingRef.current && Math.abs(velRef.current) > 0) {
        targetRef.current = norm(targetRef.current + velRef.current * dt);
        velRef.current *= Math.pow(VIEWER_360.momentumFriction, dt / 16.667);
        if (Math.abs(velRef.current) < VIEWER_360.momentumStopThreshold) velRef.current = 0;
      }

      // Once motion has stopped, settle onto the nearest real frame (every
      // settleStep-th) so the figure rests on a crisp source photo, not a
      // blended or synthetic frame. Motion still uses all frames for smoothness.
      if (VIEWER_360.snapOnSettle && !draggingRef.current && velRef.current === 0) {
        const step = Math.max(1, VIEWER_360.settleStep);
        targetRef.current = norm(Math.round(targetRef.current / step) * step);
      }

      // Ease the rendered position toward the target (frame-rate independent).
      const diff = wrapDelta(targetRef.current - renderRef.current);
      const k = 1 - Math.pow(1 - VIEWER_360.followPerFrame, dt / 16.667);
      renderRef.current = norm(renderRef.current + diff * k);
      paint();

      const settled =
        !draggingRef.current &&
        velRef.current === 0 &&
        Math.abs(wrapDelta(targetRef.current - renderRef.current)) < VIEWER_360.settleEpsilon;
      if (settled) {
        renderRef.current = targetRef.current;
        paint();
        runningRef.current = false;
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [norm, wrapDelta, paint]);

  // Preload all frames, then enable.
  useEffect(() => {
    let alive = true;
    let count = 0;
    if (total === 0) return;
    urls.forEach((u) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        if (!alive) return;
        count += 1;
        if (count >= total) {
          setReady(true);
          requestAnimationFrame(paint);
        }
      };
      img.src = u;
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.baseUrl, total]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ready) return;
    velRef.current = 0; // cancel any momentum
    draggingRef.current = false;
    didDragRef.current = false;
    startXRef.current = e.clientX;
    lastXRef.current = e.clientX;
    samplesRef.current = [{ t: performance.now(), pos: targetRef.current }];
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!ready) return;
    if (!draggingRef.current) {
      if (Math.abs(e.clientX - startXRef.current) < DRAG_THRESHOLD) return;
      draggingRef.current = true;
      didDragRef.current = true;
      lastXRef.current = e.clientX;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    targetRef.current = norm(targetRef.current - dx * framesPerPx); // follows the finger
    const now = performance.now();
    const s = samplesRef.current;
    s.push({ t: now, pos: targetRef.current });
    while (s.length > 2 && now - s[0].t > VIEWER_360.velocitySampleMs) s.shift();
    ensureLoop();
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    const s = samplesRef.current;
    if (s.length >= 2) {
      const first = s[0];
      const last = s[s.length - 1];
      const dt = last.t - first.t;
      if (dt > 0) velRef.current = wrapDelta(last.pos - first.pos) / dt;
    }
    ensureLoop();
  };

  const frameNo = displayFrame; // 1-based, matches hotspot point keys
  const activeHotspots = media.hotspots.filter((h) => h.points[String(frameNo)]);

  // Size the figure by viewport height so head-to-toe fits without scrolling;
  // width follows the frame aspect ratio (values from config, never hardcoded).
  const frameStyle = viewer360FrameStyle();

  return (
    <div
      className="relative mx-auto cursor-ew-resize touch-none select-none"
      style={frameStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* 360 label — overlay above the figure so the figure stays centered */}
      {chrome && (
        <div className="pointer-events-none absolute inset-x-0 -top-8 flex items-center justify-center gap-2">
          <span className="font-condensed text-xs font-bold uppercase tracking-[0.2em] text-white/55">{m.v360_title}</span>
          {media.isPlaceholder && (
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[9px] uppercase text-white/45">
              {m.v360_placeholder}
            </span>
          )}
        </div>
      )}

      {/* Ground-contact shadow (behind the frames) so the athlete stands, not floats */}
      <div className="stage-contact" aria-hidden />

        {/* Frames — opacity is managed imperatively (not in JSX) so re-renders don't clobber it */}
        {urls.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={u}
            ref={(el) => {
              imgRefs.current[i] = el;
            }}
            src={u}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            style={{ opacity: i === 0 ? 1 : 0, willChange: "opacity" }}
          />
        ))}

        {/* Loading overlay */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-white/60">
            {m.v360_loading}
          </div>
        )}

        {/* Hotspots for the nearest frame */}
        {ready &&
          activeHotspots.map((h) => {
            const p = h.points[String(frameNo)];
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
                  if (didDragRef.current) return; // ignore click that ended a drag
                  if (canApply) router.push(`/atlet/${athleteId}/ajukan?zone=${h.athleteZoneId}`);
                }}
                className="group absolute -translate-x-1/2 -translate-y-1/2"
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

      {/* Frame counter + drag hint — overlay below the figure */}
      {chrome && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-9 flex flex-col items-center gap-1.5">
          <div className="rounded-full bg-black/55 px-2.5 py-0.5 font-mono text-[10px] text-white/80">
            {fmt(m.v360_frameOf, { n: String(frameNo), total: String(total) })}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/45">
            <RotateCcw size={12} />
            {m.v360_hint}
          </div>
        </div>
      )}
    </div>
  );
}
