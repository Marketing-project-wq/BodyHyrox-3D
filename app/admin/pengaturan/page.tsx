import { getSettings, getNotifications } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { can, NOTIFICATION_LABELS, type NotificationKey } from "@/lib/config";
import { getMessages } from "@/lib/i18n-server";
import { tNotif } from "@/lib/i18n";
import { SectionCard } from "@/components/ui";
import { updateSettings, updateNotifications } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function PengaturanPage() {
  const m = getMessages();
  const [settings, notifications, session] = await Promise.all([
    getSettings(),
    getNotifications(),
    getSession(),
  ]);
  const canManage = can(session?.role, "settings.manage");
  const notifKeys = Object.keys(NOTIFICATION_LABELS) as NotificationKey[];

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0 lg:overflow-y-auto">
      <div>
        <p className="text-sm text-muted">{m.set_subtitle}</p>
      </div>

      {!canManage && (
        <div className="card p-4 text-sm text-muted">{m.set_onlySuper}</div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title={m.set_profile}>
          <form action={updateSettings} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-faint">{m.set_name}</label>
              <input name="nama" defaultValue={settings.nama} disabled={!canManage} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-faint">{m.set_currency}</label>
              <input name="currency" defaultValue={settings.currency} disabled={!canManage} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-faint">{m.set_timezone}</label>
              <input name="timezone" defaultValue={settings.timezone} disabled={!canManage} className="input" />
            </div>
            {canManage && <button className="btn btn-primary" type="submit">{m.set_saveProfile}</button>}
          </form>
        </SectionCard>

        <SectionCard title={m.set_notifications}>
          <form action={updateNotifications} className="space-y-1">
            {notifKeys.map((key) => (
              <label key={key} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-2">
                <span className="text-sm text-text">{tNotif(m, key)}</span>
                <input
                  type="checkbox"
                  name={key}
                  defaultChecked={notifications[key]}
                  disabled={!canManage}
                  className="h-4 w-4 accent-[#e8112d]"
                />
              </label>
            ))}
            {canManage && (
              <div className="pt-3">
                <button className="btn btn-primary" type="submit">{m.set_saveNotifications}</button>
              </div>
            )}
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
