"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Check, RotateCw } from "lucide-react";
import { SPONSOR_360_UPLOAD } from "@/lib/config";
import { type Dict, fmt } from "@/lib/i18n";
import { issueUpload, finalizeMedia } from "@/app/atlet/[id]/media-actions";

type Phase = "idle" | "uploading" | "done" | "error";

export function Athlete360Admin({
  athleteId,
  currentFrames,
  isPlaceholder,
  initialAutospin = true,
  initialCrossfade = false,
  m,
}: {
  athleteId: string;
  currentFrames: number;
  isPlaceholder: boolean;
  initialAutospin?: boolean;
  initialCrossfade?: boolean;
  m: Dict;
}) {
  const router = useRouter();
  const { minFrames, maxFrames, maxFileMB, acceptMime } = SPONSOR_360_UPLOAD;
  const [files, setFiles] = useState<File[]>([]);
  const [autospin, setAutospin] = useState(initialAutospin);
  const [crossfade, setCrossfade] = useState(initialCrossfade);
  const [cutout, setCutout] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function onPick(list: FileList | null) {
    setError(null);
    setPhase("idle");
    const picked = Array.from(list || [])
      .filter((f) => (acceptMime as readonly string[]).includes(f.type))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const tooBig = picked.find((f) => f.size > maxFileMB * 1024 * 1024);
    if (tooBig) {
      setError(fmt(m.m360_err_big, { name: tooBig.name, mb: maxFileMB }));
      return;
    }
    setFiles(picked);
  }

  async function upload() {
    setError(null);
    if (files.length < minFrames || files.length > maxFrames) {
      setError(fmt(m.m360_err_count, { min: minFrames, max: maxFrames }));
      return;
    }
    setPhase("uploading");
    setDone(0);
    try {
      let removeBackground: ((input: Blob) => Promise<Blob>) | null = null;
      if (cutout) {
        try {
          // Runtime import that neither webpack nor TS resolves statically, so the
          // CDN ESM loads in the browser and never enters the app bundle.
          // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
          const cdnImport = new Function("u", "return import(u)") as (
            u: string,
          ) => Promise<{ removeBackground: (i: Blob) => Promise<Blob> }>;
          const mod = await cdnImport("https://esm.sh/@imgly/background-removal@1");
          removeBackground = mod.removeBackground;
        } catch {
          throw new Error(m.m360_err_module);
        }
      }

      const names = files.map((f) => (cutout ? f.name.replace(/\.[^.]+$/, "") + ".png" : f.name));
      const slots = await issueUpload(athleteId, names);

      for (let i = 0; i < files.length; i++) {
        let body: Blob = files[i];
        let contentType = files[i].type || "application/octet-stream";
        if (removeBackground) {
          body = await removeBackground(files[i]); // transparent PNG
          contentType = "image/png";
        }
        const res = await fetch(slots[i].uploadUrl, {
          method: "PUT",
          headers: { "content-type": contentType, "x-upsert": "true" },
          body,
        });
        if (!res.ok) throw new Error(fmt(m.m360_err_upload, { status: res.status, i: i + 1 }));
        setDone(i + 1);
      }
      await finalizeMedia(athleteId, slots.map((s) => s.frame), autospin, crossfade);
      setPhase("done");
      setFiles([]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : m.m360_err_generic);
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
        <span className="badge bg-accent-soft text-accent">{m.m360_admin}</span>
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
            accept={acceptMime.join(",")}
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => onPick(e.target.files)}
          />
        </label>
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
              <div key={i} className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`frame ${i + 1}`} className="h-full w-full object-contain" />
                <span className="absolute bottom-0 left-0 bg-black/60 px-1 text-[9px] text-white">{i + 1}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={cutout} onChange={(e) => setCutout(e.target.checked)} className="accent-red-600" />
          {m.m360_cutout}
        </label>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={autospin} onChange={(e) => setAutospin(e.target.checked)} className="accent-red-600" />
          {m.m360_autospin}
        </label>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={crossfade} onChange={(e) => setCrossfade(e.target.checked)} className="accent-red-600" />
          {m.m360_crossfade}
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
        <button onClick={upload} disabled={busy || files.length === 0} className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? <RotateCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {busy ? fmt(cutout ? m.m360_processing : m.m360_uploading, { done, total: files.length }) : m.m360_submit}
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
    </section>
  );
}
