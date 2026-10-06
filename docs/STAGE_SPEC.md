# Panggung atlet (360): spesifikasi

Dokumen ini adalah **satu-satunya acuan** untuk panggung atlet di halaman `/atlet/<id>`
(komponen `AthleteStageCard` + `AthleteViews`, arena 3D `StageArena3D`) dan bahan 360-nya.
Kalau kode, komentar, config, atau dokumen lain bertentangan dengan dokumen ini, dokumen ini
yang benar. Kalau instruksi pemilik yang lebih baru bertentangan dengan dokumen ini, ikuti
instruksi terbaru dan perbarui dokumen ini di PR yang sama.

Terakhir diperbarui: 2026-10-06 (media frame panggung M0–M1; setelah #121–#124: SQL S0 jalan, set putaran Calysta dari data tayang, baris tombol disembunyikan, tombol "Place Your Logo").

---

## 1. Keputusan yang berlaku

1. **Workflow:** sesuai `CLAUDE.md`. Merge hanya kalau pemilik menulis `merge PR #<nomor>`,
   atau dengan izin AUTO-MERGE eksplisit bersyarat untuk tugas tertentu.
2. **Tampilan target untuk SEMUA atlet:**
   - Atlet berdiri **diam** di satu posisi. Posisi, ukuran, dan kaki di platform tidak pernah
     berubah.
   - Hanya **background** (pilar, frame neon, lantai) yang berputar pelan dan terus-menerus.
   - Seiring background berputar, sudut badan atlet yang terlihat ikut berubah, seperti kamera
     yang mengorbit.
   - **Logika putaran (sudah benar, keputusan 2026-10-06):** logika yang sekarang tayang untuk
     Calysta. Panggung memilih pose sesuai sudut background dan menahan setiap pose (atlet diam
     total). Pose berikutnya masuk lewat crossfade singkat yang berpusat di antara dua pose
     (`blendShare`, sekarang 0,15).
   - **Bahan (ke depan):** **12–24 foto** atlet dari sudut yang berbeda, rata mengelilingi
     putaran: foto pertama = Depan, Kanan di 1/4, Belakang di 1/2, Kiri di 3/4. Setiap foto
     dikunci (garis telapak, tinggi, tengah badan), dan disimpan sebagai **data atlet**.
     `scripts/video360` (`export_frames.py`, `PHOTOS_AT`) boleh dipakai untuk menyiapkannya.
3. **Mode sementara** untuk atlet yang belum punya video di data (`static-athlete` +
   `autoSides`):
   - Atlet diam.
   - Empat sisi (depan/kanan/belakang/kiri) berganti otomatis mengikuti putaran background,
     dengan crossfade.
4. **Mode putaran (`turntable`)** hanya aktif kalau **data atlet** punya set putaran (12–24
   foto, atau video). Video atau gambar yang ditanam di kode tidak boleh dipakai untuk
   mengaktifkan putaran.
   - Calysta sudah memakai set putaran dari data (18 foto, dipublish 2026-10-06). Gambar
     tertanam (`STAGE_FRAMES_BUNDLED`, `calysta-turn-v2`) tidak dipakai lagi dan dijadwalkan
     dihapus (R2).
5. **Interaksi:**
   - **Baris tombol di bawah atlet** (‹ ⏸ Depan · Kanan · Belakang · Kiri ›) **disembunyikan**
     (keputusan 2026-10-06, #123, `STAGE_VIEW_CONTROLS = false`). Tidak ada tombol Pause/Play.
   - Swipe/drag dan panah keyboard memutar ke sisi yang dipilih, lalu putaran lanjut sendiri
     setelah jeda singkat.
   - **Tombol utama:** EN "Place Your Logo" / ID "Pasang Logo di Sini" (#124), menuju daftar
     zona (`#zona-sponsor`: zona tersedia, harga, tambah/ajukan). Posisinya **tepat di bawah tepi
     depan platform** (keputusan 2026-10-06, menggantikan "menutupi sepatu"): dikunci ke garis
     kaki (`STAGE_CTA.dropPct`), tidak menutupi kaki.
   - **Kaki menapak:** bayangan kontak per sepatu lebih tegas, dan bagian bawah sepatu sedikit
     memudar ke cahaya platform dengan glow biru (`STAGE_FEET_BLEND`), supaya kaki tidak
     terlihat mengambang saat berputar.
   - Kartu zona menahan putaran selama terbuka.
   - Tab browser tidak aktif dan `prefers-reduced-motion`: putaran berhenti.
6. **Platform dan tata letak:**
   - Platform default `"hex"`, opsi `"round"` (#105, pratinjau `?platform=round`).
   - Di bawah `lg`: tata letak **Opsi B**, readout ringkas tanpa kotak gelap,
     `STAGE_FIT.enabled = false`.
7. **Kaki:** deteksi kaki v3 (dua titik kontak per foto), anchor di kaki depan,
   `feetForward` 0,55, dan fallback opsi C untuk data lama.
8. **Data:**
   - Pengaman Publish (PR 0, #91) aktif.
   - Sisi viewer dan titik zona disimpan lewat draft (PR 7, #87).
   - SQL "video + 72" **belum dijalankan**. Pihak pemilik yang menjalankannya.
9. **Warna (keputusan 2026-10-06):** biru cyan `#00B4FF` (hover `#0093D1`), putih, dan hitam
   di seluruh situs (panggung, platform, arena 3D, tombol, admin). Pesan error tetap merah.
10. Berlaku untuk **semua atlet**, sekarang dan yang akan ditambahkan lewat dashboard.
11. **Verifikasi:** daftar perangkat di "Verify before shipping" `CLAUDE.md`.

## 2. Sudah tidak berlaku

Jangan diikuti. Sisa kodenya adalah kandidat untuk dihapus (lihat bagian 7).

- Drag → Pause permanen. Jeda saat mouse hover.
- Atlet berputar dengan 18/24 frame sebagai tampilan default, artinya set lama yang memutar
  frame berjalan terus tanpa menahan pose. Set 12–24 foto dengan logika tahan + crossfade
  (bagian 1.2) tetap berlaku.
- Mode `static-athlete` yang hanya menampilkan sisi depan tanpa pergantian sisi.
- PR C (resample 72 frame di browser) dan PR F2 (pengurangan kesan meluncur).
- Jalur cepat "ganti video yang ditanam di kode".
- `ffmpeg minterpolate` sebagai metode utama, `ANCHOR=support`, dan `INTERP_GUARD`.
- `STAGE_FIT` (pengecilan foto) aktif. Kotak gelap readout di HP.

## 3. Keadaan sekarang vs target

Keadaan main per 2026-10-06, deploy #124. Selisih dengan bagian 1 diselesaikan bertahap (R2,
lalu set foto lewat data); jangan ditiru untuk atlet baru.

| Hal | Sekarang di main | Target (bagian 1) | Status |
|---|---|---|---|
| Calysta | Set putaran **dari data**: 18 foto (0°–340°, tiap 20°), pose ditahan, fade 15%. Gambar tertanam `calysta-turn-v2` masih ada di kode tetapi tidak dipakai | Sama | Sesuai. Hapus gambar tertanam di R2 |
| Set foto putaran dari data | Kolom `turn` (sudut + `blendShare`) ada sejak SQL S0. "Bahan 360" + "Buat set putaran" + Publish tayang (#118–#122) | Sama | Sesuai |
| Atlet lain | Mode sementara (4 sisi, `autoSides`) | Sama sampai mereka punya video di data | Sesuai |
| Pemilihan mode | Diputuskan di beberapa tempat (konstanta, `?stage=`, gambar tertanam, video tertanam/data, plus pemilihan video di `AthleteViews`) | Satu aturan berdasarkan data | R2 |
| Platform di mode putaran | Ikut berputar bersama arena (`platformLocked` hanya di mode sementara) | Bagian 1.2: hanya pilar, frame, dan lantai yang berputar | Pertanyaan terbuka (bagian 8) |
| Parameter URL di production | `?debug=feet`, `?debug=viewport`, `?platform=round`, ditambah `?debug=perf`, `?debug=video`, `?stage=turntable\|static`, `?platform=hex` | Hanya tiga yang pertama | R2 |

## 4. Mode dan config

Semua angka yang bisa disetel ada di `lib/config.ts`, bukan di komponen atau CSS.

### Mode

- **`static-athlete`** (`STAGE_MODE`, default): mode sementara pada bagian 1.3.
  - Atlet tampil dari foto sisi (`views` di data). Background mengorbit menurut
    `STAGE_STATIC.secPerTurn` (48 s) dan `direction`.
  - `autoSides: true`: foto berganti mengikuti orbit, dengan crossfade `autoFadeMs` yang
    berpusat di batas sisi (45°/135°/225°/315°).
  - Swipe atau panah keyboard memutar orbit ke sisi itu dalam `turnToSideMs`, lalu orbit lanjut
    `resumeMs` kemudian (tab disembunyikan, `STAGE_VIEW_CONTROLS`).
  - Hanya keempat foto sisi yang dimuat.
- **`turntable`**: mode putaran pada bagian 1.2 dan 1.4.
  - Sudut atlet mengikuti sudut arena (`STAGE_ARENA.autoRotateSecPerTurn`, 60 s).
  - Kalau data punya video (`media.video`), videonya menjadi jam utama (`VIEWER_VIDEO`, VP9
    alpha / HEVC di Apple). Selain itu frame dipilih menurut sudut dan dibaurkan
    (`VIEWER_SPIN.crossfadeShare`, atau `turn.blendShare` untuk set putaran dari data).
  - Frame didekode sedikit demi sedikit (LRU per perangkat, `VIEWER_SPIN.cacheFrames`).
  - **Aturan target:** hanya aktif kalau data atlet punya set putaran (`turn`) atau video (bagian 1.4).

### Config utama (`lib/config.ts`)

- **`STAGE_MODE`, `STAGE_STATIC`:** mode default dan pengaturan mode sementara.
- **`STAGE_TURN_VIDEO_AUTO`:** putaran otomatis untuk atlet dengan video di data. Saat ini
  juga menerima `STAGE_VIDEO_BUNDLED`, yang tidak boleh (R2).
- **`STAGE_FRAMES_BUNDLED`, `STAGE_TURN_FRAMES_AUTO`, `STAGE_VIDEO_BUNDLED`, `lib/stage-frames.ts`:**
  bahan yang ditanam di kode. **Sementara saja**, dan dihapus setelah V4 (bagian 1.4).
- **`STAGE_ARENA`:** arena 3D: kecepatan orbit di mode putaran, kualitas adaptif, DPR, kabut,
  dan kamera.
- **`STAGE_PLATFORM`, `STAGE_PLATFORM_ROUND`:** bentuk platform (`"hex"`, opsi `"round"`).
- **`VIEWER_SPIN`:** crossfade, tahan setelah putaran manual (`manualResumeMs`), dan cache frame.
- **`VIEWER_VIDEO`:** pemutaran video putaran (fallback ke frame saat frame terputus/drop,
  macet, atau autoplay ditolak).
- **`VIEWER_360`, `VIEWER_VIEWS`, `STAGE_READOUT`:** ukuran foto, garis kaki, dan readout.
- **`STAGE_FIT`:** `enabled: false` (bagian 1.6).
- **`STAGE_VIEW_CONTROLS`:** `false`, baris tombol di bawah atlet disembunyikan (bagian 1.5).
- **`MEDIA_SOURCES`, `TURN_SET`:** batas upload "Bahan 360" dan aturan "Buat set putaran"
  (jumlah pose, ketajaman, batas melangkah `standMaxSpread`: foto 0,2, video 0,06).
- **`SPONSOR_360_UPLOAD`:** batas upload set 360 di studio admin (`maxFrames` 36, sampai SQL 72
  dijalankan).

### Parameter URL

- **Boleh di production:** `?debug=feet` (permukaan platform dan titik kontak kaki),
  `?debug=viewport` (ukuran viewport/toolbar HP), dan `?platform=round` (pratinjau platform
  bulat).
- **Lainnya** dijadwalkan dihapus atau dibatasi ke development di R2.

## 5. Alur admin untuk atlet baru (semua atlet)

Berlaku untuk setiap atlet, termasuk yang ditambahkan lewat dashboard. Sudah tayang: SQL S0
(dijalankan 2026-10-06, file di
[#121](https://github.com/Marketing-project-wq/BodyHyrox-3D/pull/121)) dan PR S1–S3
([#118](https://github.com/Marketing-project-wq/BodyHyrox-3D/pull/118),
[#119](https://github.com/Marketing-project-wq/BodyHyrox-3D/pull/119),
[#120](https://github.com/Marketing-project-wq/BodyHyrox-3D/pull/120)). Pertama dipakai untuk
Calysta (18 foto).

1. **Admin → Atlet → Tambah:** isi profil atlet.
2. **Bahan 360:** upload foto (idealnya 12–24, dari sudut yang berbeda mengelilingi atlet,
   tinggi dan jarak kamera sama) dan/atau video putar.
   - Semua bahan tersimpan privat, terdaftar (pratinjau, ukuran, durasi, siapa, kapan), bisa
     dilihat dan dihapus.
   - File asli **tetap disimpan** setelah set putaran dibuat (keputusan 2026-10-06).
3. **Buat set putaran:**
   - Atur sudut foto kalau perlu (otomatis: urut upload, foto pertama = Depan).
   - Pilih video (opsional), lalu klik **Pilih pose terbaik**.
   - Jumlah pose: tanpa video = jumlah foto yang bagus (12–24); dengan video = 24 sudut rata
     (foto mengisi sudut terdekatnya, video mengisi sisanya).
   - Pose dinilai dari ketajaman, resolusi, dan selisih sudut. Pose yang melangkah, kakinya
     tidak terdeteksi, atau warnanya beda dari set ditandai ⚠️ (hanya peringatan). Batas
     melangkah untuk foto lebih longgar (#122), karena dari samping kaki belakang tampak lebih
     tinggi.
   - Ganti pose per sudut kalau perlu, lalu **Simpan ke draft** (pose dikunci di garis telapak,
     tinggi, dan tengah yang sama, 714×1680).
4. **Studio 360:** cek putaran, sisi Depan/Kanan/Belakang/Kiri, dan titik zona di draft.
5. **Publish:** pengaman Publish menolak kalau titik zona hilang. Setelah tayang, atlet otomatis
   mendapat mode putaran (bagian 1.4). Atlet tanpa set putaran tetap di mode sementara (bagian 1.3).

## 5b. Media frame panggung (keputusan 2026-10-06, dikerjakan bertahap M0–M4)

- **Tujuan:** layar neon di arena 3D di belakang atlet menampilkan media atlet (misalnya video
  race HYROX). Isinya berbeda per layar, diatur per atlet, berlaku untuk semua atlet, dan ikut
  berputar bersama latar.
- **Admin hanya menempel LINK** (tidak upload), maksimal 6 slot (`STAGE_MEDIA.slots`), lalu
  **Cek link**, simpan ke draft, dan **Publish**.
- **Jenis link** (`lib/stage-media.ts`, dicek ulang di server `stage-media-actions.ts`):
  - **YouTube** (watch, youtu.be, Shorts, live, embed): wajib ada dan boleh di-embed (oEmbed
    resmi). Thumbnail disalin ke bucket publik `smb-athlete-360/<atlet>/stage-media/`. Di
    panggung tampil thumbnail + ▶; tap membuka lightbox dengan player resmi
    `youtube-nocookie.com`. YouTube **tidak** diputar di dalam frame (iframe tidak bisa masuk
    WebGL, berat, dan bertentangan dengan aturan player YouTube).
  - **File video** `.mp4`/`.webm`: tipe video, maksimal 40 MB, dan wajib mengizinkan situs ini
    lewat CORS. Poster dibuat browser admin. Diputar di frame (muted, playsinline, loop) dengan
    batas jumlah video aktif (M4).
  - **Gambar** `.jpg`/`.png`/`.webp`: maksimal 8 MB, disalin ke bucket publik.
  - **Ditolak dengan pesan EN/ID:** http, Google Drive/Dropbox, Instagram/TikTok/Facebook/X/
    Vimeo, halaman biasa, video tanpa CORS, file terlalu besar, YouTube privat/embed mati.
- **Keamanan:** hanya https; tidak boleh IP, localhost, user:password, atau port lain. Server
  membuka link lewat `lib/safe-fetch.ts` (semua alamat DNS harus publik, redirect dicek ulang
  maksimal 3, batas waktu dan ukuran). Iframe hanya dari `www.youtube-nocookie.com`, dibangun
  dari ID, bukan dari link mentah.
- **Data:** tabel `smb_athlete_stage_media` (draft + published + versi + riwayat) lewat SQL M0
  (`supabase/migrations/20261007_smb_stage_media.sql`, **dijalankan pemilik**). Bentuk jsonb:
  `{ v: 1, slots: [{ slot, kind, url, ytId, thumb, w, h, title, checkedAt }] }`.
- **Panggung (M3):** 6 layar mendatar 16:9, satu setiap 60°, sedikit redup/diberi tint (config),
  di bawah atlet dan titik zona. HP tegak: layar jarang terlihat (tertutup atlet), diterima untuk
  sekarang.

## 6. Alur membuat video putaran (`scripts/video360`)

Panduan lengkap ada di `scripts/video360/README.md`. Ringkasnya:

1. Rekam atlet berputar 360°. Idealnya atlet berdiri **diam di atas meja putar** dengan kamera
   di tripod setinggi pinggul dan latar polos.
2. Studio: buka timeline video, tandai Depan/Kanan/Belakang/Kiri/Akhir, lalu **Unduh penanda
   (JSON)**.
3. Di Mac jalankan `make_360_video.sh`. Default-nya `GAP_FILL=mirror`, 60 s per putaran, 24
   gambar/detik, hanya frame berdiri, celah diisi RIFE, dan setiap gambar dikunci (garis
   telapak, tinggi, tengah).
4. Cek `contact.jpg` dan laporan (`check lock`, `check quality`, `check loop seam`).
5. Upload hasilnya lewat studio (V4). Jangan menanamnya di kode.

Atlet yang **memutar badannya sendiri** (bukan di meja putar) akan terlihat bergerak di setiap
sudut. Script tidak bisa menghilangkannya; rekam ulang di meja putar.

## 7. Pekerjaan yang ditahan / belum selesai

- **V3b:** lapisan video di panggung, sepenuhnya berbasis data. Menunggu approval.
- **V4:** upload video + keyframe ke draft, lalu Publish dengan video. Membutuhkan SQL "video +
  72" yang dijalankan pemilik. Menunggu approval.
- **SQL "video + 72":** belum dijalankan.
- **Pilihan metode sisi kanan** (RIFE / RIFE bertahap / cermin): `mirror` dipakai sebagai
  default, keputusan resmi pemilik belum ada.
- **R2:** rapikan kode (lihat audit). **R3:** GitHub, Railway, dan Supabase. Keduanya menunggu
  approval.
- **Hapus gambar tertanam Calysta** (`STAGE_FRAMES_BUNDLED`, folder `calysta-turn-*`): set
  dari data sudah tayang, jadi bisa dihapus di R2 (menunggu approval).
- PR #115 dan #117 ditutup (2026-10-06).
- **Sudah selesai** (catatan riwayat): F1 #104 (kaki dan bayangan napak), `autoSides` #107,
  perbaikan script #108–#110, set putaran lewat data S0–S3 (#118–#122), baris tombol
  disembunyikan #123, tombol "Place Your Logo" #124.

## 8. Pertanyaan terbuka

Jangan ditebak; tanyakan ke pemilik.

1. ~~Calysta dan gambar tertanam~~: dijawab 2026-10-06. Tetap dipakai sampai diganti 12–24
   foto (bagian 1.4).
2. Di mode putaran, apakah platform ikut berputar atau diam?
3. "Deteksi kaki v3": aturan deteksi di browser bernomor `FOOT_VERSION = 4`, sedangkan file
   `feet.json` berformat versi 3. Keduanya dianggap sesuai bagian 1.7.
4. ~~Penanda set putaran~~: dijawab lewat rencana yang disetujui 2026-10-06. Set dibuat dengan
   "Buat set putaran" dan disimpan di kolom `turn` (sudut per foto + `blendShare`). Jumlah pose
   mengikuti jumlah foto yang di-upload.
