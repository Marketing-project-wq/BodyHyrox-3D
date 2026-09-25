import { getBrandUsers } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/config";
import { SponsorAccountsClient } from "@/components/SponsorAccountsClient";

export const dynamic = "force-dynamic";

export default async function AkunSponsorPage({
  searchParams,
}: {
  searchParams: { created?: string; reset?: string; error?: string };
}) {
  const session = getSession();
  if (!can(session?.role, "sponsor_account.manage")) {
    return (
      <div className="card p-8 text-center text-faint">
        Hanya Super Admin yang dapat mengelola akun sponsor.
      </div>
    );
  }
  const accounts = await getBrandUsers();
  const notice = searchParams.created ? "created" : searchParams.reset ? "reset" : undefined;
  return <SponsorAccountsClient accounts={accounts} notice={notice} error={searchParams.error} />;
}
