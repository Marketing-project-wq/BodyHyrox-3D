"use client";

import Link from "next/link";
import { Logo } from "@/components/ui";
import { LangToggle } from "@/components/LangToggle";
import type { Locale } from "@/lib/i18n";

export function PublicHeader({
  locale,
  back,
  overlay = false,
}: {
  locale: Locale;
  back?: { href: string; label: string };
  /** Float transparently over a full-screen hero instead of a solid sticky bar. */
  overlay?: boolean;
}) {
  return (
    <header
      className={
        overlay
          ? "absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-4 px-5 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] md:px-8"
          : "sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-[#0b0b0d]/90 px-5 py-3.5 backdrop-blur md:px-8"
      }
    >
      {/* Landing (/) is a static page served via rewrite, not an app route — use a
          plain anchor for a clean hard navigation (avoids a client-router flash). */}
      <a href="/" aria-label="20FIT" className="shrink-0">
        <Logo imgClassName="h-6" />
      </a>
      <div className="flex items-center gap-4">
        {back && (
          <Link href={back.href} className="text-sm text-white/70 transition-colors hover:text-white">
            ← {back.label}
          </Link>
        )}
        <LangToggle locale={locale} />
      </div>
    </header>
  );
}
