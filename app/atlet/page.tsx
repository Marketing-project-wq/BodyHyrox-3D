import Link from "next/link";
import { getPublicAthletes } from "@/lib/data";
import { isConfigured } from "@/lib/supabase";
import { getMessages, getLocale } from "@/lib/i18n-server";
import { fmt, tGender } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { PublicHeader } from "@/components/PublicHeader";
import { NotConfigured } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AtletPage() {
  if (!isConfigured()) return <NotConfigured />;
  const m = getMessages();
  const locale = getLocale();
  const athletes = await getPublicAthletes();

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0d] text-[#f3f3f4]">
      <PublicHeader locale={locale} />
      <main className="mx-auto max-w-6xl px-5 py-10 md:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#ff3b57]">{m.pub_eyebrow}</p>
        <h1 className="mt-3 font-condensed text-4xl font-bold uppercase leading-[0.95] sm:text-5xl">
          {m.pub_title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">{m.pub_lead}</p>

        {athletes.length === 0 ? (
          <p className="mt-12 text-white/50">{m.pub_none}</p>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {athletes.map((a) => (
              <Link
                key={a.id}
                href={`/atlet/${a.id}`}
                className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-[#ff3b57]/60 hover:bg-white/[0.05]"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5 text-[10px] text-white/30">
                    {a.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.photoUrl} alt={a.nama} className="h-full w-full object-cover" />
                    ) : (
                      "FOTO"
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#ff3b57]">
                        {a.rank != null ? String(a.rank).padStart(2, "0") : "--"}
                      </span>
                      <h2 className="truncate font-condensed text-xl font-bold uppercase leading-none">{a.nama}</h2>
                    </div>
                    <p className="mt-1 truncate text-xs text-white/50">
                      {a.discipline ?? tGender(m, a.gender)} · {a.kota}
                    </p>
                    <p className="mt-1.5 text-xs text-white/60">
                      <span className="tabnum text-white">{formatNumber(a.podiumCount)}</span> {m.pub_podiums}
                      {" · "}
                      <span className="tabnum text-white">{formatNumber(a.framesPerSeason)}</span> {m.pub_framesSeason}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="text-xs text-white/70">
                    {a.zonesAvailable > 0
                      ? fmt(m.pub_zonesAvailable, { n: formatNumber(a.zonesAvailable) })
                      : m.pub_zonesAllTaken}
                  </span>
                  <span className="text-xs font-medium text-[#ff3b57] group-hover:underline">
                    {m.pub_viewDetail} →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
