"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Eye, Film, ImageIcon, RotateCw, Trash2, UploadCloud, X } from "lucide-react";
import { MEDIA_SOURCES } from "@/lib/config";
import { type Dict, errorMessage, fmt } from "@/lib/i18n";
import { unwrap } from "@/lib/action-result";
import { deleteSource, issueSourceUploads, listSources, recordSources, signSource } from "@/app/atlet/[id]/source-actions";
import { formatBytes, formatDuration, prepareSources, putSigned, type SourceItem } from "@/lib/media-sources";
import { TurnSetMaker } from "@/components/admin360/TurnSetMaker";

type Busy = { step: "prepare" | "upload"; done: number; total: number } | null;

/**
 * "Bahan 360" (admin, every athlete): upload the original photos and videos,
 * see everything uploaded so far, view / play one, delete one. Files go
 * straight from the browser to a private bucket; the list lives in the DB.
 */
export function MediaSources({ athleteId, m, onChange }: { athleteId: string; m: Dict; onChange?: (items: SourceItem[]) => void }) {
  const [items, setItems] = useState<SourceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  const [viewing, setViewing] = useState<{ item: SourceItem; url: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = unwrap(await listSources(athleteId));
      setItems(r.items);
      onChange?.(r.items);
    } catch (e) {
      setItems([]);
      setError(errorMessage(m, e));
    }
  }, [athleteId, m, onChange]);

  useEffect(() => {
    load();
  }, [load]);

  // Leaving mid-upload would lose the files that haven't gone up yet.
  useEffect(() => {
    if (!busy) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [busy]);

  async function onPick(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, MEDIA_SOURCES.maxBatch);
    if (!files.length) return;
    setError(null);
    setNotes([]);
    setAdded(0);
    try {
      setBusy({ step: "prepare", done: 0, total: files.length });
      const ok: Awaited<ReturnType<typeof prepareSources>>["ok"] = [];
      const refused: Awaited<ReturnType<typeof prepareSources>>["refused"] = [];
      for (let i = 0; i < files.length; i++) {
        const r = await prepareSources([files[i]]);
        ok.push(...r.ok);
        refused.push(...r.refused);
        setBusy({ step: "prepare", done: i + 1, total: files.length });
      }
      setNotes(
        refused.map((r) =>
          r.reason === "type"
            ? fmt(m.src_refused_type, { name: r.name })
            : r.reason === "big"
              ? fmt(m.src_refused_big, { name: r.name })
              : fmt(m.src_refused_long, { name: r.name, s: MEDIA_SOURCES.maxVideoSec }),
        ),
      );
      if (!ok.length) return;
      const { slots } = unwrap(
        await issueSourceUploads(
          athleteId,
          ok.map((p) => ({ mime: p.mime, size: p.file.size, thumb: !!p.thumb })),
        ),
      );
      setBusy({ step: "upload", done: 0, total: ok.length });
      const done: Parameters<typeof recordSources>[1] = [];
      for (let i = 0; i < ok.length; i++) {
        const p = ok[i];
        const s = slots[i];
        if (!(await putSigned(s.uploadUrl, p.file, p.mime))) throw new Error(m.err_upload_failed);
        let thumb: string | null = null;
        if (p.thumb && s.thumb && s.thumbUploadUrl && (await putSigned(s.thumbUploadUrl, p.thumb, "image/webp"))) thumb = s.thumb;
        done.push({
          file: s.file,
          thumb,
          originalName: p.file.name,
          mime: p.mime,
          size: p.file.size,
          width: p.width,
          height: p.height,
          durationSec: p.durationSec,
        });
        setBusy({ step: "upload", done: i + 1, total: ok.length });
      }
      unwrap(await recordSources(athleteId, done));
      setAdded(done.length);
      await load();
    } catch (e) {
      setError(errorMessage(m, e));
    } finally {
      setBusy(null);
    }
  }

  async function view(item: SourceItem) {
    setError(null);
    try {
      const { url } = unwrap(await signSource(athleteId, item.id));
      setViewing({ item, url });
    } catch (e) {
      setError(errorMessage(m, e));
    }
  }

  async function remove(item: SourceItem) {
    if (!window.confirm(fmt(m.src_deleteConfirm, { name: item.originalName || item.id }))) return;
    setError(null);
    setDeleting(item.id);
    try {
      unwrap(await deleteSource(athleteId, item.id));
      await load();
    } catch (e) {
      setError(errorMessage(m, e));
    } finally {
      setDeleting(null);
    }
  }

  // Close the viewer with Escape.
  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  const photos = items?.filter((i) => i.kind === "photo").length ?? 0;
  const videos = items?.filter((i) => i.kind === "video").length ?? 0;
  const accept = [...MEDIA_SOURCES.photoMime, ...MEDIA_SOURCES.videoMime, ".heic", ".heif", ".mov", ".m4v"].join(",");

  return (
    <section className="card p-4" aria-labelledby="src-title">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{m.m360_admin}</span>
        <h2 id="src-title" className="text-sm font-semibold text-text">
          {m.src_title}
        </h2>
        {items && items.length > 0 && <span className="text-xs text-faint">{fmt(m.src_count, { photos, videos })}</span>}
      </div>
      <p className="mt-1 text-xs text-muted">{m.src_hint}</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-faint">
        <li>{m.src_tip1}</li>
        <li>{m.src_tip2}</li>
      </ul>

      <label
        className={`mt-4 flex min-h-11 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface-2 px-4 py-6 text-center transition-colors hover:border-accent ${busy ? "pointer-events-none opacity-60" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy) onPick(e.dataTransfer.files);
        }}
      >
        <UploadCloud className="h-6 w-6 text-faint" aria-hidden />
        <span className="text-sm text-text">{m.src_pick}</span>
        <span className="text-xs text-faint">
          {fmt(m.src_pick_sub, { pmb: MEDIA_SOURCES.maxPhotoMB, vmb: MEDIA_SOURCES.maxVideoMB, s: MEDIA_SOURCES.maxVideoSec, n: MEDIA_SOURCES.maxBatch })}
        </span>
        <input
          type="file"
          multiple
          accept={accept}
          className="sr-only"
          disabled={!!busy}
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {busy && (
        <div className="mt-3 flex flex-wrap items-center gap-3" role="status">
          <RotateCw className="h-4 w-4 animate-spin text-muted" aria-hidden />
          <span className="text-sm text-text">
            {fmt(busy.step === "prepare" ? m.src_preparing : m.src_uploading, { done: busy.done, total: busy.total })}
          </span>
          <div className="h-1.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round((busy.done / Math.max(1, busy.total)) * 100)}%` }} />
          </div>
          <p className="w-full text-xs text-faint">{m.vid_keepOpen}</p>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
      {notes.length > 0 && (
        <ul className="mt-3 space-y-0.5 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {added > 0 && !busy && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#12b76a]/10 px-3 py-2 text-sm text-[#0f9d63]">
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          {fmt(m.src_added, { n: added })}
        </p>
      )}

      <div className="mt-4">
        {items === null ? (
          <p className="text-xs text-faint">{m.src_loading}</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-faint">{m.src_empty}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {items.map((it) => (
              <li key={it.id} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-2">
                <button
                  type="button"
                  onClick={() => view(it)}
                  className="relative flex aspect-[3/4] w-full items-center justify-center bg-black/80"
                  aria-label={`${m.src_view}: ${it.originalName}`}
                >
                  {it.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.thumbUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
                  ) : (
                    <span className="px-2 text-center text-xs text-faint">{m.src_noPreview}</span>
                  )}
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {it.kind === "video" ? <Film className="h-3 w-3" aria-hidden /> : <ImageIcon className="h-3 w-3" aria-hidden />}
                    {it.kind === "video" ? m.src_video : m.src_photo}
                    {it.kind === "video" && it.durationSec != null && ` · ${formatDuration(it.durationSec)}`}
                  </span>
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-2">
                  <span className="truncate text-xs font-medium text-text" title={it.originalName}>
                    {it.originalName || "—"}
                  </span>
                  <span className="text-[11px] text-faint">
                    {[it.width && it.height ? `${it.width}×${it.height}` : null, formatBytes(it.sizeBytes)].filter(Boolean).join(" · ")}
                  </span>
                  <span className="truncate text-[11px] text-faint">
                    {fmt(m.src_meta, { date: new Date(it.createdAt).toLocaleString(), by: it.uploadedByName ?? "—" })}
                  </span>
                  <div className="mt-1 flex gap-1">
                    <button type="button" onClick={() => view(it)} className="btn btn-ghost min-h-11 flex-1 px-2 text-xs">
                      <Eye className="h-4 w-4" aria-hidden />
                      {m.src_view}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(it)}
                      disabled={deleting === it.id || !!busy}
                      className="btn btn-ghost min-h-11 min-w-11 px-2 text-xs text-accent disabled:opacity-50"
                      aria-label={`${m.src_delete}: ${it.originalName}`}
                    >
                      {deleting === it.id ? <RotateCw className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {items && <TurnSetMaker athleteId={athleteId} items={items} m={m} />}

      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={viewing.item.originalName}
          onClick={() => setViewing(null)}
        >
          <div className="relative flex max-h-full w-full max-w-3xl flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setViewing(null)}
              className="absolute right-0 top-0 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white"
              aria-label={m.src_close}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            {viewing.item.kind === "video" ? (
              <video src={viewing.url} controls playsInline muted className="max-h-[85dvh] w-full rounded-lg bg-black object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewing.url} alt={viewing.item.originalName} className="max-h-[85dvh] w-auto max-w-full rounded-lg object-contain" />
            )}
            <p className="mt-2 max-w-full truncate text-sm text-white">{viewing.item.originalName}</p>
          </div>
        </div>
      )}
    </section>
  );
}
