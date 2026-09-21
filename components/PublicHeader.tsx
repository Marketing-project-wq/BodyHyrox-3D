"use client";

import Link from "next/link";
import { Logo } from "@/components/ui";
import { LangToggle } from "@/components/LangToggle";
import type { Locale } from "@/lib/i18n";

export function PublicHeader({
  locale,
  back,
}: {
  locale: Locale;
  back?: { href: string; label: string };
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-[#0b0b0d]/90 px-5 py-3.5 backdrop-blur md:px-8">
      <Link href="/" aria-label="20FIT" className="shrink-0">
        <Logo imgClassName="h-6" />
      </Link>
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
