"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, ImageIcon, Link2, PlayCircle, RotateCw, Trash2, UploadCloud, Video } from "lucide-react";
import { STAGE_MEDIA } from "@/lib/config";
import { type Dict, errorMessage, errorText, fmt } from "@/lib/i18n";
import { unwrap, ActionFailure } from "@/lib/action-result";
import {
  checkStageMediaLink,
  getStageMediaAdmin,
  issueStagePosterUpload,
  publishStageMedia,
  saveStageMediaDraft,
} from "@/app/atlet/[id]/stage-media-actions";
import { classifyLink, stageMediaPictureUrl, type StageMedia, type StageMediaSlot } from "@/lib/stage-media";
import { putSigned } from "@/lib/media-sources";

/** One screen in the editor: what the admin typed, and the last good check of it. */
type Row = {
  link: string;
  title: string;
  checked: Omit<StageMediaSlot, "slot"> | null;
  picture: string | null;
  state: "idle" | "checking" | "ok" | "error";
  error: string | null;
  /** The link worked when saved but fails now (re-checked when the page opens). */
  broken: boolean;
};

const emptyRow = (): Row => ({ link: "", title: "", checked: null, picture: null, state: "idle", error: null, broken: false });

/** A poster (WebP) from the first second of a CORS-enabled video, made in this browser. */
async function videoPoster(url: string): Promise<Blob> {
  const v = document.createElement("video");
  v.crossOrigin = "anonymous";
  v.muted = true;
  v.playsInline = true;
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  v.preload = "auto";
  try {
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("video"));
      v.src = url;
    });
    await new Promise<void>((res) => {
      v.addEventListener("seeked", () => res(), { once: true });
      setTimeout(res, 2500);
      v.currentTime = Math.min(1, (Number.isFinite(v.duration) ? v.duration : 2) / 2);
    });
    const k = Math.min(1, STAGE_MEDIA.posterPx / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(v.videoWidth * k));
    c.height = Math.max(1, Math.round(v.videoHeight * k));
    const g = c.getContext("2d");
    if (!g) throw new Error("canvas");
    g.drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", 0.85)); // throws if the video was not CORS-clean
    if (!blob) throw new Error("poster");
    return blob;
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}

/**
 * "Media frame panggung" (admin, every athlete): one link per neon screen of
 * the stage. Check each link, then save to the draft and Publish. `embedded`:
 * drawn inside another card (the Profile card), without its own card frame.
 */
