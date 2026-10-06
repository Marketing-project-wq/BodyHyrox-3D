"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import { youtubeEmbedUrl, type StageScreen } from "@/lib/stage-media";

/**
 * One stage screen's media, full size: the official YouTube player
 * (youtube-nocookie, built from the id only), a video, or an image. Closes
 * with ×, Escape or a tap outside; focus moves in and comes back.
 */
export function StageMediaLightbox({ screen, m, onClose }: { screen: StageScreen; m: Dict; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
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
      onClick={onClose}
    >
      <div className="relative flex w-full max-w-5xl flex-col gap-2" onClick={(e) => e.stopPropagation()}>
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
          ) : screen.kind === "video" ? (
            <video src={screen.url} poster={screen.picture ?? undefined} className="absolute inset-0 h-full w-full object-contain" controls autoPlay muted playsInline />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={screen.picture ?? screen.url} alt={label} className="absolute inset-0 h-full w-full object-contain" />
          )}
        </div>
      </div>
    </div>
  );
}
