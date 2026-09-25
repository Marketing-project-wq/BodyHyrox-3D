import Link from "next/link";
import { isConfigured } from "@/lib/supabase";
import { getLocale, getMessages } from "@/lib/i18n-server";
import { PublicHeader } from "@/components/PublicHeader";
import { NotConfigured } from "@/components/ui";
import { consumePasswordReset } from "@/app/brand/actions";

export const dynamic = "force-dynamic";

const field =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff3b57]";

export default function ResetPage({
  searchParams,
}: {
  searchParams: { token?: string; error?: string };
}) {
  if (!isConfigured()) return <NotConfigured />;
  const m = getMessages();
  const locale = getLocale();
  const token = searchParams.token || "";
  const err =
    searchParams.error === "missing"
      ? "Password minimal 6 karakter."
      : searchParams.error
        ? "Link reset tidak valid atau sudah kedaluwarsa. Minta link baru."
        : null;

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0d] text-[#f3f3f4]">
      <PublicHeader locale={locale} back={{ href: "/brand/masuk", label: "Masuk" }} />
      <main className="mx-auto max-w-md px-5 py-14">
        <h1 className="font-condensed text-3xl font-bold uppercase">Atur password baru</h1>
        <p className="mt-2 text-sm text-white/55">Masukkan password baru untuk akun sponsor kamu.</p>
        {err && <p className="mt-4 rounded-lg bg-[#ff3b57]/15 px-3 py-2 text-sm text-[#ff8a9c]">{err}</p>}
        {!token ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/70">
            Link reset tidak lengkap. Buka link reset dari email kamu, atau{" "}
            <Link href="/brand/lupa-password" className="text-[#ff3b57] hover:underline">
              minta link baru
            </Link>
            .
          </div>
        ) : (
          <form action={consumePasswordReset} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="token" value={token} />
            <div>
              <label className="text-xs text-white/50">Password baru</label>
              <input name="password" type="password" required minLength={6} autoFocus className={field} />
            </div>
            <button className="mt-1 rounded-lg bg-[#ff3b57] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e42e48]">
              Simpan password baru
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