export function StageMediaEditor({ athleteId, m, embedded = false }: { athleteId: string; m: Dict; embedded?: boolean }) {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: STAGE_MEDIA.slots }, emptyRow));
  const [loaded, setLoaded] = useState(false);
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [live, setLive] = useState<StageMedia | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [dirty, setDirty] = useState(false);

  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));

  const check = useCallback(
    async (i: number, link: string, keep?: Row["checked"], recheck = false) => {
      const c = classifyLink(link);
      if (!c.ok) {
        patch(i, { state: "error", error: errorText(m, c.problem === "empty" ? "missing_input" : `link_${c.problem === "too_long" ? "invalid" : c.problem}`), checked: null, picture: null });
        return;
      }
      patch(i, { state: "checking", error: null });
      try {
        const r = unwrap(await checkStageMediaLink(athleteId, link));
        let slot = r.slot;
        let picture = r.pictureUrl;
        if (r.needsPoster) {
          if (keep?.thumb && keep.url === slot.url) {
            slot = { ...slot, thumb: keep.thumb };
            picture = null;
          } else {
            try {
              const blob = await videoPoster(slot.url);
              const up = unwrap(await issueStagePosterUpload(athleteId));
              if (!(await putSigned(up.uploadUrl, blob, "image/webp"))) throw new Error(m.err_upload_failed);
              slot = { ...slot, thumb: up.path };
              picture = up.publicUrl;
            } catch (e) {
              throw e instanceof ActionFailure ? e : new ActionFailure("link_no_cors");
            }
          }
        }
        setRows((rs) =>
          rs.map((row, k) =>
            k === i
              ? {
                  ...row,
                  link: slot.url,
                  title: row.title || (recheck ? "" : slot.title ?? ""),
                  checked: { ...slot, title: row.title || slot.title },
                  picture: picture ?? row.picture,
                  state: "ok",
                  error: null,
                  broken: false,
                }
              : row,
          ),
        );
      } catch (e) {
        const msg = errorMessage(m, e);
        if (recheck) patch(i, { state: "error", error: msg, broken: true });
        else patch(i, { state: "error", error: msg, checked: null });
      }
    },
    [athleteId, m],
  );

  // Load draft (or live) and re-check every filled screen, so dead links get a ⚠.
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const st = unwrap(await getStageMediaAdmin(athleteId));
        if (off) return;
        setLive(st.published);
        setHasDraft(!!st.draft);
        const src = st.draft ?? st.published;
        const next = Array.from({ length: STAGE_MEDIA.slots }, emptyRow);
        for (const s of src.slots) {
          next[s.slot] = {
            ...emptyRow(),
            link: s.url,
            title: s.title ?? "",
            checked: { kind: s.kind, url: s.url, ytId: s.ytId, thumb: s.thumb, w: s.w, h: s.h, title: s.title, checkedAt: s.checkedAt },
            picture: stageMediaPictureUrl(st.pictureBase, s.thumb),
            state: "ok",
          };
        }
        setRows(next);
        setLoaded(true);
        next.forEach((r, i) => r.checked && check(i, r.link, r.checked, true));
      } catch (e) {
        if (off) return;
        if (e instanceof ActionFailure && e.code === "stage_media_not_ready") setNotReady(true);
        else setError(errorMessage(m, e));
        setLoaded(true);
      }
    })();
    return () => {
      off = true;
    };
  }, [athleteId, m, check]);

  const filled = rows.filter((r) => r.link.trim());
  const ready = filled.every((r) => r.state === "ok" && r.checked && r.checked.url === classifyLinkUrl(r.link));
  const media: StageMedia = useMemo(
    () => ({
      v: 1,
      slots: rows.flatMap((r, i) =>
        r.link.trim() && r.checked ? [{ ...r.checked, slot: i, title: r.title.trim() ? r.title.trim().slice(0, STAGE_MEDIA.maxTitle) : null }] : [],
      ),
    }),
    [rows],
  );

  function edit(i: number, p: Partial<Row>) {
    setDirty(true);
    setNotice(null);
    patch(i, p);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= rows.length || to === from) return;
    setDirty(true);
    setNotice(null);
    setRows((rs) => {
      const n = [...rs];
      [n[from], n[to]] = [n[to], n[from]];
      return n;
    });
  }

  async function save(): Promise<boolean> {
    setError(null);
    setNotice(null);
    if (!ready) {
      setError(m.sm_needsCheck);
      return false;
    }
    setBusy("save");
    try {
      unwrap(await saveStageMediaDraft(athleteId, media));
      setHasDraft(true);
      setDirty(false);
      setNotice(m.sm_saved);
      return true;
    } catch (e) {
      setError(errorMessage(m, e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (dirty && !(await save())) return;
    setBusy("publish");
    setError(null);
    try {
      unwrap(await publishStageMedia(athleteId));
      setLive(media);
      setHasDraft(false);
      setNotice(m.sm_published);
    } catch (e) {
      setError(errorMessage(m, e));
    } finally {
      setBusy(null);
    }
  }

  const kindLabel = (k: StageMediaSlot["kind"]) => (k === "youtube" ? m.sm_kind_youtube : k === "video" ? m.sm_kind_video : m.sm_kind_image);
  const KindIcon = ({ k }: { k: StageMediaSlot["kind"] }) =>
    k === "youtube" ? <PlayCircle className="h-3.5 w-3.5" aria-hidden /> : k === "video" ? <Video className="h-3.5 w-3.5" aria-hidden /> : <ImageIcon className="h-3.5 w-3.5" aria-hidden />;

  return (
    <section className={embedded ? "" : "card p-4"} aria-labelledby="sm-title">
      <div className="flex flex-wrap items-center gap-2">
        {!embedded && <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{m.m360_admin}</span>}
        <h2 id="sm-title" className="text-sm font-semibold text-text">
          {m.sm_title}
        </h2>
        {live && <span className="text-xs text-faint">{fmt(m.sm_live, { n: live.slots.length })}</span>}
        {hasDraft && !dirty && <span className="text-xs text-[#b7791f]">{m.sm_draftPending}</span>}
        {dirty && <span className="text-xs text-[#b7791f]">{m.sm_unsaved}</span>}
      </div>
      <p className="mt-1 text-xs text-muted">{m.sm_hint}</p>

      {notReady && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{m.err_stage_media_not_ready}</p>}
      {!loaded && <p className="mt-3 text-xs text-faint">{m.sm_loading}</p>}

      {loaded && !notReady && (
        <ol className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((r, i) => (
            <li key={i} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3 sm:flex-row">
              <div className="relative flex aspect-video w-full shrink-0 items-center justify-center self-start overflow-hidden rounded-md bg-black/85 sm:w-40">
                {r.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.picture} alt="" className="h-full w-full object-contain" />
                ) : r.checked?.kind === "video" ? (
                  <video src={r.checked.url} muted playsInline preload="metadata" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[11px] text-white/50">{m.sm_empty}</span>
                )}
                {r.checked?.kind === "youtube" && <PlayCircle className="absolute h-8 w-8 text-white/85" aria-hidden />}
                <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">{fmt(m.sm_screen, { n: i + 1 })}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <label className="flex flex-col gap-1">
                  <span className="sr-only">{fmt(m.sm_screen, { n: i + 1 })}: {m.sm_link}</span>
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      inputMode="url"
                      className="input min-w-0 flex-1"
                      placeholder={m.sm_linkPh}
                      value={r.link}
                      onChange={(e) => edit(i, { link: e.target.value, state: "idle", error: null, broken: false })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          check(i, r.link, r.checked);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost shrink-0 px-3 text-xs"
                      disabled={!r.link.trim() || r.state === "checking"}
                      onClick={() => check(i, r.link, r.checked)}
                    >
                      {r.state === "checking" ? <RotateCw className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
                      {r.state === "checking" ? m.sm_checking : m.sm_check}
                    </button>
                  </div>
                </label>
                <div className="min-h-[1.25rem] text-xs" role="status">
                  {r.state === "ok" && r.checked && (
                    <span className="inline-flex items-center gap-1 text-[#0f9d63]">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      <KindIcon k={r.checked.kind} />
                      {kindLabel(r.checked.kind)} · {m.sm_ok}
                    </span>
                  )}
                  {r.state === "error" && (
                    <span className="inline-flex items-start gap-1 text-accent">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {r.broken ? fmt(m.sm_broken, { reason: r.error ?? "" }) : r.error}
                    </span>
                  )}
                  {r.state === "idle" && r.link.trim() && <span className="text-faint">{m.sm_needsCheck}</span>}
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-faint">{m.sm_titleLabel}</span>
                  <input
                    className="input"
                    maxLength={STAGE_MEDIA.maxTitle}
                    value={r.title}
                    onChange={(e) => edit(i, { title: e.target.value, checked: r.checked ? { ...r.checked, title: e.target.value || null } : null })}
                  />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="btn btn-ghost min-w-11 px-2" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`${m.sm_up}: ${fmt(m.sm_screen, { n: i + 1 })}`}>
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost min-w-11 px-2"
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, i + 1)}
                    aria-label={`${m.sm_down}: ${fmt(m.sm_screen, { n: i + 1 })}`}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                  <select
                    className="input w-auto min-w-0 flex-1 py-1"
                    value=""
                    aria-label={`${m.sm_moveTo} (${fmt(m.sm_screen, { n: i + 1 })})`}
                    onChange={(e) => move(i, Number(e.target.value))}
                  >
                    <option value="">{m.sm_moveTo}</option>
                    {rows.map((_, k) => (k === i ? null : <option key={k} value={k}>{fmt(m.sm_screen, { n: k + 1 })}</option>))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost min-w-11 px-2 text-accent"
                    disabled={!r.link && !r.title}
                    onClick={() => edit(i, emptyRow())}
                    aria-label={`${m.sm_clear}: ${fmt(m.sm_screen, { n: i + 1 })}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {error && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
      {notice && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#12b76a]/10 px-3 py-2 text-sm text-[#0f9d63]">
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          {notice}
        </p>
      )}
      {loaded && !notReady && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" disabled={!!busy || !dirty} onClick={save}>
            {busy === "save" ? <RotateCw className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            {m.sm_save}
          </button>
          <button type="button" className="btn btn-primary" disabled={!!busy || (!dirty && !hasDraft)} onClick={publish}>
            {busy === "publish" ? <RotateCw className="h-4 w-4 animate-spin" aria-hidden /> : <UploadCloud className="h-4 w-4" aria-hidden />}
            {m.sm_publish}
          </button>
        </div>
      )}
    </section>
  );
}

/** Normalized form of a typed link (to know whether the last check still applies). */
function classifyLinkUrl(link: string): string | null {
  const c = classifyLink(link);
  return c.ok ? c.url : null;
}
