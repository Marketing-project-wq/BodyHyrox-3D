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
NEXT_PUBLIC_SUPABASE_URL=...        # URL project Supabase
SUPABASE_SERVICE_ROLE_KEY=...       # service role key (server-only, rahasia)
SESSION_SECRET=...                  # string acak untuk tanda tangan cookie sesi
```

## Menjalankan lokal

```bash
npm install
npm run build
npm run start   # atau: npm run dev
```

## Deploy (Railway)

Railpack otomatis mendeteksi Next.js: `npm run build` lalu `npm run start`
(server membaca `process.env.PORT`). Pastikan ketiga env var di atas sudah
di-set di Railway sebelum deploy.

## Catatan keamanan

- Next.js 14.2.35 adalah rilis 14.2.x terbaru. Beberapa advisory Next
  kelas **DoS** baru diperbaiki di Next 15/16 (upgrade breaking) — aplikasi
  ini tidak memakai `next/image`, jadi dampaknya minim; disarankan upgrade
  ke Next 15+ di kemudian hari.
- Info database: 90 tabel lama di project Supabase `20FIT ALL DATA` punya
  RLS mati (masalah lama, di luar cakupan fitur ini) — tidak diubah.
