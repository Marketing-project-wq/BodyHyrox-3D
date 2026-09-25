"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Check, RotateCw } from "lucide-react";
import { SPONSOR_360_UPLOAD } from "@/lib/config";
import { issueUpload, finalizeMedia } from "@/app/atlet/[id]/media-actions";

type Phase = "idle" | "uploading" | "done" | "error";

export function Athlete360Admin({
  athleteId,
  currentFrames,
  isPlaceholder,
  initialAutospin = true,
  initialCrossfade = false,
}: {
  athleteId: string;
  currentFrames: number;
  isPlaceholder: boolean;
  initialAutospin?: boolean;
  initialCrossfade?: boolean;
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
      setError(`File "${tooBig.name}" melebihi ${maxFileMB} MB.`);
      return;
    }
    setFiles(picked);
  }

  async function upload() {
    setError(null);
    if (files.length < minFrames || files.length > maxFrames) {
      setError(`Pilih ${minFrames}–${maxFrames} foto (berurutan sesuai putaran).`);
      return;
    }
    setPhase("uploading");
    setDone(0);
    try {
      // When cutout is on, the background is removed IN THE BROWSER (WASM) before
      // upload, so each frame becomes a transparent PNG. The library is loaded from
      // a CDN at runtime (webpackIgnore) — it doesn't bundle cleanly under webpack
      // and this keeps it out of the app bundle; its model is fetched on first use.
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
          throw new Error(
            "Gagal memuat modul hapus-background. Matikan opsi 'Hapus background otomatis' lalu unggah foto PNG transparan, atau coba lagi.",
          );
        }
      }

      // Frame extension follows the uploaded bytes: png when cut, else original.
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
        if (!res.ok) throw new Error(`Upload gagal (HTTP ${res.status}) pada frame ${i + 1}.`);
        setDone(i + 1);
      }
      await finalizeMedia(athleteId, slots.map((s) => s.frame), autospin, crossfade);
      setPhase("done");
      setFiles([]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunggah.");
      setPhase("error");
    }
  }

  const busy = phase === "uploading";

  return (
    <div className="rounded-2xl border border-[#ff3b57]/25 bg-[#ff3b57]/[0.04] p-5">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-[#ff3b57]/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#ff8a9c]">
          Admin
        </span>
        <h2 className="font-condensed text-lg font-bold uppercase">Kelola foto 360°</h2>
      </div>
      <p className="mt-1 text-xs text-white/50">
        {currentFrames > 0
          ? `Saat ini ${currentFrames} frame${isPlaceholder ? " (placeholder)" : ""}.`
          : "Belum ada foto 360°."}{" "}
        Unggah {minFrames}–{maxFrames} foto berputar (urut sesuai nama file). Background dihapus otomatis (bisa
        dimatikan di bawah). Set baru akan langsung menggantikan tampilan yang dilihat sponsor.
      </p>

      <div className="mt-4">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-6 text-center hover:border-[#ff3b57]/50">
          <UploadCloud className="h-6 w-6 text-white/50" />
          <span className="text-sm text-white/70">Pilih foto (bisa banyak sekaligus)</span>
          <span className="text-xs text-white/40">JPG / PNG / WEBP · maks {maxFileMB} MB/foto</span>
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
            <span className={files.length < minFrames || files.length > maxFrames ? "text-[#ff8a9c]" : "text-white/60"}>
              {files.length} foto dipilih
            </span>
            <button onClick={() => setFiles([])} disabled={busy} className="text-white/40 hover:text-white">
              Bersihkan
            </button>
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-9">
            {previews.map((u, i) => (
              <div key={i} className="relative aspect-[3/4] overflow-hidden rounded-md border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`frame ${i + 1}`} className="h-full w-full object-cover" />
                <span className="absolute bottom-0 left-0 bg-black/60 px-1 text-[9px] text-white/80">{i + 1}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={cutout} onChange={(e) => setCutout(e.target.checked)} className="accent-[#ff3b57]" />
          Hapus background otomatis (transparan)
        </label>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={autospin} onChange={(e) => setAutospin(e.target.checked)} className="accent-[#ff3b57]" />
          Putar otomatis
        </label>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={crossfade} onChange={(e) => setCrossfade(e.target.checked)} className="accent-[#ff3b57]" />
          Transisi halus (crossfade)
        </label>
      </div>
      {cutout && (
        <p className="mt-2 text-xs text-white/40">
          Background dihapus otomatis di browser sebelum diunggah (butuh koneksi; unduh model sekali di awal, proses tiap
          frame perlu beberapa detik). Matikan bila fotomu sudah transparan/di-cutout dari luar.
        </p>
      )}

      {error && <p className="mt-3 rounded-lg bg-[#ff3b57]/15 px-3 py-2 text-sm text-[#ff8a9c]">{error}</p>}
      {phase === "done" && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#12b76a]/15 px-3 py-2 text-sm text-[#6ee7b7]">
          <Check className="h-4 w-4" /> Tersimpan. Preview di atas sudah diperbarui.
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={upload}
          disabled={busy || files.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-[#ff3b57] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e42e48] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <RotateCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {busy ? `${cutout ? "Memproses" : "Mengunggah"} ${done}/${files.length}…` : "Unggah & simpan"}
        </button>
        {busy && (
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#ff3b57] transition-all"
              style={{ width: `${files.length ? (done / files.length) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
