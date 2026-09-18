import { requireSession } from "@/lib/auth";
import { getKpis, getAdminName } from "@/lib/data";
import { isConfigured } from "@/lib/supabase";
import { getLocale, getMessages } from "@/lib/i18n-server";
import { AdminShell } from "@/components/AdminShell";
import { NotConfigured } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isConfigured()) return <NotConfigured />;
  const session = requireSession();
  const [kpis, liveName] = await Promise.all([getKpis(), getAdminName(session.sub)]);
  return (
    <AdminShell
      session={{ nama: liveName ?? session.nama, role: session.role }}
      counts={{ athletes: kpis.athletes_active, brands: kpis.brands_total }}
      m={getMessages()}
      locale={getLocale()}
    >
      {children}
    </AdminShell>
  );
}
