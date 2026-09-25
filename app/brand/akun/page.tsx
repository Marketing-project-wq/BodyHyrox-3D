import { requireBrandSession } from "@/lib/brand-auth";
import { isConfigured } from "@/lib/supabase";
import { getCartCount } from "@/lib/data";
import { getLocale, getMessages } from "@/lib/i18n-server";
import { PublicHeader } from "@/components/PublicHeader";
import { BrandAccountNav } from "@/components/BrandAccountNav";
import { NotConfigured } from "@/components/ui";
import { changePassword } from "@/app/brand/actions";

export const dynamic = "force-dynamic";

const field =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff3b57]";

const ERR: Record<string, string> = {
  weak: "Password baru minimal 6 karakter.",
  wrong_current: "Password saat ini salah.",
  failed: "Gagal mengganti password. Coba lagi.",
};

export default async function AkunPage({
  searchParams,
}: {
  searchParams: { change?: string; changed?: string; error?: string };
}) {
  if (!isConfigured()) return <NotConfigured />;
  const s = requireBrandSession("/brand/akun");
  const m = getMessages();
  const locale = getLocale();
  const cartCount = await getCartCount(s.sub);
  const err = searchParams.error ? ERR[searchParams.error] ?? ERR.failed : null;

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0d] text-[#f3f3f4]">
      <PublicHeader locale={locale} back={{ href: "/atlet", label: m.pub_back }} />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <BrandAccountNav active="akun" cartCount={cartCount} company={s.company} />
        <h1 className="mt-6 font-condensed text-3xl font-bold uppercase">Akun</h1>

        {searchParams.change && (
          <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200">
            Demi keamanan, atur password baru dulu sebelum melanjutkan.
          </div>
        )}
        {searchParams.changed && (
          <div className="mt-4 rounded-2xl border border-[#12b76a]/40 bg-[#12b76a]/10 p-4 text-sm text-[#6ee7b7]">
            Password berhasil diganti.
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-semibold text-white">Profil</h2>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-white/40">Brand</dt>
              <dd className="text-white">{s.company}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/40">Email</dt>
              <dd className="text-white">{s.email}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-semibold text-white">Ganti password</h2>
          {err && <p className="mt-3 rounded-lg bg-[#ff3b57]/15 px-3 py-2 text-sm text-[#ff8a9c]">{err}</p>}
          <form action={changePassword} className="mt-4 flex flex-col gap-4">
            <div>
              <label className="text-xs text-white/50">Password saat ini</label>
              <input name="current" type="password" required className={field} />
            </div>
            <div>
              <label className="text-xs text-white/50">Password baru</label>
              <input name="new" type="password" required minLength={6} className={field} />
            </div>
            <button className="mt-1 self-start rounded-lg bg-[#ff3b57] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e42e48]">
              Simpan password baru
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
