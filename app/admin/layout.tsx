import { requireSession } from "@/lib/auth";
import { getKpis } from "@/lib/data";
import { isConfigured } from "@/lib/supabase";
import { formatDateTimeWIB } from "@/lib/format";
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
  const kpis = await getKpis();
  const dataPer = formatDateTimeWIB(new Date());
  return (
    <AdminShell
      session={{ nama: session.nama, role: session.role }}
      counts={{ athletes: kpis.athletes_active, brands: kpis.brands_total }}
      dataPer={dataPer}
    >
      {children}
    </AdminShell>
  );
}
