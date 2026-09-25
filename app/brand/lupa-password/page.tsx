import Link from "next/link";
import { isConfigured } from "@/lib/supabase";
import { getLocale, getMessages } from "@/lib/i18n-server";
import { PublicHeader } from "@/components/PublicHeader";
import { NotConfigured } from "@/components/ui";
import { requestPasswordReset } from "@/app/brand/actions";

export const dynamic = "force-dynamic";

const field =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff3b57]";

export default function LupaPasswordPage({ searchParams }: { searchParams: { sent?: string } }) {
  if (!isConfigured()) return <NotConfigured />;
  const m = getMessages();
  const locale = getLocale();

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0d] text-[#f3f3f4]">
      <PublicHeader locale={locale} back={{ href: "/brand/masuk", label: m.ver_signin }} />
      <main className="mx-auto max-w-md px-5 py-14">
        <h1 className="font-condensed text-3xl font-bold uppercase">{m.fp_title}</h1>
        <p className="mt-2 text-sm text-white/55">{m.fp_sub}</p>
        {searchParams.sent ? (
          <div className="mt-6 rounded-2xl border border-[#12b76a]/40 bg-[#12b76a]/10 p-5 text-sm text-white/80">
            {m.fp_sent}
            <br />
            <br />
            <span className="text-white/55">{m.fp_sent_admin}</span>
          </div>
        ) : (
          <form action={requestPasswordReset} className="mt-6 flex flex-col gap-4">
            <div>
              <label className="text-xs text-white/50">{m.br_email}</label>
              <input name="email" type="email" required autoFocus className={field} />
            </div>
            <button className="mt-1 rounded-lg bg-[#ff3b57] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e42e48]">
              {m.fp_submit}
            </button>
          </form>
        )}
        <Link href="/brand/masuk" className="mt-5 inline-block text-sm text-[#ff3b57] hover:underline">
          {m.ver_back_login}
        </Link>
      </main>
    </div>
  );
}
