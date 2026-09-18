import { getAthletes } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/config";
import { getMessages } from "@/lib/i18n-server";
import { AthletesClient } from "@/components/AthletesClient";

export const dynamic = "force-dynamic";

export default async function AtletPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const [athletes, session] = await Promise.all([getAthletes(), getSession()]);
  return (
    <AthletesClient
      athletes={athletes}
      canEdit={can(session?.role, "athlete.edit")}
      canToggle={can(session?.role, "athlete.toggle")}
      initialQuery={searchParams.q ?? ""}
      m={getMessages()}
    />
  );
}
