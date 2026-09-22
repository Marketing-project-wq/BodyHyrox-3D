"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import type { Media360 } from "@/lib/data";
import { type Dict, fmt } from "@/lib/i18n";
import { formatIDR } from "@/lib/format";

const PIXELS_PER_FRAME = 22; // drag distance that advances one frame
const AUTOSPIN_MS = 180; // per-frame delay while auto-spinning
const RESUME_AFTER_MS = 2500; // idle delay before auto-spin resumes

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
  const urls = useMemo(
    () => media.frames.map((f) => `${media.baseUrl.replace(/\/$/, "")}/${f}`),
    [media.baseUrl, media.frames],
  );

  const [index, setIndex] = useState(0); // 0-based
  const [loaded, setLoaded] = useState(0);
  const [spinning, setSpinning] = useState(media.autospin);

  const dragging = useRef(false);
  const lastX = useRef(0);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Preload frames.
  useEffect(() => {
    let alive = true;
    let count = 0;
    urls.forEach((u) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        if (!alive) return;
        count += 1;
        setLoaded(count);
      };
      img.src = u;
    });
    return () => {
      alive = false;
    };
  }, [urls]);

  const step = useCallback(
    (delta: number) => {
      if (total === 0) return;
      setIndex((i) => (((i + delta) % total) + total) % total);
    },
    [total],
  );

  // Auto-spin loop.
  useEffect(() => {
    if (!spinning || total === 0) return;
    spinTimer.current = setInterval(() => step(1), AUTOSPIN_MS);
    return () => {
      if (spinTimer.current) clearInterval(spinTimer.current);
    };
  }, [spinning, total, step]);

  const pauseSpin = useCallback(() => {
    setSpinning(false);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  const scheduleResume = useCallback(() => {
    if (!media.autospin) return;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setSpinning(true), RESUME_AFTER_MS);
  }, [media.autospin]);

  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    [],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    lastX.current = e.clientX;
    pauseSpin();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastX.current;
    if (Math.abs(dx) >= PIXELS_PER_FRAME) {
      // Drag left → next frame; drag right → previous frame.
      const dir = dx < 0 ? 1 : -1;
      const steps = Math.floor(Math.abs(dx) / PIXELS_PER_FRAME);
      step(dir * steps);
      lastX.current = e.clientX;
    }
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    scheduleResume();
  };

  const frameNo = index + 1; // 1-based, matches hotspot keys
  const ready = loaded >= total;

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
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Frames */}
        {urls.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={u}
            src={u}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: i === index ? 1 : 0,
              transition: media.crossfade ? "opacity 120ms linear" : "none",
            }}
          />
        ))}

        {/* Loading shimmer */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-white/60">
            {m.v360_loading}
          </div>
        )}

        {/* Hotspots for the current frame */}
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
