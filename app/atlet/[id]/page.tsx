import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicAthlete, getPublicAthletes, getCartCount } from "@/lib/data";
import { isConfigured } from "@/lib/supabase";
import { getBrandSession } from "@/lib/brand-auth";
import { getMessages, getLocale } from "@/lib/i18n-server";
import { fmt } from "@/lib/i18n";
import { formatIDR, formatNumber } from "@/lib/format";
import { PublicHeader } from "@/components/PublicHeader";
import { AthleteStageCard } from "@/components/AthleteStageCard";
import { NotConfigured } from "@/components/ui";

export const dynamic = "force-dynamic";

function raceDate(iso: string, intl: string) {
  return new Intl.DateTimeFormat(intl, { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(
    new Date(iso),
  );
}

export default async function AtletDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { cart?: string };
}) {
  if (!isConfigured()) return <NotConfigured />;
  const m = getMessages();
  const locale = getLocale();
  const intl = locale === "id" ? "id-ID" : "en-US";

  const [a, list] = await Promise.all([getPublicAthlete(params.id), getPublicAthletes()]);
  if (!a) notFound();

  // Athlete carousel (arrows + dots) navigates the public roster, wrapping around.
  const idx = list.findIndex((x) => x.id === a.id);
  const prev = list.length > 1 ? list[(idx - 1 + list.length) % list.length] : null;
  const next = list.length > 1 ? list[(idx + 1) % list.length] : null;
  const dots = list.map((x) => ({ id: x.id, active: x.id === a.id }));

  const brand = getBrandSession();
  const cartCount = brand ? await getCartCount(brand.sub) : 0;
  const cartMsg =
    searchParams?.cart === "added"
      ? { ok: true, text: m.cart_add + " ✓" }
      : searchParams?.cart && searchParams.cart !== "added"
        ? { ok: false, text: m.pub_cart_unavailable }
        : null;

  const available = a.zones.filter((z) => z.status === "tersedia").length;

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-[#f3f3f4]">
      <PublicHeader locale={locale} back={{ href: "/atlet", label: m.pub_back }} />

      <div className="mx-auto w-full max-w-6xl px-4 pb-4 pt-4 sm:px-6">
        <AthleteStageCard athlete={a} prev={prev} next={next} dots={dots} locale={locale} m={m} />
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {brand && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm">
            <span className="text-white/55">
              {m.br_signedInAs} <span className="text-white">{brand.company}</span>
            </span>
            <div className="flex items-center gap-4">
              <Link href="/brand/keranjang" className="text-white/70 hover:text-white">
                {m.cart_view}
                {cartCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-[#ff2d55] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {cartCount}
                  </span>
                )}
              </Link>
              <Link href="/brand/dashboard" className="text-white/70 hover:text-white">
                {m.pub_dashboard}
              </Link>
            </div>
          </div>
        )}

        {cartMsg && (
          <div
            className={`mb-6 rounded-xl border px-4 py-2.5 text-sm ${
              cartMsg.ok
                ? "border-[#12b76a]/40 bg-[#12b76a]/10 text-[#6ee7b7]"
                : "border-[#ff2d55]/40 bg-[#ff2d55]/10 text-[#ff8a9c]"
            }`}
          >
            {cartMsg.text}
            {cartMsg.ok && (
              <Link href="/brand/keranjang" className="ml-2 underline hover:no-underline">
                {m.cart_view}
              </Link>
            )}
          </div>
        )}

        {/* Zones + race history */}
        <div id="zona-sponsor" className="grid scroll-mt-20 grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr]">
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
                          <span className="rounded-full border border-[#ff2d55]/50 px-2 py-0.5 font-mono text-[10px] uppercase text-[#ff2d55]">
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
                          className="shrink-0 rounded-full bg-[#ff2d55] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#e42648]"
                        >
                          {m.cart_add}
                        </Link>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

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
                        <span className="shrink-0 rounded-full bg-[#ff2d55]/15 px-2.5 py-0.5 font-mono text-[10px] uppercase text-[#ff2d55]">
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
