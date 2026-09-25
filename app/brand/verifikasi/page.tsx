import Link from "next/link";
import { db } from "@/lib/supabase";
import { isConfigured } from "@/lib/supabase";
import { hashToken } from "@/lib/brand-auth";
import { getLocale, getMessages } from "@/lib/i18n-server";
import { fmt } from "@/lib/i18n";
import { PublicHeader } from "@/components/PublicHeader";
import { NotConfigured } from "@/components/ui";
import { resendVerification } from "@/app/brand/actions";

export const dynamic = "force-dynamic";

const field =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff3b57]";
const card = "mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6";

export default async function VerifikasiPage({
  searchParams,
}: {
  searchParams: { token?: string; sent?: string; pending?: string; email?: string; next?: string };
}) {
  if (!isConfigured()) return <NotConfigured />;
  const m = getMessages();
  const locale = getLocale();
  const email = searchParams.email || "";
  const next = searchParams.next && searchParams.next.startsWith("/") ? searchParams.next : "/atlet";

  let tokenState: "ok" | "invalid" | null = null;
  if (searchParams.token) {
    const { data } = await db().rpc("smb_brand_verify_email", {
      p_token_hash: hashToken(searchParams.token),
    });
    tokenState = data?.ok ? "ok" : "invalid";
  }

  const wrap = (children: React.ReactNode) => (
    <div className="min-h-[100dvh] bg-[#0b0b0d] text-[#f3f3f4]">
      <PublicHeader locale={locale} back={{ href: "/atlet", label: m.pub_back }} />
      <main className="mx-auto max-w-md px-5 py-14">{children}</main>
    </div>
  );

  if (tokenState === "ok") {
    return wrap(
      <div className={card}>
        <h1 className="font-condensed text-2xl font-bold uppercase">{m.ver_ok_title}</h1>
        <p className="mt-2 text-sm text-white/60">{m.ver_ok_body}</p>
        <Link
          href="/brand/masuk"
          className="mt-5 inline-block rounded-lg bg-[#ff3b57] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e42e48]"
        >
          {m.ver_signin}
        </Link>
      </div>,
    );
  }
  if (tokenState === "invalid") {
    return wrap(
      <div className={card}>
        <h1 className="font-condensed text-2xl font-bold uppercase">{m.ver_invalid_title}</h1>
        <p className="mt-2 text-sm text-white/60">{m.ver_invalid_body}</p>
        <form action={resendVerification} className="mt-5 flex flex-col gap-3">
          <input name="email" type="email" required defaultValue={email} placeholder={m.br_email} className={field} />
          <input type="hidden" name="next" value={next} />
          <button className="rounded-lg bg-[#ff3b57] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e42e48]">
            {m.ver_resend}
          </button>
        </form>
      </div>,
    );
  }

  return wrap(
    <>
      <h1 className="font-condensed text-3xl font-bold uppercase">{m.ver_title}</h1>
      {searchParams.pending ? (
        <div className={card}>
          <p className="text-sm text-white/70">{m.ver_pending}</p>
          {email && <p className="mt-2 text-sm text-white">{email}</p>}
        </div>
      ) : (
        <div className={card}>
          <p className="text-sm text-white/70">{fmt(m.ver_sent, { email: email || m.ver_your_email })}</p>
          <form action={resendVerification} className="mt-5 flex flex-col gap-3">
            <input name="email" type="email" required defaultValue={email} placeholder={m.br_email} className={field} />
            <input type="hidden" name="next" value={next} />
            <button className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5">
              {m.ver_resend}
            </button>
          </form>
        </div>
      )}
      <Link href="/brand/masuk" className="mt-5 inline-block text-sm text-[#ff3b57] hover:underline">
        {m.ver_back_login}
      </Link>
    </>,
  );
}
