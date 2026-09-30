"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Check, RotateCw, X } from "lucide-react";
import { SPONSOR_360_UPLOAD } from "@/lib/config";
import { type Dict, fmt, errorMessage } from "@/lib/i18n";
import { unwrap } from "@/lib/action-result";
import { saveDraft } from "@/app/atlet/[id]/media-actions";
import { loadBackgroundRemover, normalizeBlobs, preparePhoto, uploadDraftBlobs } from "@/lib/media360-upload";
import type { FrameMetaMap } from "@/lib/media360";

type Phase = "idle" | "uploading" | "done" | "error";

export function Athlete360Admin({
  athleteId,
  currentFrames,
  isPlaceholder,
  m,
}: {
  athleteId: string;
  currentFrames: number;
  isPlaceholder: boolean;
  m: Dict;
}) {
  const router = useRouter();
  const { minFrames, maxFrames, maxFileMB, acceptMime } = SPONSOR_360_UPLOAD;
  const [files, setFiles] = useState<File[]>([]);
  const [cutout, setCutout] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState(0);
  const [cur, setCur] = useState(0);
  const [fitting, setFitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanding, setExpanding] = useState(false);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  // Split one PDF into a frame per page, rendered in the browser (capped size).
  async function pdfToFiles(file: File): Promise<File[]> {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const cdnImport = new Function("u", "return import(u)") as (u: string) => Promise<Record<string, unknown>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjs = (await cdnImport("https://esm.sh/pdfjs-dist@4/build/pdf.min.mjs")) as any;
    pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    const n = Math.min(pdf.numPages, maxFrames);
    const out: File[] = [];
    for (let p = 1; p <= n; p++) {
      const page = await pdf.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 1600 / Math.max(base.width, base.height)) || 1;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b as Blob), "image/jpeg", 0.9));
      out.push(new File([blob], `page_${String(p).padStart(2, "0")}.jpg`, { type: "image/jpeg" }));
    }
    return out;
  }

  async function onPick(list: FileList | null) {
    setError(null);
    setPhase("idle");
    const arr = Array.from(list || []);
    const pdf = arr.find((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (pdf) {
      setExpanding(true);
      try {
        const frames = await pdfToFiles(pdf);
        if (frames.length === 0) throw new Error("empty");
        setFiles(frames);
      } catch {
        setError(m.m360_err_pdf);
      } finally {
        setExpanding(false);
      }
      return;
    }
    const picked = arr
      .filter((f) => (acceptMime as readonly string[]).includes(f.type))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const tooBig = picked.find((f) => f.size > maxFileMB * 1024 * 1024);
    if (tooBig) {
      setError(fmt(m.m360_err_big, { name: tooBig.name, mb: maxFileMB }));
      return;
    }
    setFiles(picked);
  }

  function removeAt(idx: number) {
    setError(null);
    setPhase("idle");
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  // The new set goes into the DRAFT (private); sponsors keep the published
  // set until "Publish" in the studio below. Nothing is deleted here.
  async function upload() {
    setError(null);
    if (files.length < minFrames || files.length > maxFrames) {
      setError(fmt(m.m360_err_count, { min: minFrames, max: maxFrames }));
      return;
    }
    setPhase("uploading");
    setDone(0);
    setCur(0);
    setFitting(false);
    try {
      if (cutout) {
        try {
          await loadBackgroundRemover();
        } catch {
          throw new Error(m.m360_err_module);
        }
      }
      const prepared: Blob[] = [];
      const meta: FrameMetaMap = {};
      for (let i = 0; i < files.length; i++) {
        setCur(i + 1);
        prepared.push(await preparePhoto(files[i], cutout));
        setDone(i + 1);
      }
      // One canvas size, body height, centre and ground line for the whole
      // set (WebP), like a single replaced photo in the studio.
      setFitting(true);
      setCur(0);
      const { blobs, feet } = await normalizeBlobs(prepared, (k) => setCur(k));
      const names = await uploadDraftBlobs(athleteId, blobs);
      names.forEach((f, i) => {
        if (feet[i]) meta[f] = { foot: feet[i]! };
      });
      unwrap(await saveDraft(athleteId, {
        frames: names.map((file) => ({ file, base: null, origin: null })),
        meta,
        views: null,
        hotspots: [],
        note: "upload",
      }));
      setPhase("done");
      setFiles([]);
      router.refresh();
    } catch (e) {
      setError(errorMessage(m, e));
      setPhase("error");
    }
  }

  const busy = phase === "uploading";
  const currentText =
    currentFrames > 0
      ? fmt(m.m360_current, { n: currentFrames, ph: isPlaceholder ? m.m360_placeholder_suffix : "" })
      : m.m360_none;

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          {m.m360_admin}
        </span>
        <h2 className="text-sm font-semibold text-text">{m.m360_title}</h2>
      </div>
      <p className="mt-1 text-xs text-muted">
        {currentText} {fmt(m.m360_hint, { min: minFrames, max: maxFrames })}
      </p>

      <div className="mt-4">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface-2 px-4 py-6 text-center transition-colors hover:border-accent">
          <UploadCloud className="h-6 w-6 text-faint" />
          <span className="text-sm text-text">{m.m360_pick}</span>
          <span className="text-xs text-faint">{fmt(m.m360_pick_sub, { mb: maxFileMB })}</span>
          <input
            type="file"
            accept={[...acceptMime, "application/pdf"].join(",")}
            multiple
            className="hidden"
            disabled={busy || expanding}
            onChange={(e) => onPick(e.target.files)}
          />
        </label>
        {expanding && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <RotateCw className="h-3 w-3 animate-spin" /> {m.m360_extracting}
          </p>
        )}
      </div>

      {files.length > 0 && (
        <>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className={files.length < minFrames || files.length > maxFrames ? "text-accent" : "text-muted"}>
              {fmt(m.m360_selected, { n: files.length })}
            </span>
            <button onClick={() => setFiles([])} disabled={busy} className="text-faint hover:text-text">
              {m.m360_clear}
            </button>
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-9">
            {previews.map((u, i) => (
              <div key={i} className="group relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`frame ${i + 1}`} className="h-full w-full object-contain" />
                <span className="absolute bottom-0 left-0 bg-black/60 px-1 text-[9px] text-white">{i + 1}</span>
                {!busy && (
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label={m.crt_remove}
                    title={m.crt_remove}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-80 transition hover:bg-accent hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex min-h-11 items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={cutout} onChange={(e) => setCutout(e.target.checked)} className="accent-red-600" />
          {m.m360_cutout}
        </label>
      </div>
      {cutout && <p className="mt-2 text-xs text-faint">{m.m360_cutout_note}</p>}

      {error && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
      {phase === "done" && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#12b76a]/10 px-3 py-2 text-sm text-[#0f9d63]">
          <Check className="h-4 w-4" /> {m.m360_saved}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button onClick={upload} disabled={busy || expanding || files.length === 0} className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? <RotateCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {busy ? fmt(fitting ? m.m360_fitting : cutout ? m.m360_processing : m.m360_uploading, { done: cur, total: files.length }) : m.m360_submit}
        </button>
        {busy && (
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${files.length ? (done / files.length) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>
      {busy && cutout && <p className="mt-2 text-xs text-faint">{m.m360_first_slow}</p>}
    </section>
  );
}
