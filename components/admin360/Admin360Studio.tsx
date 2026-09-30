"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  MoreHorizontal,
  Plus,
  Replace,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  Undo2,
  UploadCloud,
  X,
  ZoomIn,
} from "lucide-react";
import { SPONSOR_360_UPLOAD } from "@/lib/config";
import { VIEW_KEYS, type Media360Views, type HotspotInput, type ViewKey } from "@/lib/views";
import { type Dict, errorMessage, fmt } from "@/lib/i18n";
import { unwrap } from "@/lib/action-result";
import {
  footIsCurrent,
  isIdentity,
  loadImage,
  measureFrame,
  normalizeToSet,
  setReference,
  type DraftFrame,
  type Foot,
  type FrameMetaMap,
  type FrameTransform,
  type Media360Draft,
} from "@/lib/media360";
import { loadBackgroundRemover, measureBlob, preparePhoto, uploadDraftBlobs } from "@/lib/media360-upload";
import { discardDraft, publishDraft, restoreVersion, saveDraft, signDraftFiles } from "@/app/atlet/[id]/media-actions";
import type { Media360VersionRow } from "@/lib/data";
import { FrameStage } from "./FrameStage";
import { draftHotspotsByFile } from "@/lib/media360-sides";
import { FrameEditor, type EditorFrame } from "./FrameEditor";
import { Flipbook } from "./Flipbook";

