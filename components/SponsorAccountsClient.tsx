"use client";

import { useMemo, useState } from "react";
import type { BrandUserRow } from "@/lib/data";
import {
  createSponsorAccount,
  resetSponsorPassword,
  setSponsorStatus,
  verifySponsorEmail,
} from "@/app/admin/akun-sponsor/actions";

const input =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-[#ff3b57]";
const label = "mb-1 block text-xs text-faint";

/** Strong, human-friendly random password (avoids ambiguous chars). */
function genPassword(len = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (v) => alphabet[v % alphabet.length]).join("");
}

const NOTICE: Record<string, string> = {
  created: "Akun sponsor berhasil dibuat.",
  reset: "Password akun berhasil direset.",
};
const ERR: Record<string, string> = {
  missing: "Lengkapi data wajib (password minimal 6 karakter).",
  email_exists: "Email itu sudah dipakai akun lain.",
  failed: "Aksi gagal. Coba lagi.",
};

export function SponsorAccountsClient({
  accounts,
  notice,
  error,
}: {
  accounts: BrandUserRow[];
  notice?: string;
  error?: string;
}) {
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [resetFor, setResetFor] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return accounts;
    return accounts.filter(
      (a) =>
        a.company.toLowerCase().includes(t) ||
        a.email.toLowerCase().includes(t) ||
        (a.namaPic ?? "").toLowerCase().includes(t),
    );
  }, [q, accounts]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text">Akun Sponsor</h1>
          <p className="text-sm text-muted">Buat & kelola akun brand yang bisa login untuk mengajukan sponsor.</p>
        </div>
        <button
          onClick={() => {
            setShowCreate((v) => !v);
            setNewPw(genPassword());
          }}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {showCreate ? "Tutup" : "Tambah akun"}
        </button>
      </div>

      {notice && NOTICE[notice] && (
        <div className="rounded-lg border border-[#12b76a]/40 bg-[#12b76a]/10 px-3 py-2 text-sm text-[#6ee7b7]">
          {NOTICE[notice]}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-[#ff3b57]/40 bg-[#ff3b57]/10 px-3 py-2 text-sm text-[#ff8a9c]">
          {ERR[error] ?? ERR.failed}
        </div>
      )}

      {showCreate && (
        <form action={createSponsorAccount} className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <div>
            <label className={label}>Nama brand *</label>
            <input name="company" required className={input} />
          </div>
          <div>
            <label className={label}>Kategori</label>
            <input name="kategori" className={input} placeholder="Sport / F&B / Apparel…" />
          </div>
          <div>
            <label className={label}>Nama PIC</label>
            <input name="nama_pic" className={input} />
          </div>
          <div>
            <label className={label}>No. HP / WhatsApp</label>
            <input name="no_hp" className={input} placeholder="08…" />
          </div>
          <div>
            <label className={label}>Email login *</label>
            <input name="email" type="email" required className={input} />
          </div>
          <div>
            <label className={label}>Password awal *</label>
            <div className="flex gap-2">
              <input
                name="password"
                required
                minLength={6}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className={input}
              />
              <button
                type="button"
                onClick={() => setNewPw(genPassword())}
                className="shrink-0 rounded-lg border border-white/15 px-3 text-xs text-muted hover:bg-white/5"
              >
                Buat
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2">
            <input type="checkbox" name="must_change" defaultChecked className="accent-[#ff3b57]" />
            Wajib ganti password saat login pertama (disarankan)
          </label>
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs text-faint">
              Akun langsung aktif & terverifikasi. Sampaikan email + password ini ke sponsor secara manual (mis. WhatsApp).
            </p>
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              Buat akun sponsor
            </button>
          </div>
        </form>
      )}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari brand / email / PIC…"
        className={input + " max-w-sm"}
      />

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-faint">Belum ada akun sponsor.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((a) => (
            <li key={a.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text">{a.company}</span>
                    <Badge tone={a.status === "active" ? "green" : "gray"}>
                      {a.status === "active" ? "Aktif" : "Nonaktif"}
                    </Badge>
                    {a.emailVerified ? (
                      <Badge tone="green">Terverifikasi</Badge>
                    ) : (
                      <Badge tone="amber">Belum verifikasi</Badge>
                    )}
                    <Badge tone="gray">{a.createdBy === "self" ? "Daftar sendiri" : "Dibuat admin"}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {a.email}
                    {a.namaPic && <span> · {a.namaPic}</span>}
                    {a.noHp && <span> · {a.noHp}</span>}
                    {a.kategori && <span> · {a.kategori}</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-faint">{a.requestCount} pengajuan</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!a.emailVerified && (
                    <form action={verifySponsorEmail}>
                      <input type="hidden" name="brand_user_id" value={a.id} />
                      <button className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted hover:bg-white/5">
                        Verifikasi manual
                      </button>
                    </form>
                  )}
                  <button
                    onClick={() => {
                      setResetFor((v) => (v === a.id ? null : a.id));
                      setNewPw(genPassword());
                    }}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted hover:bg-white/5"
                  >
                    Reset password
                  </button>
                  <form action={setSponsorStatus}>
                    <input type="hidden" name="brand_user_id" value={a.id} />
                    <input type="hidden" name="status" value={a.status === "active" ? "inactive" : "active"} />
                    <button className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted hover:bg-white/5">
                      {a.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </form>
                </div>
              </div>

              {resetFor === a.id && (
                <form action={resetSponsorPassword} className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  <input type="hidden" name="brand_user_id" value={a.id} />
                  <input
                    name="password"
                    required
                    minLength={6}
                    defaultValue={newPw}
                    className={input + " max-w-xs"}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <input type="checkbox" name="must_change" defaultChecked className="accent-[#ff3b57]" />
                    wajib ganti
                  </label>
                  <button className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                    Simpan password baru
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "green" | "amber" | "gray"; children: React.ReactNode }) {
  const cls =
    tone === "green"
      ? "bg-[#12b76a]/15 text-[#6ee7b7]"
      : tone === "amber"
        ? "bg-amber-400/15 text-amber-300"
        : "bg-white/10 text-white/50";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}
