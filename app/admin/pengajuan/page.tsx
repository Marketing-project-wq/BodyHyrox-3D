import { requireSession } from "@/lib/auth";
import { can } from "@/lib/config";
import { getSponsorRequests } from "@/lib/data";
import { getMessages, getLocale } from "@/lib/i18n-server";
import { RequestsClient } from "@/components/RequestsClient";

export const dynamic = "force-dynamic";

export default async function PengajuanPage() {
  const s = requireSession();
  const m = getMessages();
  const locale = getLocale();
  const requests = await getSponsorRequests();
  return <RequestsClient requests={requests} m={m} locale={locale} canReview={can(s.role, "request.review")} />;
}
