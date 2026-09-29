"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { type Dict, fmt } from "@/lib/i18n";
import { FrameStage } from "./FrameStage";
import type { EditorFrame } from "./FrameEditor";

/**
 * Plays every frame in order with its transform (and the same ground
 * anchoring as the public viewer), so a wobble shows before publishing.
 */
export function Flipbook({ frames, aspect, m }: { frames: EditorFrame[]; aspect: number; m: Dict }) {
  const n = frames.length;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(8);
  const [raw, setRaw] = useState(false);
  const [guides, setGuides] = useState(true);
  const last = useRef(0);

  useEffect(() => {
    if (!playing || n === 0) return;
    let raf = 0;
    const tick = (now: number) => {
      if (now - last.current >= 1000 / fps) {
        last.current = now;
        setI((v) => (v + 1) % n);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, fps, n]);

  if (n === 0) return null;
  const idx = Math.min(i, n - 1);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <FrameStage
        aspect={aspect}
        guides={guides}
        noTransform={raw}
        className="mx-auto w-full max-w-[260px] shrink-0 border border-border"
        // Every frame stays mounted (decoded once) so playback never flickers.
        layers={frames.map((f, k) => ({ key: f.file, src: f.src, foot: f.foot, t: f.t, hidden: false, opacity: k === idx ? 1 : 0 }))}
      />
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPlaying((p) => !p)} className="btn btn-primary">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playing ? m.st_pause : m.st_play}
          </button>
          <span className="font-mono text-xs text-muted">{fmt(m.st_frameOf, { n: idx + 1, total: n })}</span>
        </div>
        <input
          type="range"
          min={0}
          max={n - 1}
          step={1}
          value={idx}
          onChange={(e) => {
            setPlaying(false);
            setI(Number(e.target.value));
          }}
          className="h-8 w-full accent-red-600"
          aria-label={m.st_scrub}
        />
        <label className="flex min-h-11 items-center gap-2 text-xs text-muted">
          {m.st_speed}
          <input type="range" min={2} max={24} step={1} value={fps} onChange={(e) => setFps(Number(e.target.value))} className="flex-1 accent-red-600" />
          <span className="w-12 font-mono text-text">{fps} fps</span>
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="accent-red-600" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
            {m.st_showOriginal}
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="accent-red-600" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
            {m.st_guides}
          </label>
        </div>
        <p className="text-xs text-faint">{m.st_flipHint}</p>
      </div>
    </div>
  );
}
