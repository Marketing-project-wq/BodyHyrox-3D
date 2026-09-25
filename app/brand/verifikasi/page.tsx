import Link from "next/link";
import { db } from "@/lib/supabase";
import { isConfigured } from "@/lib/supabase";
import { hashToken } from "@/lib/brand-auth";
import { getLocale, getMessages } from "@/lib/i18n-server";
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
        <h1 className="font-condensed text-2xl font-bold uppercase">Email terverifikasi ✓</h1>
        <p className="mt-2 text-sm text-white/60">Akun kamu sudah aktif. Silakan masuk untuk mulai mengajukan sponsor.</p>
        <Link
          href="/brand/masuk"
          className="mt-5 inline-block rounded-lg bg-[#ff3b57] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e42e48]"
        >
          Masuk
        </Link>
      </div>,
    );
  }
  if (tokenState === "invalid") {
    return wrap(
      <div className={card}>
        <h1 className="font-condensed text-2xl font-bold uppercase">Link tidak valid</h1>
        <p className="mt-2 text-sm text-white/60">
          Link verifikasi tidak valid atau sudah kedaluwarsa. Masukkan email untuk kirim ulang link verifikasi.
        </p>
        <form action={resendVerification} className="mt-5 flex flex-col gap-3">
          <input name="email" type="email" required defaultValue={email} placeholder="Email" className={field} />
          <input type="hidden" name="next" value={next} />
          <button className="rounded-lg bg-[#ff3b57] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e42e48]">
            Kirim ulang verifikasi
          </button>
        </form>
      </div>,
    );
  }

  // No token: "check your email" (or pending admin verification if email is off)
  return wrap(
    <>
      <h1 className="font-condensed text-3xl font-bold uppercase">Verifikasi email</h1>
      {searchParams.pending ? (
        <div className={card}>
          <p className="text-sm text-white/70">
            Akun kamu sudah dibuat{email ? ` untuk ${email}` : ""}. Layanan email verifikasi belum aktif, jadi admin
            akan memverifikasi akunmu sebentar lagi. Kamu bisa masuk setelah diverifikasi.
          </p>
        </div>
      ) : (
        <div className={card}>
          <p className="text-sm text-white/70">
            Kami mengirim link verifikasi ke <span className="text-white">{email || "email kamu"}</span>. Buka email itu
            dan klik link-nya untuk mengaktifkan akun (berlaku 48 jam). Cek juga folder spam.
          </p>
          <form action={resendVerification} className="mt-5 flex flex-col gap-3">
            <input name="email" type="email" required defaultValue={email} placeholder="Email" className={field} />
            <input type="hidden" name="next" value={next} />
            <button className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5">
              Kirim ulang verifikasi
            </button>
          </form>
        </div>
      )}
      <Link href="/brand/masuk" className="mt-5 inline-block text-sm text-[#ff3b57] hover:underline">
        Kembali ke halaman masuk
      </Link>
    </>,
  );
}
