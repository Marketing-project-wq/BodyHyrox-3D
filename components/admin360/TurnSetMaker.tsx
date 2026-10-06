"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, RefreshCw, RotateCw, Sparkles } from "lucide-react";
import { TURN_SET } from "@/lib/config";
import { type Dict, errorMessage, fmt } from "@/lib/i18n";
import { unwrap } from "@/lib/action-result";
import { markerSource, saveDraft } from "@/app/atlet/[id]/media-actions";
import { setSourceAngle, signSource } from "@/app/atlet/[id]/source-actions";
import { carryMarkersBySide } from "@/lib/media360-sides";
import { measureBlob, prepareBackgroundRemover, preparePhoto, uploadDraftBlobs } from "@/lib/media360-upload";
import { analyzeTurn, angleAtSample, grabFrame, openVideo } from "@/lib/media360-video";
import type { FrameMetaMap } from "@/lib/media360";
import type { SourceItem } from "@/lib/media-sources";
import { angDist, buildSlots, fitPose, isStanding, measureCutout, photoAngles, sidesByAngle, type Candidate, type Flag, type Slot } from "@/lib/turn-set";

type Phase = "idle" | "model" | "photos" | "video" | "ready" | "saving" | "saved" | "error";

const SIDE_NAMES = (m: Dict): Record<number, string> => ({ 0: m.view_front, 90: m.view_right, 180: m.view_back, 270: m.view_left });

/**
 * "Buat set putaran" (admin, every athlete): picks the best pose for every
 * angle from the athlete's materials (lib/turn-set.ts), lets the admin swap
 * any pose, then saves the locked poses as a turn set into the DRAFT (the
 * studio below previews it; Publish puts it live).
 */
