import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicAthlete } from "@/lib/data";
import { isConfigured } from "@/lib/supabase";
import { getMessages, getLocale } from "@/lib/i18n-server";
import { fmt, tGender } from "@/lib/i18n";
import { formatIDR, formatNumber } from "@/lib/format";
import { PublicHeader } from "@/components/PublicHeader";
import { NotConfigured } from "@/components/ui";

export const dynamic = "force-dynamic";

function raceDate(iso: string, intl: string) {
  return new Intl.DateTimeFormat(intl, { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(
    new Date(iso),
  );
}

export default async function AtletDetailPage({ params }: { params: { id: string } }) {
  if (!isConfigured()) return <NotConfigured />;
  const m = getMessages();
  const locale = getLocale();
  const intl = locale === "id" ? "id-ID" : "en-US";
  const a = await getPublicAthlete(params.id);
  if (!a) notFound();

  const available = a.zones.filter((z) => z.status === "tersedia").length;

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0d] text-[#f3f3f4]">
      <PublicHeader locale={locale} back={{ href: "/atlet", label: m.pub_back }} />
      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        {/* Profile */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-xs text-white/30">
            {a.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.photoUrl} alt={a.nama} className="h-full w-full object-cover" />
            ) : (
              "FOTO"
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-[#ff3b57]">
                {a.rank != null ? String(a.rank).padStart(2, "0") : "--"}
              </span>
              <h1 className="font-condensed text-3xl font-bold uppercase leading-none sm:text-4xl">{a.nama}</h1>
            </div>
            <p className="mt-1.5 text-sm text-white/55">
              {a.discipline ?? tGender(m, a.gender)} · {a.kota} · {a.handle}
            </p>
            <p className="mt-2 text-sm text-white/70">
              <span className="tabnum font-semibold text-white">{formatNumber(a.podiumCount)}</span> {m.pub_podiums}
              {"  ·  "}
              <span className="tabnum font-semibold text-white">{formatNumber(a.framesPerSeason)}</span> {m.pub_framesSeason}
            </p>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr]">
          {/* Zones */}
          <section>
            <h2 className="font-condensed text-xl font-bold uppercase tracking-wide">{m.pub_zonesTitle}</h2>
            <p className="mt-1 text-xs text-white/50">
              {available > 0 ? fmt(m.pub_zonesAvailable, { n: formatNumber(available) }) : m.pub_zonesAllTaken}
            </p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {a.zones.map((z) => {
                const taken = z.status === "terisi";
                return (
                  <li
                    key={z.athleteZoneId}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                      taken ? "border-white/10 bg-white/[0.02]" : "border-white/10 bg-white/[0.04]"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-condensed text-base font-semibold uppercase ${taken ? "text-white/45" : ""}`}>
                          {z.nama}
                        </span>
                        {z.exclusive && (
                          <span className="rounded-full border border-[#ff3b57]/50 px-2 py-0.5 font-mono text-[10px] uppercase text-[#ff3b57]">
                            {m.pub_exclusive}
                          </span>
                        )}
                      </div>
                    </div>
                    {taken ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs text-white/45">
                        <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                        {m.pub_taken}
                      </span>
                    ) : (
                      <>
                        <span className="tabnum text-sm text-white">{formatIDR(z.basePrice)}</span>
                        <Link
                          href={`/atlet/${a.id}/ajukan?zone=${z.athleteZoneId}`}
                          className="shrink-0 rounded-full bg-[#ff3b57] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#e42e48]"
                        >
                          {m.pub_apply}
                        </Link>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Race history */}
          <section>
            <h2 className="font-condensed text-xl font-bold uppercase tracking-wide">{m.pub_raceTitle}</h2>
            {a.races.length === 0 ? (
              <p className="mt-3 text-sm text-white/45">{m.pub_noRaces}</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2.5">
                {a.races.map((r, i) => (
                  <li key={i} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-condensed text-base font-semibold uppercase">{r.event}</span>
                      {r.isPodium && r.placement != null ? (
                        <span className="shrink-0 rounded-full bg-[#ff3b57]/15 px-2.5 py-0.5 font-mono text-[10px] uppercase text-[#ff3b57]">
                          {fmt(m.pub_podiumBadge, { n: String(r.placement) })}
                        </span>
                      ) : (
                        <span className="shrink-0 font-mono text-[10px] uppercase text-white/40">{m.pub_finished}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-white/50">
                      {r.venue} · <span className="tabnum">{raceDate(r.date, intl)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
