import { getSettings, getNotifications } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { can, NOTIFICATION_LABELS, type NotificationKey } from "@/lib/config";
import { SectionCard } from "@/components/ui";
import { updateSettings, updateNotifications } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function PengaturanPage() {
  const [settings, notifications, session] = await Promise.all([
    getSettings(),
    getNotifications(),
    getSession(),
  ]);
  const canManage = can(session?.role, "settings.manage");
  const notifKeys = Object.keys(NOTIFICATION_LABELS) as NotificationKey[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Pengaturan</h1>
        <p className="mt-1 text-sm text-muted">Profil platform &amp; preferensi notifikasi</p>
      </div>

      {!canManage && (
        <div className="card p-4 text-sm text-muted">
          Hanya <span className="text-text">Super Admin</span> yang dapat mengubah pengaturan.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Profil platform">
          <form action={updateSettings} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-faint">Nama platform</label>
              <input name="nama" defaultValue={settings.nama} disabled={!canManage} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-faint">Mata uang</label>
              <input name="currency" defaultValue={settings.currency} disabled={!canManage} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-faint">Zona waktu</label>
              <input name="timezone" defaultValue={settings.timezone} disabled={!canManage} className="input" />
            </div>
            {canManage && (
              <button className="btn btn-primary" type="submit">Simpan profil</button>
            )}
          </form>
        </SectionCard>

        <SectionCard title="Notifikasi">
          <form action={updateNotifications} className="space-y-1">
            {notifKeys.map((key) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-2"
              >
                <span className="text-sm text-text">{NOTIFICATION_LABELS[key]}</span>
                <input
                  type="checkbox"
                  name={key}
                  defaultChecked={notifications[key]}
                  disabled={!canManage}
                  className="h-4 w-4 accent-[#ff2d55]"
                />
              </label>
            ))}
            {canManage && (
              <div className="pt-3">
                <button className="btn btn-primary" type="submit">Simpan notifikasi</button>
              </div>
            )}
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