export function TurnSetMaker({ athleteId, items, m }: { athleteId: string; items: SourceItem[]; m: Dict }) {
  const router = useRouter();
  const photos = useMemo(() => items.filter((i) => i.kind === "photo"), [items]);
  const videos = useMemo(() => items.filter((i) => i.kind === "video"), [items]);
  const [hints, setHints] = useState<Record<string, number | null>>({});
  const [reversePhotos, setReversePhotos] = useState(false);
  const [videoId, setVideoId] = useState<string>("");
  const [reverseVideo, setReverseVideo] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [saved, setSaved] = useState(0);
  const previews = useRef<string[]>([]);

  // The newest video by default; the admin can pick another or none.
  useEffect(() => {
    if (!videos.length) setVideoId("");
    else if (!videos.some((v) => v.id === videoId)) setVideoId(videos[videos.length - 1].id);
  }, [videos, videoId]);
  useEffect(() => {
    setHints(Object.fromEntries(photos.map((p) => [p.id, p.angleHint])));
  }, [photos]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const busy = phase === "model" || phase === "photos" || phase === "video" || phase === "saving";
  useEffect(() => {
    if (!busy) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [busy]);

  const angles = photoAngles(photos.map((p) => hints[p.id] ?? null), reversePhotos);
  const angleLabel = (a: number) => {
    const r = Math.round(a);
    const side = SIDE_NAMES(m)[r];
    return side ? `${r}° · ${side}` : `${r}°`;
  };

  async function changeHint(id: string, v: string) {
    const angle = v === "" ? null : Number(v);
    setHints((h) => ({ ...h, [id]: angle }));
    try {
      unwrap(await setSourceAngle(athleteId, id, angle));
    } catch (e) {
      setError(errorMessage(m, e));
    }
  }

  async function download(id: string): Promise<Blob> {
    const { url } = unwrap(await signSource(athleteId, id));
    const r = await fetch(url);
    if (!r.ok) throw new Error(m.err_source_not_found);
    return await r.blob();
  }

  // The grid shows each option already locked onto the turn canvas (what goes live).
  async function keep(c: Omit<Candidate, "preview" | "fitted">): Promise<Candidate> {
    const fitted = await fitPose(c.cutout, c.foot);
    const preview = URL.createObjectURL(fitted);
    previews.current.push(preview);
    return { ...c, fitted, preview };
  }

  async function analyse() {
    setError(null);
    setNotes([]);
    setSaved(0);
    setOpen(null);
    previews.current.forEach((u) => URL.revokeObjectURL(u));
    previews.current = [];
    const skipped: string[] = [];
    try {
      setPhase("model");
      setProgress({ done: 0, total: 100 });
      await prepareBackgroundRemover((f) => setProgress({ done: Math.round(f * 100), total: 100 }));
      const cands: Candidate[] = [];

      setPhase("photos");
      setProgress({ done: 0, total: photos.length });
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        try {
          const blob = await download(p.id);
          await createImageBitmap(blob).then((b) => b.close()); // e.g. HEIC outside Safari: skipped
          const cutout = await preparePhoto(blob, true, TURN_SET.cutoutMaxPx);
          const mm = await measureCutout(cutout);
          cands.push(await keep({ id: `p:${p.id}`, source: "photo", sourceId: p.id, label: p.originalName, angle: angles[i], cutout, ...mm, standing: isStanding(mm.foot, "photo") }));
        } catch {
          skipped.push(fmt(m.ts_skipped, { name: p.originalName }));
        }
        setProgress({ done: i + 1, total: photos.length });
      }

      const video = videos.find((v) => v.id === videoId);
      if (video) {
        setPhase("video");
        setProgress({ done: 0, total: 1 });
        let vid: Awaited<ReturnType<typeof openVideo>> | null = null;
        try {
          vid = await openVideo(await download(video.id));
          const a = await analyzeTurn(vid.video);
          const sampleAngle = (i: number) => {
            const x = angleAtSample(a, i);
            return reverseVideo ? (360 - x) % 360 : x;
          };
          // Per slot, the few frames nearest to its angle (each tried once).
          const step = 360 / TURN_SET.videoSlots;
          const picks = new Set<number>();
          for (let k = 0; k < TURN_SET.videoSlots; k++) {
            const target = k * step;
            const near = a.times
              .map((_, i) => i)
              .filter((i) => angDist(sampleAngle(i), target) <= step / 3)
              .sort((x, y) => angDist(sampleAngle(x), target) - angDist(sampleAngle(y), target));
            const spaced: number[] = [];
            for (const i of near) {
              if (spaced.length >= TURN_SET.videoCandidates) break;
              if (spaced.every((j) => Math.abs(a.times[j] - a.times[i]) > 0.15)) spaced.push(i);
            }
            spaced.forEach((i) => picks.add(i));
          }
          const list = Array.from(picks).sort((x, y) => x - y);
          setProgress({ done: 0, total: list.length });
          for (let n = 0; n < list.length; n++) {
            const i = list[n];
            const cutout = await preparePhoto(await grabFrame(vid.video, a.times[i]), true, TURN_SET.cutoutMaxPx);
            const mm = await measureCutout(cutout);
            const t = a.times[i];
            cands.push(
              await keep({
                id: `v:${video.id}:${t.toFixed(3)}`,
                source: "video",
                sourceId: video.id,
                label: `${video.originalName} · ${t.toFixed(1)} s`,
                angle: sampleAngle(i),
                cutout,
                ...mm,
                standing: isStanding(mm.foot, "video"),
              }),
            );
            setProgress({ done: n + 1, total: list.length });
          }
        } catch {
          skipped.push(fmt(m.ts_skipped, { name: video.originalName }));
        } finally {
          vid?.close();
        }
      }

      const result = buildSlots(cands, !!video && cands.some((c) => c.source === "video"));
      setSlots(result);
      setNotes(skipped);
      setPhase("ready");
    } catch (e) {
      setError(errorMessage(m, e));
      setPhase("error");
    }
  }

  async function save() {
    const chosen = slots.map((s) => ({ angle: s.angle, c: s.options[s.pick].c }));
    if (chosen.length < TURN_SET.minPoses) return;
    setError(null);
    setPhase("saving");
    try {
      // Markers to carry over (live set, or the last version with markers).
      const source = unwrap(await markerSource(athleteId)).ref;
      setProgress({ done: 0, total: chosen.length * 2 });
      const blobs: Blob[] = [];
      for (let i = 0; i < chosen.length; i++) {
        blobs.push(chosen[i].c.fitted);
        setProgress({ done: i + 1, total: chosen.length * 2 });
      }
      const names = await uploadDraftBlobs(athleteId, blobs, (k) => setProgress({ done: chosen.length + k, total: chosen.length * 2 }));
      const meta: FrameMetaMap = {};
      for (let i = 0; i < blobs.length; i++) {
        const foot = await measureBlob(blobs[i]);
        if (foot) meta[names[i]] = { foot };
      }
      const turnAngles = chosen.map((c) => Math.round(c.angle * 100) / 100);
      const views = sidesByAngle(names, turnAngles);
      const carry = source ? carryMarkersBySide(source, views) : null;
      unwrap(
        await saveDraft(athleteId, {
          frames: names.map((f) => ({ file: f, base: null, origin: null })),
          meta,
          views,
          hotspots: carry?.hotspots ?? [],
          note: "turn",
          turn: { v: 1, angles: turnAngles, blendShare: TURN_SET.blendShare },
        }),
      );
      setSaved(names.length);
      setPhase("saved");
      router.refresh();
    } catch (e) {
      setError(errorMessage(m, e));
      setPhase("ready");
    }
  }

  const fromPhotos = slots.filter((s) => s.options[s.pick].c.source === "photo").length;
  const flagged = slots.filter((s) => s.options[s.pick].flags.length > 0).length;
  const flagText = (f: Flag) => (f === "stepping" ? m.ts_flag_stepping : f === "mismatch" ? m.ts_flag_mismatch : m.ts_flag_noFeet);
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const status =
    phase === "model"
      ? fmt(m.vid_model, { pct })
      : phase === "photos"
        ? fmt(m.ts_photos, { done: progress.done, total: progress.total })
        : phase === "video"
          ? fmt(m.ts_video, { done: progress.done, total: progress.total })
          : phase === "saving"
            ? fmt(m.ts_saving, { done: progress.done, total: progress.total })
            : "";
  const nothing = photos.length === 0 && videos.length === 0;

  return (
    <div className="mt-6 border-t border-border pt-4" aria-labelledby="ts-title">
      <h3 id="ts-title" className="text-sm font-semibold text-text">
        {m.ts_title}
      </h3>
      <p className="mt-1 text-xs text-muted">{m.ts_hint}</p>

      {nothing ? (
        <p className="mt-2 text-xs text-faint">{m.ts_needMaterials}</p>
      ) : (
        <>
          {photos.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-text">{fmt(m.ts_photoAngles, { n: photos.length })}</p>
              <p className="text-[11px] text-faint">{m.ts_photoAnglesHint}</p>
              <ul className="mt-2 grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {photos.map((p, i) => (
                  <li key={p.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-2 p-1.5">
                    {p.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbUrl} alt="" className="h-14 w-10 shrink-0 rounded object-contain" />
                    ) : (
                      <span className="h-14 w-10 shrink-0 rounded bg-black/40" />
                    )}
                    <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] text-faint">
                      <span className="truncate" title={p.originalName}>
                        {p.originalName}
                      </span>
                      <select
                        value={hints[p.id] == null ? "" : String(hints[p.id])}
                        onChange={(e) => changeHint(p.id, e.target.value)}
                        disabled={busy}
                        className="min-h-11 w-full rounded-md border border-border bg-surface px-1 text-base text-text sm:text-xs"
                      >
                        <option value="">{fmt(m.ts_auto, { a: angleLabel(angles[i]) })}</option>
                        {Array.from({ length: 24 }, (_, k) => k * 15).map((a) => (
                          <option key={a} value={a}>
                            {angleLabel(a)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-text">
                <input type="checkbox" checked={reversePhotos} onChange={(e) => setReversePhotos(e.target.checked)} disabled={busy} className="accent-red-600" />
                {m.ts_reversePhotos}
              </label>
            </div>
          )}

          {videos.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex min-w-0 flex-col gap-1 text-xs text-text">
                {m.ts_video_pick}
                <select
                  value={videoId}
                  onChange={(e) => setVideoId(e.target.value)}
                  disabled={busy}
                  className="min-h-11 max-w-full rounded-md border border-border bg-surface px-2 text-base text-text sm:text-sm"
                >
                  <option value="">{m.ts_video_none}</option>
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.originalName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm text-text">
                <input type="checkbox" checked={reverseVideo} onChange={(e) => setReverseVideo(e.target.checked)} disabled={busy || !videoId} className="accent-red-600" />
                {m.vid_reverse}
              </label>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={analyse} disabled={busy} className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50">
              {busy && phase !== "saving" ? <RotateCw className="h-4 w-4 animate-spin" aria-hidden /> : slots.length ? <RefreshCw className="h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {slots.length ? m.ts_again : m.ts_analyse}
            </button>
            {busy && (
              <div className="flex min-w-[10rem] flex-1 flex-col gap-1" role="status">
                <span className="text-xs text-text">{status}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
          </div>
          {busy && <p className="mt-2 text-xs text-faint">{m.vid_keepOpen}</p>}
        </>
      )}

      {error && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
      {notes.length > 0 && (
        <ul className="mt-3 space-y-0.5 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {slots.length > 0 && (phase === "ready" || phase === "saving" || phase === "saved" || phase === "error") && (
        <div className="mt-4">
          <p className="text-sm text-text">
            {fmt(m.ts_result, { n: slots.length, photos: fromPhotos, video: slots.length - fromPhotos })}
            {flagged > 0 && <span className="text-accent"> {fmt(m.ts_flagged, { n: flagged })}</span>}
          </p>
          {slots.length < TURN_SET.minPoses ? (
            <p className="mt-1 text-xs text-accent">{fmt(m.ts_tooFew, { min: TURN_SET.minPoses })}</p>
          ) : (
            slots.length < TURN_SET.suggestPoses && <p className="mt-1 text-xs text-faint">{fmt(m.ts_few, { n: TURN_SET.suggestPoses })}</p>
          )}
          <p className="mt-1 text-[11px] text-faint">{m.ts_swapHint}</p>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
            {slots.map((s, si) => {
              const o = s.options[s.pick];
              return (
                <li key={s.angle} className="flex min-w-0 flex-col">
                  <button
                    type="button"
                    onClick={() => setOpen(open === si ? null : si)}
                    disabled={busy || s.options.length < 2}
                    className={`relative flex aspect-[3/5] w-full items-end justify-center overflow-hidden rounded-lg border bg-[#0a1118] ${open === si ? "border-accent" : "border-border"} disabled:cursor-default`}
                    aria-label={`${angleLabel(s.angle)}: ${o.c.label}`}
                    aria-expanded={open === si}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.c.preview} alt="" className="h-full w-full object-contain" />
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">{angleLabel(s.angle)}</span>
                    {o.flags.length > 0 && (
                      <span className="absolute right-1 top-1 rounded bg-accent px-1 text-white" title={o.flags.map(flagText).join(", ")}>
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                      </span>
                    )}
                  </button>
                  <span className="mt-0.5 truncate text-[10px] text-faint" title={o.c.label}>
                    {o.c.source === "photo" ? m.src_photo : m.src_video} · {o.c.label}
                  </span>
                  {o.flags.length > 0 && <span className="text-[10px] text-accent">{o.flags.map(flagText).join(", ")}</span>}
                </li>
              );
            })}
          </ul>
          {open != null && slots[open] && (
            <div className="mt-3 rounded-lg border border-border bg-surface-2 p-2">
              <p className="text-xs text-text">{fmt(m.ts_options, { a: angleLabel(slots[open].angle) })}</p>
              <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {slots[open].options.map((o, oi) => (
                  <li key={o.c.id} className="w-24 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSlots((all) => all.map((x, i) => (i === open ? { ...x, pick: oi } : x)));
                        if (phase === "saved") setPhase("ready");
                      }}
                      className={`relative flex aspect-[3/5] w-full items-end justify-center overflow-hidden rounded-lg border bg-[#0a1118] ${slots[open].pick === oi ? "border-accent ring-2 ring-accent" : "border-border"}`}
                      aria-pressed={slots[open].pick === oi}
                      aria-label={o.c.label}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={o.c.preview} alt="" className="h-full w-full object-contain" />
                    </button>
                    <span className="block truncate text-[10px] text-faint" title={o.c.label}>
                      {o.c.source === "photo" ? m.src_photo : m.src_video} · {Math.round(o.c.angle) % 360}°
                    </span>
                    {o.flags.length > 0 && <span className="block text-[10px] text-accent">{o.flags.map(flagText).join(", ")}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy || slots.length < TURN_SET.minPoses}
              className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === "saving" ? <RotateCw className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              {fmt(m.ts_save, { n: slots.length })}
            </button>
          </div>
          {phase === "saved" && (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#12b76a]/10 px-3 py-2 text-sm text-[#0f9d63]">
              <Check className="h-4 w-4 shrink-0" aria-hidden />
              {fmt(m.ts_saved, { n: saved })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
