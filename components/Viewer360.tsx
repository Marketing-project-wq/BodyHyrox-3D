"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import type { Media360 } from "@/lib/data";
import { VIEWER_360 } from "@/lib/config";
import { type Dict, fmt } from "@/lib/i18n";
import { formatIDR } from "@/lib/format";

const DRAG_THRESHOLD = 4; // px of movement before a tap becomes a drag

export function Viewer360({
  athleteId,
  media,
  m,
}: {
  athleteId: string;
  media: Media360;
  m: Dict;
}) {
  const router = useRouter();
  const total = media.frames.length;
  const framesPerPx = total > 0 ? total / VIEWER_360.dragFullTurnPx : 0;

  const [ready, setReady] = useState(false);
  const [displayFrame, setDisplayFrame] = useState(1); // 1-based, for hotspots + counter

  // Imperatively-driven rotation state (no re-render per frame).
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const posRef = useRef(0); // fractional frame position, [0, total)
  const velRef = useRef(0); // frames per ms
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const didDragRef = useRef(false);
  const startXRef = useRef(0);
  const lastXRef = useRef(0);
  const samplesRef = useRef<{ t: number; pos: number }[]>([]);
  const displayFrameRef = useRef(1);

  const urls = media.frames.map((f) => `${media.baseUrl.replace(/\/$/, "")}/${f}`);

  const norm = useCallback((p: number) => ((p % total) + total) % total, [total]);

  // Paint the two nearest frames with crossfade opacity; sync hotspot frame on integer change.
  const paint = useCallback(() => {
    if (total === 0) return;
    const pos = posRef.current;
    const base = Math.floor(pos) % total;
    const frac = pos - Math.floor(pos);
    const next = (base + 1) % total;
    const imgs = imgRefs.current;
    for (let i = 0; i < imgs.length; i++) {
      const el = imgs[i];
      if (!el) continue;
      el.style.opacity = i === base ? String(1 - frac) : i === next ? String(frac) : "0";
    }
    const rounded = (Math.round(pos) % total) + 1; // 1-based
    if (rounded !== displayFrameRef.current) {
      displayFrameRef.current = rounded;
      setDisplayFrame(rounded);
    }
  }, [total]);

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

  const stopMomentum = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    velRef.current = 0;
  }, []);

  const startMomentum = useCallback(() => {
    let lastT = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - lastT, 64); // clamp long frames
      lastT = now;
      posRef.current = norm(posRef.current + velRef.current * dt);
      // frame-rate-independent decay
      velRef.current *= Math.pow(VIEWER_360.momentumFriction, dt / 16.667);
      paint();
      if (Math.abs(velRef.current) < VIEWER_360.momentumStopThreshold) {
        velRef.current = 0;
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [norm, paint]);

  useEffect(() => () => stopMomentum(), [stopMomentum]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ready) return;
    stopMomentum();
    draggingRef.current = false;
    didDragRef.current = false;
    startXRef.current = e.clientX;
    lastXRef.current = e.clientX;
    samplesRef.current = [{ t: performance.now(), pos: posRef.current }];
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
    // Drag direction follows the finger.
    posRef.current = norm(posRef.current - dx * framesPerPx);
    paint();
    const now = performance.now();
    const samples = samplesRef.current;
    samples.push({ t: now, pos: posRef.current });
    // keep only the recent window
    while (samples.length > 2 && now - samples[0].t > VIEWER_360.velocitySampleMs) samples.shift();
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    // Estimate release velocity from the sample window, accounting for wrap.
    const samples = samplesRef.current;
    if (samples.length >= 2) {
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.t - first.t;
      if (dt > 0) {
        let dPos = last.pos - first.pos;
        // unwrap shortest path around the loop
        if (dPos > total / 2) dPos -= total;
        if (dPos < -total / 2) dPos += total;
        velRef.current = dPos / dt;
      }
    }
    if (Math.abs(velRef.current) > VIEWER_360.momentumStopThreshold) startMomentum();
  };

  const frameNo = displayFrame; // 1-based, matches hotspot point keys
  const activeHotspots = media.hotspots.filter((h) => h.points[String(frameNo)]);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-condensed text-xl font-bold uppercase tracking-wide">{m.v360_title}</h2>
        {media.isPlaceholder && (
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase text-white/50">
            {m.v360_placeholder}
          </span>
        )}
      </div>

      <div
        className="relative mx-auto aspect-[168/395] w-full max-w-[300px] cursor-ew-resize touch-none select-none overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
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
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
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

        {/* Frame counter */}
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-0.5 font-mono text-[10px] text-white/80">
          {fmt(m.v360_frameOf, { n: String(frameNo), total: String(total) })}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-white/45">
        <RotateCcw size={12} />
        {m.v360_hint}
      </div>
    </div>
  );
}
