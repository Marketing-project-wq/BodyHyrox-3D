# Panggung atlet (360): spesifikasi

Dokumen ini adalah **satu-satunya acuan** untuk panggung atlet di halaman `/atlet/<id>`
(komponen `AthleteStageCard` + `AthleteViews`, arena 3D `StageArena3D`) dan bahan 360-nya.
Kalau kode, komentar, config, atau dokumen lain bertentangan dengan dokumen ini, dokumen ini
yang benar. Kalau instruksi pemilik yang lebih baru bertentangan dengan dokumen ini, ikuti
instruksi terbaru dan perbarui dokumen ini di PR yang sama.

Terakhir diperbarui: 2026-10-06 (PR R1, tugas "rapikan"; keputusan pemilik 2026-10-06 tentang bahan foto dan logika putaran).

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
   - **Pengecualian sementara (keputusan 2026-10-06):** Calysta tetap memakai putaran yang
     sekarang tayang (gambar tertanam, `STAGE_FRAMES_BUNDLED`) sampai diganti 12–24 foto lewat
     data. Setelah itu gambar tertanam dihapus.
5. **Interaksi:**
   - Tab, swipe, dan panah keyboard memutar ke sisi yang dipilih, lalu putaran lanjut sendiri
     setelah jeda singkat.
   - Pause menghentikan putaran sampai Play ditekan.
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
9. Berlaku untuk **semua atlet**, sekarang dan yang akan ditambahkan lewat dashboard.
10. **Verifikasi:** daftar perangkat di "Verify before shipping" `CLAUDE.md`.

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

Keadaan main per 2026-10-06, deploy #114. Selisih dengan bagian 1 diselesaikan bertahap (R2,
lalu set foto lewat data); jangan ditiru untuk atlet baru.

| Hal | Sekarang di main | Target (bagian 1) | Status |
|---|---|---|---|
| Calysta | Mode putaran memakai 12 gambar yang **ditanam di kode** (`STAGE_FRAMES_BUNDLED`, `public/media/atlet-360/calysta-turn-v2`). Kanan/Belakang/Kiri berupa foto, pose ditahan, lalu fade 15% | 12–24 foto dari **data**, dengan logika yang sama | **Pengecualian sementara yang disetujui** (bagian 1.4). Diganti setelah set foto baru ada. [PR #115](https://github.com/Marketing-project-wq/BodyHyrox-3D/pull/115) (12 pose tanpa foto) masih terbuka; diusulkan ditutup |
| Set foto putaran dari data | Studio sudah bisa menyimpan sampai 36 frame per atlet, tetapi data belum punya penanda "set putaran" dan `blendShare`. Mode putaran dari data hanya aktif untuk video | Set 12–24 foto di data otomatis mendapat mode putaran dengan logika tahan + crossfade | Pertanyaan terbuka (bagian 8), lalu R2/V4 |
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
  - Tab, swipe, atau tombol memutar orbit ke sisi itu dalam `turnToSideMs`, lalu orbit lanjut
    `resumeMs` kemudian.
  - Hanya keempat foto sisi yang dimuat.
- **`turntable`**: mode putaran pada bagian 1.2 dan 1.4.
  - Sudut atlet mengikuti sudut arena (`STAGE_ARENA.autoRotateSecPerTurn`, 60 s).
  - Kalau data punya video (`media.video`), videonya menjadi jam utama (`VIEWER_VIDEO`, VP9
    alpha / HEVC di Apple). Selain itu frame dipilih menurut sudut dan dibaurkan
    (`VIEWER_SPIN.crossfadeShare`, atau `Media360.blendShare` untuk set yang menahan pose).
  - Frame didekode sedikit demi sedikit (LRU per perangkat, `VIEWER_SPIN.cacheFrames`).
  - **Aturan target:** hanya aktif kalau data atlet punya video (bagian 1.4).

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
- **`SPONSOR_360_UPLOAD`:** batas upload set 360 di studio admin (`maxFrames` 36, sampai SQL 72
  dijalankan).

### Parameter URL

- **Boleh di production:** `?debug=feet` (permukaan platform dan titik kontak kaki),
  `?debug=viewport` (ukuran viewport/toolbar HP), dan `?platform=round` (pratinjau platform
  bulat).
- **Lainnya** dijadwalkan dihapus atau dibatasi ke development di R2.

## 5. Alur admin untuk atlet baru

1. **Admin → Atlet → Tambah:** isi profil atlet.
2. **Atlet → Kelola foto 360°:**
   - Upload set foto (atau satu video putar; studio mengambil frame-nya).
   - Semua perubahan masuk ke **draft**.
   - Atur Depan/Kanan/Belakang/Kiri, rapikan posisi kaki di editor frame, dan pasang titik zona
     per sisi.
3. **Publish:** pengaman Publish menolak kalau titik zona hilang dari sisi yang dipakai.
4. Tanpa video di data, atlet tampil di **mode sementara** (bagian 1.3).
5. Setelah V4 tersedia: upload video putaran dan keyframe hasil `scripts/video360` ke draft
   lalu Publish. Atlet itu otomatis mendapat mode putaran (bagian 1.4).

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
- **Set 12–24 foto per atlet lewat data** (pengganti gambar tertanam Calysta): penanda "set
  putaran" dan `blendShare` di data, serta pemilihan mode dari data. Menunggu set foto dan
  approval.
- **[PR #115](https://github.com/Marketing-project-wq/BodyHyrox-3D/pull/115):** terbuka.
  Pemilik memilih tetap memakai yang tayang sekarang, jadi diusulkan ditutup (menunggu
  konfirmasi).
- **Sudah selesai** (catatan riwayat): F1 #104 (kaki dan bayangan napak), `autoSides` #107, dan
  perbaikan script terakhir #108–#110.

## 8. Pertanyaan terbuka

Jangan ditebak; tanyakan ke pemilik.

1. ~~Calysta dan gambar tertanam~~: dijawab 2026-10-06. Tetap dipakai sampai diganti 12–24
   foto (bagian 1.4).
2. Di mode putaran, apakah platform ikut berputar atau diam?
3. "Deteksi kaki v3": aturan deteksi di browser bernomor `FOOT_VERSION = 4`, sedangkan file
   `feet.json` berformat versi 3. Keduanya dianggap sesuai bagian 1.7.
4. Bagaimana data menandai bahwa set frame atlet adalah set putaran 12–24 foto (dengan mode
   putaran tahan + crossfade), dan bukan set lama? Contoh: tanda di studio "set putaran", atau
   otomatis kalau jumlah foto 12–24 dan sudutnya rata.
