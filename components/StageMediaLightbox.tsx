"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Volume2, X } from "lucide-react";
import { STAGE_MEDIA } from "@/lib/config";
import type { Dict } from "@/lib/i18n";
import { instagramEmbedUrl, youtubeEmbedUrl, type StageScreen } from "@/lib/stage-media";

/**
 * The pop-up a click on a stage screen opens; visitors stay on the page. It
 * shows the screen's video file, the official YouTube player
 * (youtube-nocookie, built from the id only), Instagram's official embed for a
 * screen with only an Instagram post, or an image. Closes with ×, Escape or a
 * tap outside; focus moves in and comes back.
 */
export function StageMediaLightbox({ screen, m, onClose }: { screen: StageScreen; m: Dict; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // The tap that opened the pop-up may still send its click (and press) to
  // whatever is under the finger now: for a moment the backdrop ignores it and
  // the player can't be hit, so the pop-up doesn't close, pause or lose focus.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), STAGE_MEDIA.popup.ghostClickMs);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [onClose]);

  const label = screen.title || m.sml_media;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(e) => {
        if (!settled) e.preventDefault();
      }}
      onClick={() => {
        if (settled) onClose();
      }}
    >
      <div className={`relative flex w-full flex-col gap-2 ${screen.kind === "video" ? "max-w-fit" : "max-w-5xl"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-semibold text-white">{label}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white hover:border-white/50"
            aria-label={m.sml_close}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className={settled ? "contents" : "pointer-events-none contents"}>
          {screen.kind === "video" ? (
            <PopupVideo screen={screen} label={label} m={m} />
          ) : screen.kind === "instagram" ? (
            // Instagram's own embed (portrait card); scrolls inside on small screens.
            <div className="mx-auto w-full max-w-[540px] overflow-hidden rounded-xl bg-white" style={{ height: "min(80svh, 760px)" }}>
              <iframe
                src={instagramEmbedUrl(screen.url) ?? undefined}
                title={label}
                className="h-full w-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : (
          <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16 / 9", maxHeight: "calc(100svh - 7rem)" }}>
            {screen.kind === "youtube" && screen.ytId ? (
              <iframe
                src={youtubeEmbedUrl(screen.ytId)}
                title={label}
                className="absolute inset-0 h-full w-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={screen.picture ?? screen.url} alt={label} className="absolute inset-0 h-full w-full object-contain" />
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The screen's video file in its own shape (most are portrait reels), as tall
 * as the screen allows (STAGE_MEDIA.popup). It starts at once, with sound when
 * the browser allows it (the tap that opened the pop-up counts); otherwise
 * muted, with a "turn the sound on" button. A plain <video> without
 * crossOrigin, so the media host needs no CORS here (the 3D frames do), only
 * Range for iPhone.
 */
function PopupVideo({ screen, label, m }: { screen: StageScreen; label: string; m: Dict }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [aspect, setAspect] = useState(screen.aspect ?? 9 / 16);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);
  // Layout effect: still inside the tap that opened the pop-up, which iOS
  // needs before it plays sound.
  useLayoutEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    v.play().catch(() => {
      if (ref.current !== v) return;
      v.muted = true;
      setMuted(true);
      v.play().catch(() => {});
    });
  }, []);
  const unmute = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    setMuted(false);
    v.play().catch(() => {});
  };
  const { videoMaxH, reservedH } = STAGE_MEDIA.popup;
  return (
    <div className="relative mx-auto max-w-full">
      <video
        ref={ref}
        src={screen.url}
        poster={screen.picture ?? undefined}
        aria-label={label}
        className="block max-w-full rounded-xl bg-black object-contain"
        style={{ height: `min(calc(100svh - ${reservedH}px), ${videoMaxH}px)`, aspectRatio: String(aspect) }}
        controls
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
        }}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        onError={() => setFailed(true)}
      />
      {muted && !failed && (
        <button
          type="button"
          onClick={unmute}
          className="absolute left-1/2 top-4 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/25 bg-black/75 px-4 text-sm font-semibold text-white hover:border-white/50"
        >
          <Volume2 className="h-4 w-4" aria-hidden />
          {m.sml_unmute}
        </button>
      )}
      {failed && (
        <p role="status" className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-lg bg-black/80 px-3 py-2 text-center text-sm text-white">
          {m.sml_video_error}
        </p>
      )}
    </div>
  );
}
