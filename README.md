# 20FIT Sponsor My Body

Panel internal 20FIT untuk **Sponsor My Body** — platform sponsor zona tubuh
atlet Hyrox. Landing page publik di `/` dan **Admin Dashboard** di `/admin`.

## Stack

- **Next.js 14 (App Router) + TypeScript + TailwindCSS**
- **Supabase (Postgres)** — data terisolasi di tabel berprefix `smb_`
- Auth username/password sendiri (scrypt hash + cookie sesi ber-HMAC)

## Halaman

| Rute               | Isi                                                        |
| ------------------ | --------------------------------------------------------- |
| `/`                | Landing page publik (hero 3D)                             |
| `/login`           | Login admin                                               |
| `/admin`           | Overview: KPI, revenue 6 bulan, transaksi, ranking, event |
| `/admin/atlet`     | Kelola atlet (cari, filter, tambah, aktif/nonaktif)       |
| `/admin/brand`     | Kelola brand                                              |
| `/admin/transaksi` | Transaksi (filter status/bulan, refund)                  |
| `/admin/event`     | Event (buat, daftar)                                     |
| `/admin/harga-zona`| Harga zona tubuh (ubah harga, aktif/nonaktif)            |
| `/admin/pengaturan`| Profil platform & notifikasi                             |
| `/admin/pengajuan` | Pengajuan sponsor zona dari brand                        |
| `/admin/akun-sponsor` | Akun brand/sponsor                                    |
| `/admin/atlet/[id]`| Detail atlet: profil, zona, studio foto/video 360°       |
| `/atlet`, `/atlet/[id]` | Halaman publik atlet dengan panggung 360 (lihat `docs/STAGE_SPEC.md`) |
| `/atlet/[id]/ajukan` | Pengajuan sponsor zona oleh brand                      |
| `/brand/*`         | Akun brand: daftar, masuk, verifikasi, keranjang, dashboard |

## Panggung atlet (360)

Acuan tunggal untuk panggung atlet (mode, config, alur admin, alur video
`scripts/video360`, pekerjaan yang ditahan) ada di **`docs/STAGE_SPEC.md`**.

## Arsitektur data

- Semua tabel berprefix `smb_` dengan **RLS aktif tanpa policy publik** —
  hanya diakses server-side memakai **service role key**. Tidak menyentuh
  tabel lain di database.
- KPI, ranking, dan chart **dihitung dari data** lewat fungsi SQL
  (`smb_kpis`, `smb_monthly_revenue`, `smb_top_athletes`, dll.), bukan
  angka yang di-hardcode di komponen.
- Setiap mutasi (refund, ubah harga, aktif/nonaktif, tambah data) berjalan
  sebagai **satu transaksi** lewat fungsi Postgres yang sekaligus menulis
  **audit log** (`smb_audit_log`: siapa, apa, nilai lama → baru, kapan).
- Format IDR/tanggal terpusat di `lib/format.ts`; aturan status, visibilitas,
  dan hak akses peran di `lib/config.ts`.

## Peran

- **Super Admin**: semua aksi, termasuk **refund** & **ubah harga zona** &
  pengaturan.
- **Admin**: lihat + kelola atlet/brand/event/transaksi (tanpa refund,
  harga, dan pengaturan).

## Environment variables

Salin `.env.example` menjadi `.env` (lokal) atau set di Railway:

```
SUPABASE_SERVICE_ROLE_KEY=...       # WAJIB: service role key (server-only, rahasia)
NEXT_PUBLIC_SUPABASE_URL=...        # opsional: URL project (default sudah di kode)
SESSION_SECRET=...                  # opsional: kalau kosong diturunkan dari service role key
RESEND_API_KEY=... / EMAIL_FROM=... # opsional: email (tanpa ini email tidak dikirim)
NEXT_PUBLIC_SITE_URL=...            # opsional: URL situs di email (default https://avatar.20fit.id)
```

## Menjalankan lokal

```bash
npm install
npm run build
npm run start   # atau: npm run dev
```

## Deploy (Railway)

Railpack otomatis mendeteksi Next.js: `npm run build` lalu `npm run start`
(server membaca `process.env.PORT`). Minimal `SUPABASE_SERVICE_ROLE_KEY` harus
di-set di Railway sebelum deploy. Railway hanya men-deploy branch `main`.

## Catatan keamanan

- Next.js 14.2.35 adalah rilis 14.2.x terbaru. Beberapa advisory Next
  kelas **DoS** baru diperbaiki di Next 15/16 (upgrade breaking) — aplikasi
  ini tidak memakai `next/image`, jadi dampaknya minim; disarankan upgrade
  ke Next 15+ di kemudian hari.
- Info database: 90 tabel lama di project Supabase `20FIT ALL DATA` punya
  RLS mati (masalah lama, di luar cakupan fitur ini) — tidak diubah.
