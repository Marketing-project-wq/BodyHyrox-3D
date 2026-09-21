import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBrandSession } from "@/lib/brand-auth";
import { getPublicAthlete, getPublicEvents } from "@/lib/data";
import { isConfigured } from "@/lib/supabase";
import { getMessages, getLocale } from "@/lib/i18n-server";
import { formatIDR } from "@/lib/format";
import { PublicHeader } from "@/components/PublicHeader";
import { NotConfigured } from "@/components/ui";
import { submitSponsorRequest } from "@/app/brand/actions";

export const dynamic = "force-dynamic";

const field =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff3b57]";

export default async function AjukanPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { zone?: string; ok?: string; error?: string };
}) {
  if (!isConfigured()) return <NotConfigured />;
  const dest = `/atlet/${params.id}/ajukan${searchParams.zone ? `?zone=${searchParams.zone}` : ""}`;
  requireBrandSession(dest); // redirects to /brand/masuk if not signed in
  const m = getMessages();
  const locale = getLocale();
  const intl = locale === "id" ? "id-ID" : "en-US";

  const a = await getPublicAthlete(params.id);
  if (!a) notFound();
  const zone = a.zones.find((z) => z.athleteZoneId === searchParams.zone);

  const wrap = (children: React.ReactNode) => (
    <div className="min-h-[100dvh] bg-[#0b0b0d] text-[#f3f3f4]">
      <PublicHeader locale={locale} back={{ href: `/atlet/${a.id}`, label: a.nama }} />
      <main className="mx-auto max-w-lg px-5 py-14">{children}</main>
    </div>
  );

  if (searchParams.ok) {
    return wrap(
      <div className="rounded-2xl border border-[#12b76a]/40 bg-[#12b76a]/10 p-6 text-center">
        <h1 className="font-condensed text-2xl font-bold uppercase">{m.aj_success_title}</h1>
        <p className="mt-2 text-sm text-white/70">{m.aj_success_body}</p>
        <Link
          href={`/atlet/${a.id}`}
          className="mt-5 inline-block rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15"
        >
          {m.aj_back_athlete}
        </Link>
      </div>,
    );
  }

  if (!zone || zone.status !== "tersedia") {
    return wrap(
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="text-sm text-white/70">{m.aj_err_zone_unavailable}</p>
        <Link href={`/atlet/${a.id}`} className="mt-4 inline-block text-sm text-[#ff3b57] hover:underline">
          {m.aj_back_athlete}
        </Link>
      </div>,
    );
  }

  const events = (await getPublicEvents()).filter((e) => e.isOpen);
  const errMap: Record<string, string> = {
    zone_unavailable: m.aj_err_zone_unavailable,
    past_cutoff: m.aj_err_past_cutoff,
    duplicate: m.aj_err_duplicate,
  };
  const err = searchParams.error ? errMap[searchParams.error] ?? m.aj_err_generic : null;

  return wrap(
    <>
      <h1 className="font-condensed text-3xl font-bold uppercase">{m.aj_title}</h1>
      <p className="mt-2 text-sm text-white/55">{a.nama}</p>

      <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-white/40">{m.aj_zone}</div>
          <div className="font-condensed text-lg font-semibold uppercase">{zone.nama}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-white/40">{m.aj_price}</div>
          <div className="tabnum text-sm text-white">
            {formatIDR(zone.basePrice)} <span className="text-white/40">{m.pub_perEvent}</span>
          </div>
        </div>
      </div>

      {err && <p className="mt-4 rounded-lg bg-[#ff3b57]/15 px-3 py-2 text-sm text-[#ff8a9c]">{err}</p>}

      {events.length === 0 ? (
        <p className="mt-6 text-sm text-white/50">{m.aj_no_events}</p>
      ) : (
        <form action={submitSponsorRequest} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="athlete_id" value={a.id} />
          <input type="hidden" name="athlete_zone_id" value={zone.athleteZoneId} />
          <div>
            <label className="text-xs text-white/50">{m.aj_event}</label>
            <select name="event_id" required defaultValue="" className={field}>
              <option value="" disabled>
                {m.aj_choose_event}
              </option>
              {events.map((e) => (
                <option key={e.id} value={e.id} className="bg-[#141018]">
                  {e.nama} ·{" "}
                  {new Intl.DateTimeFormat(intl, { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(
                    new Date(e.date),
                  )}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/50">{m.aj_note}</label>
            <textarea name="note" rows={3} placeholder={m.aj_note_ph} className={field} />
          </div>
          <button className="mt-1 rounded-lg bg-[#ff3b57] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e42e48]">
            {m.aj_submit}
          </button>
        </form>
      )}
    </>,
  );
}
