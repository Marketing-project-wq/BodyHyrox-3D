import { getBrandUsers } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/config";
import { getMessages } from "@/lib/i18n-server";
import { SponsorAccountsClient } from "@/components/SponsorAccountsClient";

export const dynamic = "force-dynamic";

export default async function AkunSponsorPage({
  searchParams,
}: {
  searchParams: { created?: string; reset?: string; error?: string };
}) {
  const session = getSession();
  const m = getMessages();
  if (!can(session?.role, "sponsor_account.manage")) {
    return <div className="card p-8 text-center text-faint">{m.sa_only_super}</div>;
  }
  const accounts = await getBrandUsers();
  const notice = searchParams.created ? "created" : searchParams.reset ? "reset" : undefined;
  return <SponsorAccountsClient accounts={accounts} notice={notice} error={searchParams.error} m={m} />;
}
