import Link from "next/link";
import { redirect } from "next/navigation";
import { getBrandSession } from "@/lib/brand-auth";
import { isConfigured } from "@/lib/supabase";
import { getMessages, getLocale } from "@/lib/i18n-server";
import { PublicHeader } from "@/components/PublicHeader";
import { NotConfigured } from "@/components/ui";
import { brandRegister } from "@/app/brand/actions";

export const dynamic = "force-dynamic";

const field =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff3b57]";

export default function BrandRegisterPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  if (!isConfigured()) return <NotConfigured />;
  const next = searchParams.next && searchParams.next.startsWith("/") ? searchParams.next : "/atlet";
  if (getBrandSession()) redirect(next);
  const m = getMessages();
  const locale = getLocale();
  const err =
    searchParams.error === "email_exists"
      ? m.br_err_email_exists
      : searchParams.error
        ? m.br_err_missing
        : null;

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0d] text-[#f3f3f4]">
      <PublicHeader locale={locale} back={{ href: "/atlet", label: m.pub_back }} />
      <main className="mx-auto max-w-md px-5 py-14">
        <h1 className="font-condensed text-3xl font-bold uppercase">{m.br_register_title}</h1>
        <p className="mt-2 text-sm text-white/55">{m.br_register_sub}</p>
        {err && <p className="mt-4 rounded-lg bg-[#ff3b57]/15 px-3 py-2 text-sm text-[#ff8a9c]">{err}</p>}
        <form action={brandRegister} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="text-xs text-white/50">{m.br_company}</label>
            <input name="company" required autoFocus className={field} />
          </div>
          <div>
            <label className="text-xs text-white/50">{m.br_kategori}</label>
            <input name="kategori" className={field} placeholder="Sport / F&B / Apparel…" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-white/50">{m.br_nama_pic}</label>
              <input name="nama_pic" required className={field} />
            </div>
            <div>
              <label className="text-xs text-white/50">{m.br_no_hp}</label>
              <input name="no_hp" className={field} placeholder="08…" />
            </div>
          </div>
          <div>
            <label className="text-xs text-white/50">{m.br_email}</label>
            <input name="email" type="email" required className={field} />
          </div>
          <div>
            <label className="text-xs text-white/50">{m.br_password}</label>
            <input name="password" type="password" required minLength={6} className={field} />
          </div>
          <button className="mt-1 rounded-lg bg-[#ff3b57] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e42e48]">
            {m.br_signup}
          </button>
        </form>
        <Link
          href={`/brand/masuk?next=${encodeURIComponent(next)}`}
          className="mt-5 inline-block text-sm text-[#ff3b57] hover:underline"
        >
          {m.br_toLogin}
        </Link>
      </main>
    </div>
  );
}
