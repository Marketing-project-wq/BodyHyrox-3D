import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isConfigured } from "@/lib/supabase";
import { getMessages } from "@/lib/i18n-server";
import { Logo, NotConfigured } from "@/components/ui";
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  if (!isConfigured()) return <NotConfigured />;
  if (getSession()) redirect("/admin");
  const m = getMessages();

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo imgClassName="h-10" />
          <p className="mt-3 text-sm text-muted">{m.login_subtitle}</p>
        </div>

        <form action={login} className="card space-y-4 p-6">
          <div>
            <label className="mb-1 block text-xs text-faint">{m.login_username}</label>
            <input name="username" required autoFocus className="input" placeholder="username" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-faint">{m.login_password}</label>
            <input name="password" type="password" required className="input" placeholder="••••••••" />
          </div>

          {searchParams.error && (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{m.login_error}</p>
          )}

          <button type="submit" className="btn btn-primary w-full">{m.login_button}</button>
        </form>

        <p className="mt-4 text-center text-xs text-faint">{m.login_accessLimited}</p>
      </div>
    </div>
  );
}
