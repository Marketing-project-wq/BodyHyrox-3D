"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n";

export function LangToggle({ locale }: { locale: Locale }) {
  const router = useRouter();

  function choose(l: Locale) {
    if (l === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div className="flex gap-1 rounded-lg bg-white/10 p-0.5">
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => choose(l)}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold uppercase transition-colors ${
            locale === l ? "bg-accent text-white" : "text-sidebar-text hover:text-white"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
