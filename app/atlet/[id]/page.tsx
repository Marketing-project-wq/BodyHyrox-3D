import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicAthlete, getCartCount } from "@/lib/data";
import { isConfigured } from "@/lib/supabase";
import { getBrandSession } from "@/lib/brand-auth";
import { getMessages, getLocale } from "@/lib/i18n-server";
import { fmt, tGender } from "@/lib/i18n";
import { formatIDR, formatNumber, initials } from "@/lib/format";
import { viewer360FrameStyle } from "@/lib/config";
import { VIEWER_3D } from "@/lib/viewer3d";
import { PublicHeader } from "@/components/PublicHeader";
import { Viewer360 } from "@/components/Viewer360";
import { AthleteViewer3D } from "@/components/AthleteViewer";
import { AthleteStage } from "@/components/AthleteStage";
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
  searchParams?: { v?: string; cart?: string };
}) {
  if (!isConfigured()) return <NotConfigured />;
  const m = getMessages();
  const locale = getLocale();
  const intl = locale === "id" ? "id-ID" : "en-US";
  const a = await getPublicAthlete(params.id);
  if (!a) notFound();

  // Public page = read-only viewer + prices for everyone (sponsors & visitors).
  // Admins manage 360 photos from the admin editor (/admin/atlet/[id] → Manage).
  const brand = getBrandSession();
  const cartCount = brand ? await getCartCount(brand.sub) : 0;
  const cartMsg =
    searchParams?.cart === "added"
      ? { ok: true, text: m.cart_add + " ✓" }
      : searchParams?.cart && searchParams.cart !== "added"
        ? { ok: false, text: m.pub_cart_unavailable }
        : null;

  const available = a.zones.filter((z) => z.status === "tersedia").length;
  const has360 = !!a.media360 && a.media360.frames.length > 0;
  // 3D viewer default is controlled by VIEWER_3D.enabledFor (per-athlete), so the
  // placeholder mannequin doesn't show site-wide. ?v=3d forces it on for anyone,
  // ?v=photo forces the photo viewer.
  const want3d = searchParams?.v === "3d" || (searchParams?.v !== "photo" && VIEWER_3D.enabledFor.includes(a.id));

  const chips = [
    { n: a.podiumCount, label: m.pub_podiums },
    { n: a.framesPerSeason, label: m.pub_framesSeason },
    { n: available, label: m.pub_openZones },
  ];

  const figure = has360 ? (
    <Viewer360 athleteId={a.id} media={a.media360!} m={m} />
  ) : (
    // No 360: the athlete photo (or initials) stands on the stage too —
    // transparent, height-capped, with the same ground-contact shadow.
    <div className="relative mx-auto" style={viewer360FrameStyle()}>
      <div className="stage-contact" aria-hidden />
      {a.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.photoUrl} alt={a.nama} className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center font-condensed text-6xl font-bold text-white/25">
          {initials(a.nama)}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-[#0b0b0d] text-[#f3f3f4]">
      {/* Full-screen neon-stage hero: athlete + moving stage fill the viewport */}
      <section className="relative h-[100dvh] w-full overflow-hidden">
        <PublicHeader locale={locale} overlay back={{ href: "/atlet", label: m.pub_back }} />

        <AthleteStage>
          {want3d ? (
            <AthleteViewer3D athleteId={a.id} media={a.media360} zones={a.zones} m={m} />
          ) : (
            <div className="mx-auto w-full" style={{ maxWidth: "min(300px, 82vw)" }}>
              {figure}
            </div>
          )}
        </AthleteStage>

        {/* Athlete name + meta — overlay near the top */}
        <div className="pointer-events-none absolute inset-x-0 top-14 z-20 px-5 md:px-8">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-sm text-[#ff3b57]">
              {a.rank != null ? String(a.rank).padStart(2, "0") : "--"}
            </span>
            <h1 className="font-condensed text-3xl font-bold uppercase leading-[0.95] drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-4xl">
              {a.nama}
            </h1>
          </div>
          <p className="mt-1 text-sm text-white/55">
            {a.discipline ?? tGender(m, a.gender)} · {a.kota} · {a.handle}
          </p>
        </div>

        {/* Primary CTA — overlay near the bottom (scrolls to zones) */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <a
            href="#zona-sponsor"
            className="rounded-full bg-[#ff3b57] px-8 py-3 text-sm font-semibold text-white shadow-[0_0_26px_rgba(255,45,85,0.45)] transition-colors hover:bg-[#e42e48]"
          >
            {m.pub_viewSponsors}
          </a>
        </div>
      </section>

      {/* Below the fold: short context + sponsor zones + race history */}
      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-12">
        {brand && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm">
            <span className="text-white/55">
              {m.br_signedInAs} <span className="text-white">{brand.company}</span>
            </span>
            <div className="flex items-center gap-4">
              <Link href="/brand/keranjang" className="text-white/70 hover:text-white">
                {m.cart_view}
                {cartCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-[#ff3b57] px-1.5 py-0.5 text-[10px] font-semibold text-white">
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
                : "border-[#ff3b57]/40 bg-[#ff3b57]/10 text-[#ff8a9c]"
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

        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <p className="max-w-xl text-sm leading-relaxed text-white/60">{m.pub_stageCaption}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {chips.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65"
              >
                <span className="tabnum font-semibold text-white">{formatNumber(c.n)}</span> {c.label}
              </span>
            ))}
          </div>
        </div>

        {/* Zones + race history */}
        <div id="zona-sponsor" className="grid scroll-mt-24 grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr]">
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
                          {m.cart_add}
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