type Live = {
  baseUrl: string;
  frames: string[];
  frameMeta: FrameMetaMap;
  views: Media360Views | null;
  viewsSaved: boolean;
  hotspots: HotspotInput[];
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Admin 360 studio: every uploaded frame in order, big preview, per-frame
 * replace (with backup + restore), insert / delete / reorder, a
 * non-destructive alignment editor and a flipbook. All edits go to a draft
 * (autosaved); sponsors only see them after Publish.
 */
export function Admin360Studio({
  athleteId,
  live,
  initialDraft,
  initialUrls,
  version,
  publishedAt,
  history,
  m,
}: {
  athleteId: string;
  live: Live;
  initialDraft: Media360Draft | null;
  initialUrls: Record<string, string>;
  version: number;
  publishedAt: string | null;
  history: Media360VersionRow[];
  m: Dict;
}) {
  const router = useRouter();
  const { minFrames, maxFrames, maxFileMB, acceptMime } = SPONSOR_360_UPLOAD;
  const [draft, setDraft] = useState<Media360Draft | null>(initialDraft);
  const [urls, setUrls] = useState<Record<string, string>>(initialUrls);
  const [feet, setFeet] = useState<Record<string, Foot | null>>({});
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 476, h: 1120 });
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "error"; at?: string }>({
    state: initialDraft ? "saved" : "idle",
    at: initialDraft?.updatedAt,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [showFlip, setShowFlip] = useState(false);
  const [cutout, setCutout] = useState(true);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  // Touch screens: a tile's actions open as a list of 44px rows (see tileActions).
  const [actionsFor, setActionsFor] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingPick = useRef<{ mode: "replace" | "insert"; index: number } | null>(null);

  const liveFrames: DraftFrame[] = useMemo(
    () => live.frames.map((file) => ({ file, base: live.baseUrl.replace(/\/$/, ""), origin: file })),
    [live.frames, live.baseUrl],
  );
  const frames = draft?.frames ?? liveFrames;
  const meta = draft?.meta ?? live.frameMeta;
  const n = frames.length;
  const countOk = n >= minFrames && n <= maxFrames;

  const srcOf = useCallback(
    (f: { file: string; base: string | null }) => (f.base === null ? urls[f.file] : `${f.base}/${f.file}`),
    [urls],
  );
  // Stored feet when current (two-contact rules or placed by hand), else the
  // fresh measurement.
  const footOf = useCallback(
    (file: string) => (footIsCurrent(meta[file]?.foot) ? meta[file]!.foot! : feet[file] ?? meta[file]?.foot ?? null),
    [meta, feet],
  );

  // ---- measure feet / head / centre of every frame (for guides, auto-align,
  //      fitting replacements and the stored metadata) ----
  const measuring = useRef(new Set<string>());
  const feetRef = useRef(feet);
  feetRef.current = feet;
  const measureAll = useCallback(
    async (list: { file: string; base: string | null }[]) => {
      for (const f of list) {
        if (feetRef.current[f.file] !== undefined || measuring.current.has(f.file)) continue;
        const src = srcOf(f);
        if (!src) continue;
        measuring.current.add(f.file);
        try {
          const img = await loadImage(src);
          const foot = measureFrame(img);
          setDims((d) => (d.w === img.naturalWidth && d.h === img.naturalHeight ? d : { w: img.naturalWidth, h: img.naturalHeight }));
          setFeet((prev) => ({ ...prev, [f.file]: foot }));
        } catch {
          setFeet((prev) => ({ ...prev, [f.file]: null }));
        } finally {
          measuring.current.delete(f.file);
        }
      }
    },
    [srcOf],
  );
  useEffect(() => {
    measureAll(frames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames.map((f) => f.file).join("|"), urls]);

  // ---- draft + autosave ----
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Media360Draft | null>(draft);
  const withFeet = useCallback(
    (d: Media360Draft): Media360Draft => {
      const out = clone(d);
      for (const f of out.frames) {
        const ft = feet[f.file];
        if (!footIsCurrent(out.meta[f.file]?.foot) && ft) out.meta[f.file] = { ...(out.meta[f.file] ?? {}), foot: ft };
      }
      return out;
    },
    [feet],
  );
  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const d = latest.current;
    if (!d) return;
    setSave({ state: "saving" });
    try {
      const r = unwrap(await saveDraft(athleteId, withFeet(d)));
      setSave({ state: "saved", at: r.updatedAt });
    } catch (e) {
      setSave({ state: "error" });
      setError(errorMessage(m, e));
      throw e;
    }
  }, [athleteId, withFeet]);
  const mutate = useCallback(
    (fn: (d: Media360Draft) => void) => {
      setError(null);
      setNotice(null);
      const base: Media360Draft = latest.current ? clone(latest.current) : { frames: clone(liveFrames), meta: clone(live.frameMeta) };
      fn(base);
      latest.current = base;
      setDraft(base);
      setSave({ state: "saving" });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        flush().catch(() => {});
      }, 700);
    },
    [flush, liveFrames, live.frameMeta],
  );
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (saveTimer.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // ---- which side / markers each slot carries ----
  const viewOf = (f: DraftFrame): ViewKey[] => {
    if (draft && draft.views !== undefined) {
      return draft.views ? VIEW_KEYS.filter((k) => draft.views![k] === f.file) : [];
    }
    if (!live.viewsSaved || !live.views || !f.origin) return [];
    return VIEW_KEYS.filter((k) => live.views![k] === f.origin);
  };
  const markersOf = (f: DraftFrame): number => {
    if (draft && draft.hotspots !== undefined) {
      // Draft markers are keyed by frame file (lib/media360-sides).
      return draftHotspotsByFile(draft.hotspots, draft.frames.map((d) => d.file)).filter((h) => h.points[f.file]).length;
    }
    if (!f.origin) return 0;
    const no = String(live.frames.indexOf(f.origin) + 1);
    return live.hotspots.filter((h) => h.points[no]).length;
  };
  const viewNames: Record<ViewKey, string> = { front: m.view_front, right: m.view_right, back: m.view_back, left: m.view_left };
  const lostViews = useMemo(() => {
    if (!draft || draft.views !== undefined || !live.viewsSaved || !live.views) return [];
    return VIEW_KEYS.filter((k) => !draft.frames.some((f) => f.origin === live.views![k]));
  }, [draft, live.views, live.viewsSaved]);

  // Sides chosen in the draft whose frame was removed since: publish refuses
  // them (never drops the sides silently), so ask to pick them again first.
  const draftLostViews = useMemo(() => {
    if (!draft || !draft.views) return [];
    return VIEW_KEYS.filter((k) => !draft.frames.some((f) => f.file === draft.views![k]));
  }, [draft]);

  // Zone markers that sit on a published frame no longer in the draft.
  const lostMarkers = useMemo(() => {
    if (!draft || draft.hotspots !== undefined) return [];
    const kept = new Set(draft.frames.map((f) => f.origin).filter(Boolean));
    const out: string[] = [];
    for (const h of live.hotspots) {
      for (const k of Object.keys(h.points)) {
        const src = live.frames[Number(k) - 1];
        if (src && !kept.has(src)) out.push(`${h.label || "?"} (${fmt(m.st_frameOf, { n: k, total: live.frames.length })})`);
      }
    }
    return out;
  }, [draft, live.hotspots, live.frames, m]);

  // ---- replace / insert (one photo) ----
  const pick = (mode: "replace" | "insert", index: number) => {
    pendingPick.current = { mode, index };
    fileInput.current?.click();
  };
  const onFile = async (list: FileList | null) => {
    const file = list?.[0];
    const p = pendingPick.current;
    if (fileInput.current) fileInput.current.value = "";
    if (!file || !p) return;
    if (!(acceptMime as readonly string[]).includes(file.type)) return setError(m.st_errType);
    if (file.size > maxFileMB * 1024 * 1024) return setError(fmt(m.m360_err_big, { name: file.name, mb: maxFileMB }));
    if (p.mode === "insert" && n >= maxFrames) return setError(fmt(m.m360_err_count, { min: minFrames, max: maxFrames }));
    setError(null);
    try {
      if (cutout) {
        setBusy(m.st_busyModel);
        await loadBackgroundRemover().catch(() => {
          throw new Error(m.m360_err_module);
        });
      }
      setBusy(cutout ? m.st_busyCutout : m.st_busyPrepare);
      const cut = await preparePhoto(file, cutout);
      const others = frames.filter((_, i) => p.mode === "insert" || i !== p.index).map((f) => footOf(f.file));
      const norm = await normalizeToSet(cut, dims.w, dims.h, setReference(others));
      const foot = await measureBlob(norm);
      setBusy(m.st_busyUpload);
      const [name] = await uploadDraftBlobs(athleteId, [norm]);
      const signed = unwrap(await signDraftFiles(athleteId, [name])).urls;
      setUrls((u) => ({ ...u, ...signed }));
      if (foot) setFeet((prev) => ({ ...prev, [name]: foot }));
      mutate((d) => {
        if (p.mode === "replace") {
          const old = d.frames[p.index];
          d.frames[p.index] = { file: name, base: null, origin: old.origin };
          d.meta[name] = { ...(foot ? { foot } : {}), prev: [...(d.meta[old.file]?.prev ?? []), { file: old.file, base: old.base }] };
        } else {
          d.frames.splice(p.index, 0, { file: name, base: null, origin: null });
          d.meta[name] = foot ? { foot } : {};
        }
      });
      setNotice(p.mode === "replace" ? fmt(m.st_replaced, { n: p.index + 1 }) : fmt(m.st_inserted, { n: p.index + 1 }));
    } catch (e) {
      setError(errorMessage(m, e));
    } finally {
      setBusy(null);
    }
  };

  const restoreAt = async (i: number) => {
    const cur = frames[i];
    const prevList = meta[cur.file]?.prev ?? [];
    const last = prevList[prevList.length - 1];
    if (!last) return;
    if (last.base === null && !urls[last.file]) {
      const signed = await signDraftFiles(athleteId, [last.file])
        .then((r) => (r.ok ? r.urls : {}))
        .catch(() => ({}));
      setUrls((u) => ({ ...u, ...signed }));
    }
    mutate((d) => {
      const rest = prevList.slice(0, -1);
      d.frames[i] = { file: last.file, base: last.base, origin: cur.origin };
      d.meta[last.file] = { ...(d.meta[last.file] ?? {}), prev: rest };
    });
    setNotice(fmt(m.st_restored, { n: i + 1 }));
  };

  const deleteAt = (i: number) => {
    const f = frames[i];
    const warn = viewOf(f).length || markersOf(f) ? `\n\n${m.st_deleteWarn}` : "";
    if (!window.confirm(fmt(m.st_deleteConfirm, { n: i + 1 }) + warn)) return;
    // "Add photo" next to a frame and then deleting that frame is really a
    // replace: hand the deleted slot's sides / zone markers to the new photo
    // (and keep the old one as its backup) instead of dropping them.
    const heir = f.origin
      ? [i - 1, i + 1].filter((j) => j >= 0 && j < n && frames[j].origin === null && frames[j].base === null)
      : [];
    mutate((d) => {
      d.frames.splice(i, 1);
      if (heir.length === 1) {
        const j = heir[0] > i ? heir[0] - 1 : heir[0];
        const nf = d.frames[j];
        nf.origin = f.origin;
        d.meta[nf.file] = { ...(d.meta[nf.file] ?? {}), prev: [...(d.meta[f.file]?.prev ?? []), { file: f.file, base: f.base }] };
      }
    });
    if (heir.length === 1) setNotice(fmt(m.st_relinked, { n: (heir[0] > i ? heir[0] - 1 : heir[0]) + 1 }));
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= n || from === to) return;
    mutate((d) => {
      const [x] = d.frames.splice(from, 1);
      d.frames.splice(to, 0, x);
    });
  };
  const setTransform = useCallback(
    (file: string, t: FrameTransform) => {
      mutate((d) => {
        const cur = d.meta[file] ?? {};
        if (isIdentity(t)) delete cur.t;
        else cur.t = t;
        d.meta[file] = cur;
      });
    },
    [mutate],
  );
  // Contact points placed by hand (null = back to automatic detection).
  const setFoot = useCallback(
    (file: string, foot: Foot | null) => {
      mutate((d) => {
        const cur = d.meta[file] ?? {};
        if (foot) cur.foot = foot;
        else if (feetRef.current[file]) cur.foot = feetRef.current[file]!;
        else delete cur.foot;
        d.meta[file] = cur;
      });
    },
    [mutate],
  );

  // ---- publish / discard / versions ----
  const publish = async () => {
    if (!countOk) return setError(fmt(m.m360_err_count, { min: minFrames, max: maxFrames }));
    const missing = frames.filter((f) => !footOf(f.file));
    if (missing.length && !window.confirm(fmt(m.st_publishNoFeet, { n: missing.length }))) return;
    const lost = lostViews.length ? `\n\n${fmt(m.st_lostViews, { views: lostViews.map((k) => viewNames[k]).join(", ") })}` : "";
    const lostM = lostMarkers.length ? `\n\n${fmt(m.st_lostMarkers, { n: lostMarkers.length, zones: lostMarkers.join(", ") })}` : "";
    if (!window.confirm(m.st_publishConfirm + lost + lostM)) return;
    setBusy(m.st_busyPublish);
    setError(null);
    try {
      if (!latest.current) latest.current = { frames: clone(liveFrames), meta: clone(live.frameMeta) };
      await flush();
      const r = unwrap(await publishDraft(athleteId));
      latest.current = null;
      setDraft(null);
      setSave({ state: "idle" });
      setNotice(fmt(m.st_published, { v: r.version }));
      router.refresh();
    } catch (e) {
      setError(errorMessage(m, e));
    } finally {
      setBusy(null);
    }
  };
  const discard = async () => {
    if (!window.confirm(m.st_discardConfirm)) return;
    setBusy(m.st_busyDiscard);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      unwrap(await discardDraft(athleteId));
      latest.current = null;
      setDraft(null);
      setSave({ state: "idle" });
      router.refresh();
    } catch (e) {
      setError(errorMessage(m, e));
    } finally {
      setBusy(null);
    }
  };
  const restore = async (v: number) => {
    if (draft && !window.confirm(m.st_restoreOverDraft)) return;
    setBusy(m.st_busyRestore);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      unwrap(await restoreVersion(athleteId, v));
      router.refresh();
    } catch (e) {
      setError(errorMessage(m, e));
    } finally {
      setBusy(null);
    }
  };

  const editorFrames: EditorFrame[] = frames.map((f) => ({
    file: f.file,
    src: srcOf(f),
    foot: footOf(f.file),
    autoFoot: feet[f.file] ?? null,
    t: meta[f.file]?.t,
  }));
  const aspect = dims.w / dims.h;
  const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");


  // A gallery tile's actions: rendered as icon buttons (mouse) or as a touch list.
  const tileActions = (i: number, hasPrev: boolean) => [
    { key: "edit", label: m.st_edit, icon: <SlidersHorizontal className="h-3.5 w-3.5" />, run: () => setEditing(i), disabled: !!busy },
    { key: "replace", label: m.st_replace, icon: <Replace className="h-3.5 w-3.5" />, run: () => pick("replace", i), disabled: !!busy },
    { key: "restore", label: m.st_restore, icon: <Undo2 className="h-3.5 w-3.5" />, run: () => restoreAt(i), disabled: !!busy || !hasPrev },
    { key: "delete", label: m.st_delete, icon: <Trash2 className="h-3.5 w-3.5" />, run: () => deleteAt(i), disabled: !!busy || n <= minFrames },
    { key: "up", label: m.st_moveUp, icon: <ArrowUp className="h-3.5 w-3.5" />, run: () => move(i, i - 1), disabled: !!busy || i === 0 },
    { key: "down", label: m.st_moveDown, icon: <ArrowDown className="h-3.5 w-3.5" />, run: () => move(i, i + 1), disabled: !!busy || i === n - 1 },
    {
      key: "before",
      label: m.st_insertBefore,
      icon: (
        <>
          <Plus className="h-3.5 w-3.5" />
          <span className="text-[9px]">←</span>
        </>
      ),
      run: () => pick("insert", i),
      disabled: !!busy || n >= maxFrames,
    },
    {
      key: "after",
      label: m.st_insertAfter,
      icon: (
        <>
          <Plus className="h-3.5 w-3.5" />
          <span className="text-[9px]">→</span>
        </>
      ),
      run: () => pick("insert", i + 1),
      disabled: !!busy || n >= maxFrames,
    },
  ];

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              {m.m360_admin}
            </span>
            <h2 className="text-sm font-semibold text-text">{m.st_title}</h2>
          </div>
          <p className="mt-1 text-xs text-muted">
            {fmt(m.st_liveInfo, { v: version, n: live.frames.length })}
            {publishedAt ? ` · ${new Date(publishedAt).toLocaleString()}` : ""}
          </p>
          <p className="mt-0.5 text-xs">
            {draft ? (
              <span className="text-amber-600">
                {save.state === "saving"
                  ? m.st_saving
                  : save.state === "error"
                    ? m.st_saveError
                    : fmt(m.st_draftSaved, { t: fmtTime(save.at ?? draft.updatedAt) })}
              </span>
            ) : (
              <span className="text-faint">{m.st_noDraft}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draft && (
            <button type="button" onClick={discard} disabled={!!busy} className="btn disabled:opacity-50">
              <X className="h-4 w-4" /> {m.st_discard}
            </button>
          )}
          <button type="button" onClick={publish} disabled={!draft || !!busy || !countOk} className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50">
            <UploadCloud className="h-4 w-4" /> {m.st_publish}
          </button>
        </div>
      </div>

      {live.baseUrl.startsWith("/") && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{m.st_bundledNote}</p>}
      {!countOk && <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">{fmt(m.st_countWarn, { n, min: minFrames, max: maxFrames })}</p>}
      {lostViews.length > 0 && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          {fmt(m.st_lostViews, { views: lostViews.map((k) => viewNames[k]).join(", ") })}
        </p>
      )}
      {draftLostViews.length > 0 && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          {fmt(m.st_lostDraftViews, { views: draftLostViews.map((k) => viewNames[k]).join(", ") })}
        </p>
      )}
      {lostMarkers.length > 0 && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          {fmt(m.st_lostMarkers, { n: lostMarkers.length, zones: lostMarkers.join(", ") })}
        </p>
      )}
      {draft?.hotspots !== undefined && <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{m.st_resetNote}</p>}
      {error && <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
      {notice && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#12b76a]/10 px-3 py-2 text-sm text-[#0f9d63]">
          <Check className="h-4 w-4" /> {notice}
        </p>
      )}
      {busy && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <RotateCw className="h-3.5 w-3.5 animate-spin" /> {busy}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex min-h-11 items-center gap-2 text-text">
          <input type="checkbox" checked={cutout} onChange={(e) => setCutout(e.target.checked)} className="accent-red-600" />
          {m.st_cutoutReplace}
        </label>
        <button type="button" onClick={() => setShowFlip((v) => !v)} className="btn">
          <Eye className="h-4 w-4" /> {showFlip ? m.st_hideFlip : m.st_showFlip}
        </button>
      </div>

      {showFlip && (
        <div className="mt-3 rounded-xl border border-border bg-surface-2 p-3">
          <Flipbook frames={editorFrames} aspect={aspect} m={m} />
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={acceptMime.join(",")}
        className="hidden"
        onChange={(e) => onFile(e.target.files)}
      />

      {/* ---- gallery ---- */}
      <ol className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
        {frames.map((f, i) => {
          const views = viewOf(f);
          const marks = markersOf(f);
          const t = meta[f.file]?.t;
          const hasPrev = (meta[f.file]?.prev ?? []).length > 0;
          const isNew = f.base === null;
          return (
            <li
              key={f.file}
              draggable={!busy}
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom != null) move(dragFrom, i);
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
              className={`group flex flex-col overflow-hidden rounded-lg border bg-surface ${
                dragFrom === i ? "border-accent opacity-60" : "border-border"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setZoom(false);
                  setPreview(i);
                }}
                className="relative block"
                aria-label={fmt(m.st_previewFrame, { n: i + 1 })}
              >
                <FrameStage aspect={aspect} layers={[{ key: f.file, src: srcOf(f), foot: footOf(f.file), t }]} className="rounded-none" />
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">{i + 1}</span>
                <span className="absolute right-1 top-1 flex flex-col items-end gap-0.5">
                  {views.map((k) => (
                    <span key={k} className="rounded bg-[#ff2d55] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {viewNames[k]}
                    </span>
                  ))}
                </span>
                <span className="absolute bottom-1 left-1 flex flex-wrap gap-0.5">
                  {isNew && <span className="rounded bg-amber-500 px-1 py-0.5 text-[9px] font-semibold text-black">{m.st_badgeNew}</span>}
                  {t && !isIdentity(t) && <span className="rounded bg-sky-500 px-1 py-0.5 text-[9px] font-semibold text-black">{m.st_badgeAligned}</span>}
                  {marks > 0 && <span className="rounded bg-black/70 px-1 py-0.5 text-[9px] text-white">{fmt(m.st_badgeMarkers, { n: marks })}</span>}
                </span>
              </button>
              <div className="truncate px-1.5 pt-1 font-mono text-[10px] text-faint" title={f.file}>
                {f.file}
              </div>
              {/* Mouse: the 8 icon buttons. Touch: one 44px "⋯" button opening them as a list. */}
              <div className="grid grid-cols-4 gap-0.5 p-1 [@media(pointer:coarse)]:hidden">
                {tileActions(i, hasPrev).map((a) => (
                  <IconBtn key={a.key} label={a.label} onClick={a.run} disabled={a.disabled}>
                    {a.icon}
                  </IconBtn>
                ))}
              </div>
              <div className="hidden p-1 [@media(pointer:coarse)]:block">
                <button
                  type="button"
                  onClick={() => setActionsFor(i)}
                  aria-label={fmt(m.st_frameActions, { n: i + 1 })}
                  className="flex min-h-11 w-full items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-faint">{m.st_galleryHint}</p>

      {/* ---- versions ---- */}
      {history.length > 0 && (
        <details className="mt-4 rounded-lg border border-border p-3">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-text">
            <History className="h-4 w-4" /> {m.st_versions}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {history.map((h) => (
              <li key={h.version} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2">
                <span className="text-muted">
                  <span className="font-semibold text-text">v{h.version}</span> · {fmt(m.st_versionFrames, { n: h.frames })} ·{" "}
                  {new Date(h.createdAt).toLocaleString()}
                  {h.actorName ? ` · ${h.actorName}` : ""}
                </span>
                <button type="button" onClick={() => restore(h.version)} disabled={!!busy} className="btn disabled:opacity-50">
                  <Undo2 className="h-4 w-4" /> {m.st_restoreVersion}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-faint">{m.st_versionsHint}</p>
        </details>
      )}

      {/* ---- tile actions (touch) ---- */}
      {actionsFor != null && frames[actionsFor] && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" onClick={() => setActionsFor(null)}>
          <div
            className="w-full max-w-sm rounded-t-2xl bg-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2">
              <span className="text-sm font-semibold text-text">{fmt(m.st_frameActions, { n: actionsFor + 1 })}</span>
              <button type="button" onClick={() => setActionsFor(null)} aria-label={m.st_close} className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="flex flex-col">
              {tileActions(actionsFor, (meta[frames[actionsFor].file]?.prev ?? []).length > 0).map((a) => (
                <li key={a.key}>
                  <button
                    type="button"
                    disabled={a.disabled}
                    onClick={() => {
                      setActionsFor(null);
                      a.run();
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="flex w-6 justify-center text-muted">{a.icon}</span>
                    {a.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ---- big preview ---- */}
      {preview != null && frames[preview] && (
        <div className="safe-inset fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-modal="true" onKeyDown={(e) => {
          if (e.key === "Escape") setPreview(null);
          if (e.key === "ArrowLeft") setPreview((preview - 1 + n) % n);
          if (e.key === "ArrowRight") setPreview((preview + 1) % n);
        }} tabIndex={-1} ref={(el) => el?.focus()}>
          <div className="flex items-center justify-between gap-2 px-4 py-2 text-white">
            <div className="min-w-0 text-sm">
              <span className="font-semibold">{fmt(m.st_frameOf, { n: preview + 1, total: n })}</span>
              <span className="ml-2 font-mono text-xs text-white/50">{frames[preview].file}</span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" onClick={() => setZoom((z) => !z)} aria-label={m.st_zoom}>
                <ZoomIn className="h-5 w-5" />
              </button>
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" onClick={() => setPreview((preview - 1 + n) % n)} aria-label={m.st_prev}>
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" onClick={() => setPreview((preview + 1) % n)} aria-label={m.st_next}>
                <ChevronRight className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
                onClick={() => {
                  setEditing(preview);
                  setPreview(null);
                }}
                aria-label={m.st_edit}
              >
                <SlidersHorizontal className="h-5 w-5" />
              </button>
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" onClick={() => setPreview(null)} aria-label={m.st_close}>
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className={`flex flex-1 justify-center p-3 ${zoom ? "items-start overflow-auto" : "items-center overflow-hidden"}`}>
            {zoom ? (
              // 1:1 pixels on a dark backdrop: cut-out fringe is easy to spot.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={srcOf(frames[preview])} alt="" className="max-w-none" style={{ background: "#14080b", width: dims.w, height: dims.h }} />
            ) : (
              <FrameStage
                aspect={aspect}
                guides
                className="h-[min(82vh,1000px)] border border-white/10 supports-[height:1svh]:h-[min(82svh,1000px)]"
                layers={[{ key: "c", src: srcOf(frames[preview]), foot: footOf(frames[preview].file), t: meta[frames[preview].file]?.t }]}
              />
            )}
          </div>
        </div>
      )}

      {editing != null && frames[editing] && (
        <FrameEditor
          frames={editorFrames}
          index={editing}
          aspect={aspect}
          onIndex={setEditing}
          onChange={setTransform}
          onFootChange={setFoot}
          onClose={() => setEditing(null)}
          m={m}
        />
      )}
    </section>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-9 items-center justify-center gap-0.5 rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
