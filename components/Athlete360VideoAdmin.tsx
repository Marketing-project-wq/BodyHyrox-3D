"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCw, UploadCloud, Video } from "lucide-react";
import { VIDEO_360 } from "@/lib/config";
import { type Dict, errorMessage, fmt } from "@/lib/i18n";
import { unwrap } from "@/lib/action-result";
import { markerSource, saveDraft } from "@/app/atlet/[id]/media-actions";
import { carryMarkersBySide, type MarkerCount } from "@/lib/media360-sides";
import { measureBlob, prepareBackgroundRemover, preparePhoto, uploadDraftBlobs } from "@/lib/media360-upload";
import { fitVideoFrames, grabFrame, openVideo, pickTimes, sidesOf } from "@/lib/media360-video";
import type { Foot, FrameMetaMap } from "@/lib/media360";

type Step = "idle" | "analyse" | "model" | "cutout" | "fit" | "upload" | "done" | "error";

/**
 * Admin: build the 360 set from ONE video of the athlete turning a full
 * circle. Everything runs in this browser (frames, background removal,
 * fitting); only the finished frames are uploaded, into the DRAFT. The
 * studio below previews and publishes it.
 */
export function Athlete360VideoAdmin({
  athleteId,
  currentFrames,
  hasDraft,
  m,
}: {
  athleteId: string;
  currentFrames: number;
  hasDraft: boolean;
  m: Dict;
}) {
  const router = useRouter();
  const { frames: count, maxFileMB, maxDurationSec, acceptMime } = VIDEO_360;
  const [file, setFile] = useState<File | null>(null);
  const [reverse, setReverse] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState(0);
  const [carried, setCarried] = useState<{ count: MarkerCount; dropped: number; version: number } | null>(null);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const busy = step === "analyse" || step === "model" || step === "cutout" || step === "fit" || step === "upload";
  useEffect(() => {
    if (!busy) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [busy]);

  function onPick(list: FileList | null) {
    setError(null);
    setStep("idle");
    const f = list?.[0];
    if (!f) return;
    if (!(acceptMime as readonly string[]).includes(f.type) && !/\.(mp4|mov|m4v|webm)$/i.test(f.name)) {
      setError(m.vid_err_type);
      return;
    }
    if (f.size > maxFileMB * 1024 * 1024) {
      setError(fmt(m.vid_err_big, { name: f.name, mb: maxFileMB }));
      return;
    }
    setFile(f);
  }

  async function run() {
    if (!file) return;
    if (hasDraft && !window.confirm(m.vid_replaceDraft)) return;
    setError(null);
    setProgress(0);
    let vid: Awaited<ReturnType<typeof openVideo>> | null = null;
    try {
      setStep("analyse");
      setCarried(null);
      // Zone markers to carry over (live set, or the last version with
      // markers). Fetched first: if this fails nothing is processed, so a
      // draft without the markers is never created.
      const source = unwrap(await markerSource(athleteId)).ref;
      // The AI model (first time ~100 MB) downloads while the turn is measured.
      let modelShare = 0;
      const model = prepareBackgroundRemover((f) => {
        modelShare = f;
      });
      model.catch(() => {}); // awaited below
      try {
        vid = await openVideo(file);
      } catch {
        throw new Error(m.vid_err_read);
      }
      if (vid.duration > maxDurationSec) throw new Error(fmt(m.vid_err_long, { s: maxDurationSec }));
      let times = await pickTimes(vid.video, count, (f) => setProgress(f));
      // Keep frame 1 (facing the camera), turn the other way round.
      if (reverse) times = [times[0], ...times.slice(1).reverse()];

      setStep("model");
      setProgress(modelShare);
      const ready = prepareBackgroundRemover((f) => setProgress(f));
      await ready;

      setStep("cutout");
      setProgress(0);
      const cutouts: Blob[] = [];
      const feet: (Foot | null)[] = [];
      for (let i = 0; i < times.length; i++) {
        const cut = await preparePhoto(await grabFrame(vid.video, times[i]), true);
        cutouts.push(cut);
        feet.push(await measureBlob(cut));
        setProgress((i + 1) / times.length);
      }
      vid.close();
      vid = null;

      setStep("fit");
      setProgress(0);
      const blobs = await fitVideoFrames(cutouts, feet, (k) => setProgress(k / cutouts.length));
      const meta: FrameMetaMap = {};
      const fitted: (Foot | null)[] = [];
      for (const b of blobs) fitted.push(await measureBlob(b));

      setStep("upload");
      setProgress(0);
      const names = await uploadDraftBlobs(athleteId, blobs, (k) => setProgress(k / blobs.length));
      names.forEach((f, i) => {
        if (fitted[i]) meta[f] = { foot: fitted[i]! };
      });
      // Markers go onto the same side of the new set (Front → Front, …);
      // the admin checks their positions in the draft before publishing.
      const sides = sidesOf(names);
      const carry = source ? carryMarkersBySide(source, sides) : null;
      unwrap(
        await saveDraft(athleteId, {
          frames: names.map((f) => ({ file: f, base: null, origin: null })),
          meta,
          views: sides,
          hotspots: carry?.hotspots ?? [],
          note: "video",
        }),
      );
      setMade(names.length);
      if (carry && source) setCarried({ count: carry.carried, dropped: carry.dropped, version: source.version });
      setStep("done");
      setFile(null);
      router.refresh();
    } catch (e) {
      setError(errorMessage(m, e));
      setStep("error");
    } finally {
      vid?.close();
    }
  }

  const pct = Math.round(progress * 100);
  const label =
    step === "analyse"
      ? fmt(m.vid_analysing, { pct })
      : step === "model"
        ? fmt(m.vid_model, { pct })
        : step === "cutout"
        ? fmt(m.vid_cutting, { done: Math.round(progress * count), total: count })
        : step === "fit"
          ? m.vid_fitting
          : step === "upload"
            ? fmt(m.vid_uploading, { done: Math.round(progress * count), total: count })
            : m.vid_submit;

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          {m.m360_admin}
        </span>
        <h2 className="text-sm font-semibold text-text">{m.vid_title}</h2>
      </div>
      <p className="mt-1 text-xs text-muted">
        {currentFrames > 0 ? fmt(m.vid_current, { n: currentFrames }) : m.m360_none} {fmt(m.vid_hint, { n: count })}
      </p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-faint">
        <li>{m.vid_tip1}</li>
        <li>{m.vid_tip2}</li>
        <li>{m.vid_tip3}</li>
      </ul>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
        <label className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface-2 px-4 py-6 text-center transition-colors hover:border-accent">
          <UploadCloud className="h-6 w-6 text-faint" />
          <span className="text-sm text-text">{file ? file.name : m.vid_pick}</span>
          <span className="text-xs text-faint">{fmt(m.vid_pick_sub, { mb: maxFileMB, s: maxDurationSec })}</span>
          <input
            type="file"
            accept={[...acceptMime, ".mp4", ".mov", ".m4v", ".webm"].join(",")}
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              onPick(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {preview && (
          <video
            src={preview}
            controls
            muted
            playsInline
            loop
            className="mx-auto max-h-72 w-full rounded-lg border border-border bg-black object-contain"
          />
        )}
      </div>

      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-text">
        <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} disabled={busy} className="accent-red-600" />
        {m.vid_reverse}
      </label>
      <p className="text-xs text-faint">{m.vid_reverseHint}</p>

      {error && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
      {step === "done" && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#12b76a]/10 px-3 py-2 text-sm text-[#0f9d63]">
          <Check className="h-4 w-4 shrink-0" />
          <span>
            {fmt(m.vid_done, { n: made })}
            {carried && carried.count.points > 0 && (
              <>
                {" "}
                {fmt(m.vid_markersCarried, { zones: carried.count.zones, points: carried.count.points, v: carried.version })}
                {carried.dropped > 0 && ` ${fmt(m.vid_markersDropped, { n: carried.dropped })}`}
              </>
            )}
          </span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={busy || !file} className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? <RotateCw className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
          {label}
        </button>
        {busy && (
          <div className="h-1.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      {busy && <p className="mt-2 text-xs text-faint">{m.vid_keepOpen}</p>}
    </section>
  );
}
