"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Wand2, RotateCcw, X, Layers, Ruler } from "lucide-react";
import { type Dict, fmt } from "@/lib/i18n";
import { IDENTITY, autoAlign, transformFoot, type Foot, type FrameTransform } from "@/lib/media360";
import { FrameStage, placeFrame } from "./FrameStage";

export type EditorFrame = { file: string; src: string | undefined; foot: Foot | null; t?: FrameTransform };

const median = (a: number[]) => {
  const s = [...a].sort((p, q) => p - q);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/**
 * Per-frame alignment: rotate / move / scale around the feet, with guides
 * (body centre, head line, ground line) and onion skin of the neighbouring
 * frames. Changes are written back immediately (non-destructive metadata).
 */
export function FrameEditor({
  frames,
  index,
  aspect,
  onIndex,
  onChange,
  onClose,
  m,
}: {
  frames: EditorFrame[];
  index: number;
  aspect: number;
  onIndex: (i: number) => void;
  onChange: (file: string, t: FrameTransform) => void;
  onClose: () => void;
  m: Dict;
}) {
  const n = frames.length;
  const cur = frames[index];
  const prev = frames[(index - 1 + n) % n];
  const next = frames[(index + 1) % n];
  const t: FrameTransform = { ...IDENTITY, ...(cur.t ?? {}) };
  const [onion, setOnion] = useState(true);
  const [onionOpacity, setOnionOpacity] = useState(0.35);
  const [guides, setGuides] = useState(true);
  const [raw, setRaw] = useState(false);

  const set = (patch: Partial<FrameTransform>) => onChange(cur.file, { ...t, ...patch });

  // Neighbours as they appear on stage (their own transforms applied).
  const neighbours = useMemo(
    () => [prev, next].filter((f) => f && f.file !== cur.file && f.foot).map((f) => transformFoot(f.foot as Foot, f.t)),
    [prev, next, cur.file],
  );
  const guideHead = useMemo(() => {
    const tops = [prev, next]
      .filter((f) => f && f.foot && f.foot.top != null)
      .map((f) => {
        const { shift, eff } = placeFrame(f.foot, f.t);
        return (eff?.top ?? 0) + shift;
      });
    return median(tops);
  }, [prev, next]);
  const guideX = useMemo(() => median(neighbours.map((f) => f.cx ?? 0.5)), [neighbours]);

  const auto = () => {
    if (!cur.foot) return;
    onChange(cur.file, { ...autoAlign(cur.foot, neighbours), lock: t.lock });
  };

  // Keyboard: arrows move (Shift = fine), [ ] rotate, - = scale, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const k = e.shiftKey ? 0.25 : 1;
      const tt = { ...IDENTITY, ...(cur.t ?? {}) };
      const put = (p: Partial<FrameTransform>) => {
        e.preventDefault();
        onChange(cur.file, { ...tt, ...p });
      };
      if (e.key === "ArrowLeft") put({ dx: tt.dx - 0.002 * k });
      else if (e.key === "ArrowRight") put({ dx: tt.dx + 0.002 * k });
      else if (e.key === "ArrowUp") put({ dy: tt.dy - 0.002 * k });
      else if (e.key === "ArrowDown") put({ dy: tt.dy + 0.002 * k });
      else if (e.key === "[") put({ rot: Math.round((tt.rot - 0.1 * k) * 100) / 100 });
      else if (e.key === "]") put({ rot: Math.round((tt.rot + 0.1 * k) * 100) / 100 });
      else if (e.key === "-") put({ s: tt.s - 0.002 * k });
      else if (e.key === "=" || e.key === "+") put({ s: tt.s + 0.002 * k });
      else if (e.key === "," ) onIndex((index - 1 + n) % n);
      else if (e.key === ".") onIndex((index + 1) % n);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur, index, n, onChange, onIndex, onClose]);

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onV: (v: number) => void,
    shown: (v: number) => string,
    toInput: (v: number) => number,
    fromInput: (v: number) => number,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="font-mono text-text">{shown(value)}</span>
      </span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onV(Number(e.target.value))}
          className="h-8 w-full accent-red-600"
        />
        <input
          type="number"
          step={toInput(step)}
          value={Number(toInput(value).toFixed(3))}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onV(fromInput(v));
          }}
          className="input w-20 px-2 py-1 text-xs"
        />
      </div>
    </label>
  );

  const pct = (v: number) => v * 100;
  const unpct = (v: number) => v / 100;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2 text-white">
        <div className="min-w-0 text-sm">
          <span className="font-semibold">{fmt(m.st_editTitle, { n: index + 1, total: n })}</span>
          <span className="ml-2 truncate font-mono text-xs text-white/50">{cur.file}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="rounded-full p-2 hover:bg-white/10" onClick={() => onIndex((index - 1 + n) % n)} aria-label={m.st_prev}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" className="rounded-full p-2 hover:bg-white/10" onClick={() => onIndex((index + 1) % n)} aria-label={m.st_next}>
            <ChevronRight className="h-5 w-5" />
          </button>
          <button type="button" className="rounded-full p-2 hover:bg-white/10" onClick={onClose} aria-label={m.st_close}>
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden">
        <div className="flex shrink-0 items-center justify-center lg:min-h-0 lg:flex-1 lg:shrink">
          <FrameStage
            aspect={aspect}
            guides={guides}
            headY={guideHead}
            targetX={guideX}
            noTransform={raw}
            className="h-[56svh] border border-white/10 lg:h-[min(78vh,900px)]"
            layers={[
              { key: "p", src: prev.src, foot: prev.foot, t: prev.t, opacity: onionOpacity, filter: "sepia(1) hue-rotate(160deg) saturate(3)", hidden: !onion || prev.file === cur.file },
              { key: "n", src: next.src, foot: next.foot, t: next.t, opacity: onionOpacity, filter: "sepia(1) hue-rotate(-50deg) saturate(3)", hidden: !onion || next.file === cur.file || next.file === prev.file },
              { key: "c", src: cur.src, foot: cur.foot, t },
            ]}
          />
        </div>

        <div className="w-full shrink-0 rounded-xl bg-surface p-4 text-text lg:w-[320px] lg:overflow-y-auto">
          <div className="flex flex-col gap-4">
            {slider(m.st_rotate, t.rot, -10, 10, 0.1, (v) => set({ rot: Math.round(v * 100) / 100 }), (v) => `${v.toFixed(1)}°`, (v) => v, (v) => v)}
            {slider(m.st_moveX, t.dx, -0.2, 0.2, 0.001, (v) => set({ dx: v }), (v) => `${pct(v).toFixed(1)}%`, pct, unpct)}
            {slider(m.st_moveY, t.dy, -0.2, 0.2, 0.001, (v) => set({ dy: v }), (v) => `${pct(v).toFixed(1)}%`, pct, unpct)}
            {slider(m.st_scale, t.s, 0.8, 1.2, 0.001, (v) => set({ s: v }), (v) => `${pct(v).toFixed(1)}%`, pct, unpct)}

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 accent-red-600" checked={t.lock !== false} onChange={(e) => set({ lock: e.target.checked ? undefined : false })} />
              <span>
                {m.st_lockFeet}
                <span className="block text-xs text-faint">{m.st_lockFeetHint}</span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={auto} disabled={!cur.foot} className="btn btn-primary disabled:opacity-50">
                <Wand2 className="h-4 w-4" /> {m.st_auto}
              </button>
              <button type="button" onClick={() => onChange(cur.file, { ...IDENTITY })} className="btn">
                <RotateCcw className="h-4 w-4" /> {m.st_reset}
              </button>
            </div>
            <p className="text-xs text-faint">{m.st_autoHint}</p>

            <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="accent-red-600" checked={onion} onChange={(e) => setOnion(e.target.checked)} />
                <Layers className="h-4 w-4 text-muted" /> {m.st_onion}
              </label>
              {onion && (
                <input type="range" min={0.1} max={0.8} step={0.05} value={onionOpacity} onChange={(e) => setOnionOpacity(Number(e.target.value))} className="accent-red-600" aria-label={m.st_onionOpacity} />
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" className="accent-red-600" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
                <Ruler className="h-4 w-4 text-muted" /> {m.st_guides}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="accent-red-600" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
                {m.st_showOriginal}
              </label>
              <p className="text-xs text-faint">{m.st_guidesLegend}</p>
              <p className="hidden text-xs text-faint lg:block">{m.st_keys}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
