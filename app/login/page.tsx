import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isConfigured } from "@/lib/supabase";
import { NotConfigured } from "@/components/ui";
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  if (!isConfigured()) return <NotConfigured />;
  if (getSession()) redirect("/admin");

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-1 font-condensed text-3xl font-bold tracking-tight">
            <span>2</span>
            <span className="inline-block h-[0.5em] w-[0.5em] rounded-full bg-accent" />
            <span>FIT</span>
          </span>
          <p className="mt-1 text-sm text-muted">3D Sponsor · Panel Admin</p>
        </div>

        <form action={login} className="card space-y-4 p-6">
          <div>
            <label className="mb-1 block text-xs text-faint">Username</label>
            <input name="username" required autoFocus className="input" placeholder="username" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-faint">Password</label>
            <input name="password" type="password" required className="input" placeholder="••••••••" />
          </div>

          {searchParams.error && (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
              Username atau password salah.
            </p>
          )}

          <button type="submit" className="btn btn-primary w-full">Masuk</button>
        </form>

        <p className="mt-4 text-center text-xs text-faint">
          Akses terbatas untuk admin 20FIT.
        </p>
      </div>
    </div>
  );
}
