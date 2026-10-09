"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Camera, Check, ImageIcon, Link2, PlayCircle, RotateCw, Trash2, UploadCloud, Video } from "lucide-react";
import { STAGE_MEDIA } from "@/lib/config";
import { type Dict, errorMessage, errorText, fmt } from "@/lib/i18n";
import { unwrap, ActionFailure } from "@/lib/action-result";
import {
  checkStageInstagramLink,
  checkStageMediaLink,
  getStageMediaAdmin,
  issueStagePosterUpload,
  publishStageMedia,
  saveStageMediaDraft,
} from "@/app/atlet/[id]/stage-media-actions";
import { classifyLink, instagramLink, stageMediaPictureUrl, videoPlaybackUrl, type StageMedia, type StageMediaSlot, type VideoReport } from "@/lib/stage-media";
import { putSigned } from "@/lib/media-sources";

/**
 * One screen in the editor: what the admin typed in the two columns (the
 * video / media link, and the Instagram post a click opens), and the last
 * good check of each. An Instagram-only screen has an empty `link`; its
 * `checked` is the Instagram slot (cover picture).
 */
type Row = {
  link: string;
  ig: string;
  title: string;
  checked: Omit<StageMediaSlot, "slot" | "ig"> | null;
  picture: string | null;
  state: "idle" | "checking" | "ok" | "error";
  error: string | null;
  /** What the server saw for a video file (shown when it can't play, and as facts when it can). */
  video: VideoReport | null;
  igState: "idle" | "ok" | "error";
  /** The normalized Instagram link that passed the check. */
  igChecked: string | null;
  igVerified: boolean;
  igError: string | null;
  note: string | null;
  /** The link worked when saved but fails now (re-checked when the page opens). */
  broken: boolean;
};

