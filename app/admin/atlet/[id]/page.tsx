import Link from "next/link";
import { getAdminAthlete, getEvents } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/config";
import { getMessages } from "@/lib/i18n-server";
import { AthleteEditorClient } from "@/components/AthleteEditorClient";

export const dynamic = "force-dynamic";

export default async function AtletDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { saved?: string };
}) {
  const [athlete, events, session] = await Promise.all([
    getAdminAthlete(params.id),
    getEvents(),
    getSession(),
  ]);
  const m = getMessages();

  if (!athlete) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/admin/atlet" className="text-sm text-muted hover:text-text">
          ← {m.ae_back}
        </Link>
        <div className="card p-8 text-center text-faint">{m.ae_notFound}</div>
      </div>
    );
  }

  return (
    <AthleteEditorClient
      athlete={athlete}
      events={events}
      canEdit={can(session?.role, "athlete.edit")}
      canPricing={can(session?.role, "zone.pricing")}
      saved={searchParams?.saved === "1"}
      m={m}
    />
  );
}
