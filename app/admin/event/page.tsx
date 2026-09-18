import { getEvents } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/config";
import { getMessages, getLocale } from "@/lib/i18n-server";
import { EventsClient } from "@/components/EventsClient";

export const dynamic = "force-dynamic";

export default async function EventPage() {
  const [events, session] = await Promise.all([getEvents(), getSession()]);
  return (
    <EventsClient
      events={events}
      canManage={can(session?.role, "event.manage")}
      m={getMessages()}
      locale={getLocale()}
    />
  );
}
