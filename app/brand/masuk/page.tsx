import Link from "next/link";
import { redirect } from "next/navigation";
import { getBrandSession } from "@/lib/brand-auth";
import { isConfigured } from "@/lib/supabase";
import { getMessages, getLocale } from "@/lib/i18n-server";
import { PublicHeader } from "@/components/PublicHeader";
import { NotConfigured } from "@/components/ui";
import { brandLogin } from "@/app/brand/actions";

export const dynamic = "force-dynamic";

const field =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff3b57]";

export default function BrandLoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string; email?: string; reset?: string };
}) {
  if (!isConfigured()) return <NotConfigured />;
  const next = searchParams.next && searchParams.next.startsWith("/") ? searchParams.next : "/atlet";
  if (getBrandSession()) redirect(next);
  const m = getMessages();
  const locale = getLocale();
  const err =
    searchParams.error === "rate"
      ? m.br_err_rate
      : searchParams.error === "unverified"
        ? m.br_err_unverified
        : searchParams.error
          ? m.br_err_login
          : null;

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0d] text-[#f3f3f4]">
      <PublicHeader locale={locale} back={{ href: "/atlet", label: m.pub_back }} />
      <main className="mx-auto max-w-md px-5 py-14">
        <h1 className="font-condensed text-3xl font-bold uppercase">{m.br_login_title}</h1>
        <p className="mt-2 text-sm text-white/55">{m.br_login_sub}</p>
        {searchParams.reset && (
          <p className="mt-4 rounded-lg bg-[#12b76a]/15 px-3 py-2 text-sm text-[#6ee7b7]">{m.br_reset_notice}</p>
        )}
        {err && <p className="mt-4 rounded-lg bg-[#ff3b57]/15 px-3 py-2 text-sm text-[#ff8a9c]">{err}</p>}
        {searchParams.error === "unverified" && (
          <Link
            href={`/brand/verifikasi?email=${encodeURIComponent(searchParams.email || "")}&next=${encodeURIComponent(next)}`}
            className="mt-2 inline-block text-sm text-[#ff3b57] hover:underline"
          >
            {m.br_resend_link}
          </Link>
        )}
        <form action={brandLogin} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="text-xs text-white/50">{m.br_email}</label>
            <input name="email" type="email" required autoFocus defaultValue={searchParams.email || ""} className={field} />
          </div>
          <div>
            <label className="text-xs text-white/50">{m.br_password}</label>
            <input name="password" type="password" required className={field} />
          </div>
          <button className="mt-1 rounded-lg bg-[#ff3b57] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e42e48]">
            {m.br_signin}
          </button>
        </form>
        <div className="mt-5 flex items-center justify-between">
          <Link
            href={`/brand/daftar?next=${encodeURIComponent(next)}`}
            className="text-sm text-[#ff3b57] hover:underline"
          >
            {m.br_toRegister}
          </Link>
          <Link href="/brand/lupa-password" className="text-sm text-white/50 hover:text-white">
            {m.br_forgot}
          </Link>
        </div>
      </main>
    </div>
  );
}
