import { getZones } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/config";
import { getMessages } from "@/lib/i18n-server";
import { ZonesClient } from "@/components/ZonesClient";

export const dynamic = "force-dynamic";

export default async function HargaZonaPage() {
  const [zones, session] = await Promise.all([getZones(), getSession()]);
  return <ZonesClient zones={zones} canPricing={can(session?.role, "zone.pricing")} m={getMessages()} />;
}
