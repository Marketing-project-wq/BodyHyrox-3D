import Link from "next/link";
import { requireBrandSession } from "@/lib/brand-auth";
import { isConfigured } from "@/lib/supabase";
import { getMyRequests, getCartCount } from "@/lib/data";
import { getLocale, getMessages } from "@/lib/i18n-server";
import { fmt } from "@/lib/i18n";
import { formatIDR, formatDayMonth } from "@/lib/format";
import { PublicHeader } from "@/components/PublicHeader";
import { BrandAccountNav } from "@/components/BrandAccountNav";
import { NotConfigured } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { checkout?: string; created?: string; skipped?: string };
}) {
  if (!isConfigured()) return <NotConfigured />;
  const s = requireBrandSession("/brand/dashboard");
  const m = getMessages();
  const locale = getLocale();

  const [reqs, cartCount] = await Promise.all([getMyRequests(s.sub), getCartCount(s.sub)]);
  const created = Number(searchParams.created || 0);
  const skipped = Number(searchParams.skipped || 0);

  const STATUS: Record<string, { label: string; cls: string }> = {
    pending: { label: m.dsh_status_pending, cls: "bg-amber-400/15 text-amber-300" },
    approved: { label: m.dsh_status_approved, cls: "bg-[#12b76a]/15 text-[#6ee7b7]" },
    rejected: { label: m.dsh_status_rejected, cls: "bg-[#ff3b57]/15 text-[#ff8a9c]" },
  };

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0d] text-[#f3f3f4]">
      <PublicHeader locale={locale} back={{ href: "/atlet", label: m.pub_back }} />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <BrandAccountNav active="dashboard" cartCount={cartCount} company={s.company} m={m} />
        <h1 className="mt-6 font-condensed text-3xl font-bold uppercase">{m.dsh_title}</h1>
        <p className="mt-1 text-sm text-white/55">{m.dsh_sub}</p>

        {searchParams.checkout && (
          <div className="mt-4 rounded-2xl border border-[#12b76a]/40 bg-[#12b76a]/10 p-4 text-sm text-white/80">
            {created > 0 ? fmt(m.dsh_checkout_created, { n: created }) : m.dsh_checkout_none}
            {skipped > 0 && <span className="text-[#ff8a9c]"> {fmt(m.dsh_checkout_skipped, { n: skipped })}</span>}
          </div>
        )}

        {reqs.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <p className="text-sm text-white/60">{m.dsh_empty}</p>
            <Link
              href="/atlet"
              className="mt-4 inline-block rounded-lg bg-[#ff3b57] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e42e48]"
            >
              {m.crt_browse}
            </Link>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-2.5">
            {reqs.map((r) => {
              const st = STATUS[r.status] ?? STATUS.pending;
              return (
                <li key={r.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/atlet/${r.athleteId}`} className="font-condensed text-base font-semibold uppercase hover:underline">
                      {r.athleteNama}
                    </Link>
                    <div className="text-xs text-white/50">
                      {fmt(m.crt_zone, { n: r.zoneNama })}
                      {r.eventNama && <span> · {r.eventNama}</span>}
                      {r.eventDate && <span> · {formatDayMonth(r.eventDate)}</span>}
                    </div>
                  </div>
                  <span className="tabnum hidden text-sm text-white/80 sm:inline">{formatIDR(r.price)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
