"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Crosshair, Download, ListVideo, RotateCw } from "lucide-react";
import { VIDEO_360 } from "@/lib/config";
import { type Dict, errorMessage, fmt } from "@/lib/i18n";
import {
  analyzeTurn,
  MARK_ORDER,
  marksFile,
  marksInOrder,
  openVideo,
  stillBands,
  suggestMarks,
  type OpenVideo,
  type TurnAnalysis,
  type TurnMarks,
} from "@/lib/media360-video";

type Band = { from: number; to: number; drop: boolean };

const MARK_COLOR: Record<keyof TurnMarks, string> = {
  start: "#12b76a",
  front: "#00b4ff",
  right: "#f79009",
  back: "#7a5af8",
  left: "#0ba5ec",
  end: "#12b76a",
};

/**
 * Admin: the timeline of a 360 video. Scrub it (slider, ±1 frame, the
 * thumbnail strip), mark where one full turn starts and ends and where the
 * athlete faces Front / Right / Back / Left, and see the moments of standing
 * still (grey bands, dropped unless unticked). The marks start from an
 * automatic guess. Nothing is saved or uploaded here: the marks only live in
 * this page until the next stage uses them for processing.
 */
export function VideoTimeline({ file, disabled, m }: { file: File; disabled?: boolean; m: Dict }) {
  const { timelineThumbs, timelineFps, stillMinSec } = VIDEO_360;
  const [vid, setVid] = useState<OpenVideo | null>(null);
  const [analysis, setAnalysis] = useState<TurnAnalysis | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [marks, setMarks] = useState<TurnMarks | null>(null);
  const [bands, setBands] = useState<Band[]>([]);
  const holder = useRef<HTMLDivElement>(null);
  const vidRef = useRef<OpenVideo | null>(null);

  useEffect(
    () => () => {
      vidRef.current?.close();
      vidRef.current = null;
    },
    [],
  );

  // The opened <video> is the preview itself: seeking paints that frame.
  useEffect(() => {
    const el = holder.current;
    if (!vid || !el) return;
    const v = vid.video;
    v.className = "h-full w-full object-contain";
    v.setAttribute("aria-hidden", "true");
    el.appendChild(v);
    return () => {
      if (v.parentNode === el) el.removeChild(v);
    };
  }, [vid]);

  async function open() {
    setError(null);
    setProgress(0);
    try {
      const v = await openVideo(file);
      vidRef.current = v;
      const a = await analyzeTurn(v.video, (f) => setProgress(f), { thumbs: timelineThumbs });
      setAnalysis(a);
      setMarks(suggestMarks(a));
      setBands(stillBands(a, stillMinSec).map((b) => ({ ...b, drop: true })));
      setVid(v);
      go(0, v);
    } catch (e) {
      vidRef.current?.close();
      vidRef.current = null;
      setError(e instanceof Error && e.message === "video_unreadable" ? m.vid_err_read : errorMessage(m, e));
    } finally {
      setProgress(null);
    }
  }

  const go = useCallback((time: number, v: OpenVideo | null = vidRef.current) => {
    if (!v) return;
    const d = v.duration;
    const next = Math.min(Math.max(0, time), Math.max(0, d - 0.001));
    v.video.currentTime = next;
    setT(next);
  }, []);
  const stepFrame = (dir: 1 | -1) => go(t + dir / timelineFps);

  // Save the marks as <video name>-marks.json (in the browser only).
  function download() {
    if (!marks || !analysis) return;
    const text = marksFile(
      marks,
      bands.filter((b) => b.drop),
      { video: file.name, duration: analysis.duration },
    );
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file.name.replace(/\.[^.]+$/, "")}-marks.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const dur = analysis?.duration ?? 0;
  const pct = (s: number) => `${dur ? (100 * s) / dur : 0}%`;
  const sec = (s: number) => s.toFixed(2);
  const markName: Record<keyof TurnMarks, string> = {
    start: m.vid_tl_start,
    front: m.view_front,
    right: m.view_right,
    back: m.view_back,
    left: m.view_left,
    end: m.vid_tl_end,
  };

  if (!analysis || !marks) {
    return (
      <div className="mt-4 rounded-lg border border-border p-3">
        <h3 className="text-sm font-semibold text-text">{m.vid_tl_title}</h3>
        <p className="mt-1 text-xs text-muted">{m.vid_tl_hint}</p>
        {error && <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={open} disabled={disabled || progress != null} className="btn disabled:cursor-not-allowed disabled:opacity-50">
            {progress != null ? <RotateCw className="h-4 w-4 animate-spin" /> : <ListVideo className="h-4 w-4" />}
            {progress != null ? fmt(m.vid_analysing, { pct: Math.round(progress * 100) }) : m.vid_tl_open}
          </button>
          {progress != null && (
            <div className="h-1.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const ordered = marksInOrder(marks);
  return (
    <div className="mt-4 rounded-lg border border-border p-3" aria-label={m.vid_tl_title} role="group">
      <h3 className="text-sm font-semibold text-text">{m.vid_tl_title}</h3>
      <p className="mt-1 text-xs text-muted">{m.vid_tl_hint}</p>

      <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <div>
          <div ref={holder} className="mx-auto aspect-[3/4] max-h-72 w-full overflow-hidden rounded-lg border border-border bg-black" />
          <p className="mt-1 text-center font-mono text-xs text-muted" aria-live="polite">
            {fmt(m.vid_tl_at, { s: sec(t), f: Math.round(t * timelineFps) })}
          </p>
        </div>

        <div className="min-w-0">
          {/* Thumbnail strip: tap one to jump there (scrolls inside itself on narrow screens; each ≥ 44 px). */}
          <div className="flex gap-0.5 overflow-x-auto overscroll-x-contain">
            {analysis.thumbs.map((th) => (
              <button
                key={th.t}
                type="button"
                onClick={() => go(th.t)}
                disabled={disabled}
                aria-label={fmt(m.vid_tl_jump, { s: sec(th.t) })}
                className="h-11 min-w-11 flex-1 shrink-0 overflow-hidden rounded bg-surface-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={th.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>

          {/* Track: still bands + marks under a native slider (keyboard and touch). */}
          <div className="relative mt-2 h-11">
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-surface-2" />
            {bands.map((b) => (
              <div
                key={b.from}
                className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm"
                style={{ left: pct(b.from), width: pct(b.to - b.from), background: b.drop ? "rgba(120,120,120,0.55)" : "rgba(120,120,120,0.2)" }}
              />
            ))}
            {MARK_ORDER.map((k) => (
              <div
                key={k}
                className="pointer-events-none absolute top-0 h-full w-0.5 -translate-x-1/2"
                style={{ left: pct(marks[k]), background: MARK_COLOR[k] }}
              >
                {/* Sides: their initial at the top; turn start / end: [ ] at the bottom (no clash with Front). */}
                <span
                  className={`absolute left-1 text-[9px] font-bold leading-none ${k === "start" || k === "end" ? "-bottom-0.5" : "-top-0.5"}`}
                  style={{ color: MARK_COLOR[k] }}
                >
                  {k === "start" ? "[" : k === "end" ? "]" : markName[k].slice(0, 1)}
                </span>
              </div>
            ))}
            <input
              type="range"
              min={0}
              max={dur}
              step={1 / timelineFps}
              value={t}
              disabled={disabled}
              onChange={(e) => go(Number(e.target.value))}
              aria-label={m.vid_tl_scrub}
              aria-valuetext={fmt(m.vid_tl_at, { s: sec(t), f: Math.round(t * timelineFps) })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-60 [touch-action:pan-y]"
            />
          </div>

          <div className="mt-2 flex items-center justify-center gap-2">
            <button type="button" onClick={() => stepFrame(-1)} disabled={disabled} aria-label={m.vid_tl_prev} title={m.vid_tl_prev} className="btn h-11 w-11 justify-center p-0">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[5rem] text-center font-mono text-sm text-text">{fmt(m.vid_tl_sec, { s: sec(t) })}</span>
            <button type="button" onClick={() => stepFrame(1)} disabled={disabled} aria-label={m.vid_tl_next} title={m.vid_tl_next} className="btn h-11 w-11 justify-center p-0">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {MARK_ORDER.map((k) => (
              <li key={k} className="flex min-w-0 items-center gap-2 rounded-md bg-surface-2 px-2 py-1">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: MARK_COLOR[k] }} />
                <button
                  type="button"
                  onClick={() => go(marks[k])}
                  disabled={disabled}
                  title={fmt(m.vid_tl_jump, { s: sec(marks[k]) })}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm text-text"
                >
                  <span className="truncate">{markName[k]}</span>
                  <span className="ml-auto font-mono text-xs text-muted">{fmt(m.vid_tl_sec, { s: sec(marks[k]) })}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMarks({ ...marks, [k]: t })}
                  disabled={disabled}
                  aria-label={fmt(m.vid_tl_setMark, { mark: markName[k] })}
                  title={fmt(m.vid_tl_setMark, { mark: markName[k] })}
                  className="btn h-11 w-11 shrink-0 justify-center p-0"
                >
                  <Crosshair className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {!ordered && <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{m.vid_tl_order}</p>}
          <button type="button" onClick={() => setMarks(suggestMarks(analysis))} disabled={disabled} className="btn mt-2">
            {m.vid_tl_reset}
          </button>

          <div className="mt-3">
            <p className="text-xs font-semibold text-text">{m.vid_tl_stills}</p>
            {bands.length === 0 ? (
              <p className="text-xs text-muted">{m.vid_tl_noStills}</p>
            ) : (
              <ul className="mt-1 grid gap-1">
                {bands.map((b, i) => (
                  <li key={b.from} className="flex flex-wrap items-center gap-2 text-sm text-text">
                    <button type="button" onClick={() => go(b.from)} disabled={disabled} className="min-h-11 font-mono text-xs text-muted underline-offset-2 hover:underline">
                      {fmt(m.vid_tl_still, { a: sec(b.from), b: sec(b.to) })}
                    </button>
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={b.drop}
                        disabled={disabled}
                        onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, drop: e.target.checked } : x)))}
                        className="accent-red-600"
                      />
                      {m.vid_tl_drop}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* The marks for the Mac video script: a local download, nothing is saved. */}
          <button type="button" onClick={download} disabled={disabled || !ordered} className="btn mt-3 disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-4 w-4" />
            {m.vid_tl_download}
          </button>
          <p className="mt-3 text-xs text-faint">{m.vid_tl_note}</p>
        </div>
      </div>
    </div>
  );
}