const emptyRow = (): Row => ({
  link: "",
  ig: "",
  title: "",
  checked: null,
  picture: null,
  state: "idle",
  error: null,
  video: null,
  igState: "idle",
  igChecked: null,
  igVerified: false,
  igError: null,
  note: null,
  broken: false,
});

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
 * "Media frame panggung" (admin, every athlete): per neon screen of the stage,
 * a video (MP4, played inside the frame; YouTube or an image also work) and
 * the athlete's Instagram post / reel a click on the screen opens. Either one
 * is enough. "Check link" checks both, then save to the draft and Publish.
 * `embedded`: drawn inside another card (the Profile card), without its own
 * card frame.
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

  /** Column 1 (video / YouTube / image), or the Instagram-only screen when column 1 is empty. */
  const checkMedia = useCallback(
    async (i: number, link: string, keep: Row["checked"], recheck: boolean, igOnly: boolean): Promise<void> => {
      const c = classifyLink(link);
      if (!c.ok) {
        const code = c.problem === "empty" ? "missing_input" : `link_${c.problem === "too_long" ? "invalid" : c.problem}`;
        patch(i, igOnly ? { state: "idle", igState: "error", igError: errorText(m, code), checked: null, picture: null } : { state: "error", error: errorText(m, code), checked: null, picture: null, video: null });
        return;
      }
      try {
        const r = unwrap(await checkStageMediaLink(athleteId, link));
        let slot = r.slot;
        let picture = r.pictureUrl;
        if (r.video && r.video.problems.length) {
          patch(i, { state: "error", error: null, video: r.video, broken: recheck, ...(recheck ? {} : { checked: null }) });
          return;
        }
        if (r.needsPoster) {
          if (keep?.thumb && keep.url === slot.url) {
            slot = { ...slot, thumb: keep.thumb };
            picture = null;
          } else {
            try {
              const blob = await videoPoster(videoPlaybackUrl(slot.url)); // through our proxy for hosts without CORS
              const up = unwrap(await issueStagePosterUpload(athleteId));
              if (!(await putSigned(up.uploadUrl, blob, "image/webp"))) throw new Error(m.err_upload_failed);
              slot = { ...slot, thumb: up.path };
              picture = up.publicUrl;
            } catch (e) {
              throw e instanceof ActionFailure ? e : new ActionFailure("link_no_cors");
            }
          }
        }
        const { ig: _ig, ...rest } = slot;
        setRows((rs) =>
          rs.map((row, k) =>
            k === i
              ? {
                  ...row,
                  ...(igOnly ? { ig: slot.url, igState: "ok" as const, igChecked: slot.url, igVerified: !!slot.thumb, igError: null } : { link: slot.url }),
                  title: row.title || (recheck ? "" : slot.title ?? ""),
                  checked: { ...rest, title: row.title || slot.title },
                  picture: picture ?? (keep?.url === slot.url ? row.picture : null),
                  state: "ok",
                  error: null,
                  video: r.video ?? null,
                  broken: false,
                }
              : row,
          ),
        );
      } catch (e) {
        const msg = errorMessage(m, e);
        if (igOnly) patch(i, { state: "idle", igState: "error", igError: recheck ? fmt(m.sm_broken, { reason: msg }) : msg, ...(recheck ? {} : { checked: null }) });
        else if (recheck) patch(i, { state: "error", error: msg, broken: true });
        else patch(i, { state: "error", error: msg, checked: null, video: null });
      }
    },
    [athleteId, m],
  );

  /** Column 2 next to a video: only whether the Instagram link is good. */
  const checkIg = useCallback(
    async (i: number, ig: string): Promise<void> => {
      if (!instagramLink(ig)) {
        patch(i, { igState: "error", igError: errorText(m, "link_ig_invalid"), igChecked: null });
        return;
      }
      try {
        const r = unwrap(await checkStageInstagramLink(athleteId, ig));
        patch(i, { ig: r.url, igState: "ok", igChecked: r.url, igVerified: r.verified, igError: null });
      } catch (e) {
        patch(i, { igState: "error", igError: errorMessage(m, e), igChecked: null });
      }
    },
    [athleteId, m],
  );

  /** "Check link": both columns of one screen. */
  const check = useCallback(
    async (i: number, row: Row, recheck = false) => {
      let link = row.link.trim();
      let ig = row.ig.trim();
      let note: string | null = null;
      // An Instagram link pasted into the video column belongs in the Instagram column.
      const c1 = link ? classifyLink(link) : null;
      if (c1?.ok && c1.kind === "instagram") {
        if (!ig || instagramLink(ig) === c1.url) {
          note = ig ? m.sm_igDuplicate : m.sm_igMoved;
          ig = ig || link;
          link = "";
        } else {
          patch(i, { state: "error", error: m.sm_igInVideo, checked: null, video: null });
          return;
        }
      }
      patch(i, { link, ig, note, state: link || (ig && !link) ? "checking" : "idle", error: null, video: null, igError: null, ...(link ? {} : { checked: null, picture: null }) });
      if (!link && !ig) return;
      if (!link) return checkMedia(i, ig, recheck ? row.checked : null, recheck, true);
      await Promise.all([checkMedia(i, link, row.checked, recheck, false), ig ? checkIg(i, ig) : Promise.resolve(patch(i, { igState: "idle", igChecked: null }))]);
    },
    [checkMedia, checkIg, m],
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
          const igOnly = s.kind === "instagram";
          next[s.slot] = {
            ...emptyRow(),
            link: igOnly ? "" : s.url,
            ig: s.ig ?? "",
            title: s.title ?? "",
            checked: { kind: s.kind, url: s.url, ytId: s.ytId, thumb: s.thumb, w: s.w, h: s.h, title: s.title, checkedAt: s.checkedAt },
            picture: stageMediaPictureUrl(st.pictureBase, s.thumb),
            state: "ok",
            igState: s.ig ? "ok" : "idle",
            igChecked: s.ig,
            igVerified: true,
          };
        }
        setRows(next);
        setLoaded(true);
        next.forEach((r, i) => r.checked && check(i, r, true));
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

  const rowReady = (r: Row) => {
    const link = r.link.trim();
    const ig = r.ig.trim();
    if (!link && !ig) return true;
    if (!link) return r.igState === "ok" && !!r.checked && r.checked.kind === "instagram" && r.checked.url === instagramLink(ig);
    const mediaOk = r.state === "ok" && !!r.checked && r.checked.url === classifyLinkUrl(link);
    const igOk = !ig || (r.igState === "ok" && r.igChecked === instagramLink(ig));
    return mediaOk && igOk;
  };
  const ready = rows.every(rowReady);
  const media: StageMedia = useMemo(
    () => ({
      v: 1,
      slots: rows.flatMap((r, i) => {
        if (!r.checked || (!r.link.trim() && !r.ig.trim())) return [];
        const title = r.title.trim() ? r.title.trim().slice(0, STAGE_MEDIA.maxTitle) : null;
        const ig = r.checked.kind === "instagram" ? r.checked.url : r.ig.trim() ? r.igChecked : null;
        return [{ ...r.checked, slot: i, ig, title }];
      }),
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

  const kindLabel = (k: StageMediaSlot["kind"]) =>
    k === "youtube" ? m.sm_kind_youtube : k === "video" ? m.sm_kind_video : k === "instagram" ? m.sm_kind_instagram : m.sm_kind_image;
  const KindIcon = ({ k }: { k: StageMediaSlot["kind"] }) =>
    k === "youtube" ? (
      <PlayCircle className="h-3.5 w-3.5" aria-hidden />
    ) : k === "video" ? (
      <Video className="h-3.5 w-3.5" aria-hidden />
    ) : k === "instagram" ? (
      <Camera className="h-3.5 w-3.5" aria-hidden />
    ) : (
      <ImageIcon className="h-3.5 w-3.5" aria-hidden />
    );

  /** The facts of a video check, one line. */
  const facts = (v: VideoReport) =>
    fmt(m.sm_vidFacts, {
      host: v.host,
      status: v.status || "–",
      type: v.type ?? "–",
      size: v.sizeMB != null ? `${v.sizeMB} MB` : "–",
      range: v.range ? m.sm_yes : m.sm_no,
      acao: v.acao ?? m.sm_none,
      server: v.server ?? "–",
    });
  const problemText = (v: VideoReport, p: VideoReport["problems"][number]) =>
    fmt(m[`sm_vid_${p}` as keyof Dict] as string, {
      status: v.status || "–",
      type: v.type ?? "–",
      size: v.sizeMB ?? "–",
      max: STAGE_MEDIA.maxVideoMB,
      acao: v.acao ?? "",
      host: v.host,
    });

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
          {rows.map((r, i) => {
            const screen = fmt(m.sm_screen, { n: i + 1 });
            const busyRow = r.state === "checking";
            const hasIg = !!(r.igChecked || (r.checked?.kind === "instagram" && r.checked.url));
            return (
              <li key={i} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3 sm:flex-row">
                <div className="relative mx-auto flex aspect-[3/5] w-32 shrink-0 items-center justify-center self-start overflow-hidden rounded-md bg-black/85 sm:mx-0 sm:w-28">
                  {r.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.picture} alt="" className="h-full w-full object-contain" />
                  ) : r.checked?.kind === "instagram" ? (
                    <span className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#feda75,#d62976_50%,#4f5bd5)] text-white">
                      <Camera className="h-8 w-8" aria-hidden />
                    </span>
                  ) : r.checked?.kind === "video" ? (
                    <video src={r.checked.url} muted playsInline preload="metadata" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-[11px] text-white/50">{m.sm_empty}</span>
                  )}
                  {r.checked?.kind === "youtube" && <PlayCircle className="absolute h-8 w-8 text-white/85" aria-hidden />}
                  {hasIg && (
                    <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-[linear-gradient(135deg,#feda75,#d62976_50%,#4f5bd5)] text-white" aria-hidden>
                      <Camera className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">{screen}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-muted">
                      {m.sm_videoLabel}
                      <span className="sr-only"> ({screen})</span>
                    </span>
                    <div className="flex gap-1.5">
                      <input
                        type="url"
                        inputMode="url"
                        className="input min-w-0 flex-1"
                        placeholder={m.sm_videoPh}
                        value={r.link}
                        onChange={(e) => edit(i, { link: e.target.value, state: "idle", error: null, video: null, note: null, broken: false })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            check(i, r);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost shrink-0 px-3 text-xs"
                        disabled={(!r.link.trim() && !r.ig.trim()) || busyRow}
                        onClick={() => check(i, r)}
                        aria-label={`${m.sm_check} (${screen})`}
                      >
                        {busyRow ? <RotateCw className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
                        {busyRow ? m.sm_checking : m.sm_check}
                      </button>
                    </div>
                    <span className="text-[11px] text-faint">{m.sm_videoHint}</span>
                  </label>
                  <div className="min-h-[1.25rem] text-xs" role="status">
                    {r.state === "ok" && r.checked && r.link.trim() && (
                      <span className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-[#0f9d63]">
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          <KindIcon k={r.checked.kind} />
                          {r.checked.kind === "video" ? m.sm_vidOk : `${kindLabel(r.checked.kind)} · ${m.sm_ok}`}
                        </span>
                        {r.video?.proxied && <span className="text-[11px] text-muted">{m.sm_vidProxied}</span>}
                        {r.video && <span className="break-words text-[11px] text-faint">{facts(r.video)}</span>}
                      </span>
                    )}
                    {r.state === "error" && r.video && r.video.problems.length > 0 && (
                      <span className="flex flex-col gap-0.5 text-accent">
                        <span className="inline-flex items-start gap-1 font-medium">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          {r.broken ? fmt(m.sm_broken, { reason: m.sm_vidBad }) : m.sm_vidBad}
                        </span>
                        <ul className="ml-5 list-disc">
                          {r.video.problems.map((p) => (
                            <li key={p}>{problemText(r.video!, p)}</li>
                          ))}
                        </ul>
                        <span className="break-words text-[11px] text-faint">{facts(r.video)}</span>
                      </span>
                    )}
                    {r.state === "error" && !r.video && r.error && (
                      <span className="inline-flex items-start gap-1 text-accent">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {r.broken ? fmt(m.sm_broken, { reason: r.error }) : r.error}
                      </span>
                    )}
                    {r.state === "idle" && r.link.trim() && <span className="text-faint">{m.sm_needsCheck}</span>}
                    {r.note && <span className="block text-faint">{r.note}</span>}
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-muted">
                      {m.sm_igLabel}
                      <span className="sr-only"> ({screen})</span>
                    </span>
                    <input
                      type="url"
                      inputMode="url"
                      className="input"
                      placeholder={m.sm_igPh}
                      value={r.ig}
                      onChange={(e) =>
                        edit(i, {
                          ig: e.target.value,
                          igState: "idle",
                          igError: null,
                          note: null,
                          ...(r.checked?.kind === "instagram" && !r.link.trim() ? { state: "idle" as const, checked: null, picture: null } : {}),
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          check(i, r);
                        }
                      }}
                    />
                  </label>
                  <div className="min-h-[1.25rem] text-xs" role="status">
                    {r.igState === "ok" && r.ig.trim() && (
                      <span className="inline-flex items-start gap-1 text-[#0f9d63]">
                        <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {r.igVerified ? m.sm_igOk : m.sm_igUnverified}
                      </span>
                    )}
                    {r.igState === "error" && r.igError && (
                      <span className="inline-flex items-start gap-1 text-accent">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {r.igError}
                      </span>
                    )}
                    {r.igState === "idle" && r.ig.trim() && <span className="text-faint">{m.sm_needsCheck}</span>}
                    {!r.ig.trim() && r.link.trim() && r.state === "ok" && <span className="text-faint">{m.sm_igNone}</span>}
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
                    <button type="button" className="btn btn-ghost min-w-11 px-2" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`${m.sm_up}: ${screen}`}>
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" className="btn btn-ghost min-w-11 px-2" disabled={i === rows.length - 1} onClick={() => move(i, i + 1)} aria-label={`${m.sm_down}: ${screen}`}>
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </button>
                    <select className="input w-auto min-w-0 flex-1 py-1" value="" aria-label={`${m.sm_moveTo} (${screen})`} onChange={(e) => move(i, Number(e.target.value))}>
                      <option value="">{m.sm_moveTo}</option>
                      {rows.map((_, k) => (k === i ? null : <option key={k} value={k}>{fmt(m.sm_screen, { n: k + 1 })}</option>))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost min-w-11 px-2 text-accent"
                      disabled={!r.link && !r.ig && !r.title}
                      onClick={() => edit(i, emptyRow())}
                      aria-label={`${m.sm_clear}: ${screen}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
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
