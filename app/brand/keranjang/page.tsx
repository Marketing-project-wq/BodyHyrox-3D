import Link from "next/link";
import { requireBrandSession } from "@/lib/brand-auth";
import { isConfigured } from "@/lib/supabase";
import { getCart, getPublicEvents } from "@/lib/data";
import { getLocale, getMessages } from "@/lib/i18n-server";
import { fmt } from "@/lib/i18n";
import { formatIDR, formatDayMonth } from "@/lib/format";
import { PublicHeader } from "@/components/PublicHeader";
import { BrandAccountNav } from "@/components/BrandAccountNav";
import { NotConfigured } from "@/components/ui";
import { cartRemove, cartCheckout } from "@/app/brand/actions";

export const dynamic = "force-dynamic";

export default async function KeranjangPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  if (!isConfigured()) return <NotConfigured />;
  const s = requireBrandSession("/brand/keranjang");
  const m = getMessages();
  const locale = getLocale();

  const [items, events] = await Promise.all([getCart(s.sub), getPublicEvents()]);
  const openEvents = events.filter((e) => e.isOpen);
  const available = items.filter((i) => i.available);
  const subtotal = available.reduce((sum, i) => sum + i.effectivePrice, 0);

  const ERR: Record<string, string> = {
    empty: m.crt_err_empty,
    not_verified: m.crt_err_not_verified,
    event_not_found: m.crt_err_event_not_found,
    event_closed: m.crt_err_event_closed,
    past_cutoff: m.crt_err_past_cutoff,
    brand_invalid: m.crt_err_brand_invalid,
    failed: m.crt_err_failed,
  };
  const err = searchParams.error ? ERR[searchParams.error] ?? m.crt_err_failed : null;

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0d] text-[#f3f3f4]">
      <PublicHeader locale={locale} back={{ href: "/atlet", label: m.pub_back }} />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <BrandAccountNav active="keranjang" cartCount={items.length} company={s.company} m={m} />
        <h1 className="mt-6 font-condensed text-3xl font-bold uppercase">{m.crt_title}</h1>

        {err && <p className="mt-4 rounded-lg bg-[#ff3b57]/15 px-3 py-2 text-sm text-[#ff8a9c]">{err}</p>}

        {items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <p className="text-sm text-white/60">{m.crt_empty}</p>
            <Link
              href="/atlet"
              className="mt-4 inline-block rounded-lg bg-[#ff3b57] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e42e48]"
            >
              {m.crt_browse}
            </Link>
          </div>
        ) : (
          <>
            <ul className="mt-6 flex flex-col gap-2.5">
              {items.map((i) => (
                <li
                  key={i.id}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                    i.available ? "border-white/10 bg-white/[0.04]" : "border-[#ff3b57]/30 bg-[#ff3b57]/[0.06]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <Link href={`/atlet/${i.athleteId}`} className="font-condensed text-base font-semibold uppercase hover:underline">
                      {i.athleteNama}
                    </Link>
                    <div className="text-xs text-white/50">
                      {fmt(m.crt_zone, { n: i.zoneNama })}
                      {!i.available && <span className="ml-2 text-[#ff8a9c]">· {m.crt_unavailable}</span>}
                      {i.note && <span className="ml-2 text-white/40">· {i.note}</span>}
                    </div>
                  </div>
                  <span className="tabnum text-sm text-white">{formatIDR(i.effectivePrice)}</span>
                  <form action={cartRemove}>
                    <input type="hidden" name="item_id" value={i.id} />
                    <button className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs text-white/60 hover:bg-white/5 hover:text-white">
                      {m.crt_remove}
                    </button>
                  </form>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <span className="text-sm text-white/55">{fmt(m.crt_subtotal, { n: available.length })}</span>
              <span className="tabnum text-lg font-semibold text-white">{formatIDR(subtotal)}</span>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="font-condensed text-lg font-semibold uppercase">{m.crt_checkout_h}</h2>
              <p className="mt-1 text-xs text-white/50">{m.crt_checkout_hint}</p>
              {openEvents.length === 0 ? (
                <p className="mt-4 text-sm text-white/50">{m.crt_no_events}</p>
              ) : (
                <form action={cartCheckout} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="text-xs text-white/50">{m.crt_event}</label>
                    <select
                      name="event_id"
                      required
                      defaultValue=""
                      className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-[#ff3b57]"
                    >
                      <option value="" disabled>
                        {m.crt_choose_event}
                      </option>
                      {openEvents.map((e) => (
                        <option key={e.id} value={e.id} className="bg-[#141018]">
                          {e.nama} · {formatDayMonth(e.date)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    disabled={available.length === 0}
                    className="rounded-lg bg-[#ff3b57] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e42e48] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {m.crt_checkout_btn}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
