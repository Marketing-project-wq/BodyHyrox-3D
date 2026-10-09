# Panggung atlet (360): spesifikasi

Dokumen ini adalah **satu-satunya acuan** untuk panggung atlet di halaman `/atlet/<id>`
(komponen `AthleteStageCard` + `AthleteViews`, arena 3D `StageArena3D`) dan bahan 360-nya.
Kalau kode, komentar, config, atau dokumen lain bertentangan dengan dokumen ini, dokumen ini
yang benar. Kalau instruksi pemilik yang lebih baru bertentangan dengan dokumen ini, ikuti
instruksi terbaru dan perbarui dokumen ini di PR yang sama.

Terakhir diperbarui: 2026-10-09 (video media.20fit.id lewat proxy server kita, bagian 5b; kabut panggung `STAGE_FOG` dimatikan sementara).

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
   - **Satu alur untuk semua atlet (keputusan 2026-10-08, `STAGE_TURN_FLOW`):** berapa pun jumlah
     fotonya (12–24), panggung selalu memakai **18 titik pose tiap 20°**, crossfade 15% per
     langkah (3°), 60 dtk per putaran — sama persis dengan Calysta.
     - Tiap titik memakai foto yang sudutnya paling dekat. Foto sisi Depan/Kanan/Belakang/Kiri
       yang dipilih di studio selalu tetap di titiknya, jadi titik zona tetap pas.
     - Lebih dari 18 foto: 18 foto yang paling pas yang dipakai (yang lain tidak diunduh).
       Kurang dari 18: satu foto ditahan di titik-titik berurutan (pose lebih sedikit, alur sama).
     - Hanya urutan tampilan di panggung yang diatur (`lib/turn-flow.ts`); file, sudut di data,
       dan titik zona tidak diubah. Set yang sudah 18 titik tiap 20° (Calysta) tidak berubah sama
       sekali (identik piksel per piksel).
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
   - Aturan mode (keputusan 2026-10-08): **putaran kalau data atlet punya set putaran (`turn`)
     atau video**; tanpa keduanya, mode sementara 4 sisi. Sama untuk semua atlet, tanpa jalur
     khusus atlet tertentu.
   - Calysta (18 foto) dan Andrew (22 foto) sama-sama memakai set putaran dari data. Bahan
     tertanam khusus Calysta (`STAGE_FRAMES_BUNDLED`, `STAGE_VIDEO_BUNDLED`,
     `lib/stage-frames.ts`, `public/media/atlet-360/calysta-turn-v2`) **sudah dihapus**
     (2026-10-08). Folder `public/media/atlet-360/calysta` sengaja disimpan: versi 1 Calysta di
     riwayat (restore) masih menunjuk ke sana; folder itu bukan jalur khusus di kode.
5. **Interaksi:**
   - **Baris tombol di bawah atlet** (‹ ⏸ Depan · Kanan · Belakang · Kiri ›) **disembunyikan**
     (keputusan 2026-10-06, #123, `STAGE_VIEW_CONTROLS = false`). Tidak ada tombol Pause/Play.
   - Swipe/drag dan panah keyboard memutar ke sisi yang dipilih, lalu putaran lanjut sendiri
     setelah jeda singkat.
   - **Tombol utama:** EN "Place Your Logo" / ID "Pasang Logo di Sini" (#124), menuju daftar
     zona (`#zona-sponsor`: zona tersedia, harga, tambah/ajukan). Posisinya **tepat di bawah tepi
     depan platform** (keputusan 2026-10-06, menggantikan "menutupi sepatu"): dikunci ke garis
     kaki (`STAGE_CTA.dropPct`), tidak menutupi kaki.
   - **Kaki menapak (sol padat, keputusan 2026-10-07):** fade/glow `STAGE_FEET_BLEND` (#128)
     dihapus karena membuat sol tampak tembus. Gantinya, di viewer (tanpa memproses ulang file):
     - **Sol padat** (`STAGE_SOLE`, `lib/sole-solid.ts`): pita ±4,5% di atas dasar sol dibuat
       100% opak (piksel semi-transparan di bagian dalam), lubang kecil diisi; tepi antialias
       dan siluet tidak berubah, tidak ada bentuk baru.
     - **Gradasi gelap halus** di ±1,6% terbawah sol (`darkPct`, `darkStrength`), bukan garis hitam.
     - **Bayangan kontak tipis** per sepatu (`STAGE_ARENA.contactShadow*`), di atas bayangan
       yang sudah ada, mengikuti data feet saat ganti sisi, putaran, dan crossfade; melemah
       saat kaki terangkat (`liftedContactOpacity`). Warna gelap netral untuk semua tema.
     - **Cahaya platform** tepat di bawah sol diredupkan (`STAGE_ARENA.poolCenterDim`, area `poolDimRadius`;
       dipertegas 2026-10-07 bersama bayangan kontak dan gradasi sol, karena di desktop efeknya terlalu halus).
     - Materi baru ikut dipadatkan: import studio (`turn-set`, `media360`, `media360-video`) dan
       `scripts/video360/sole_solid.py` (dipanggil `export_frames.py`). Mode video (`<video>`)
       tidak dipadatkan, hanya bayangan kontak dan peredupan platform.
   - **Penanda zona sponsor (keputusan 2026-10-08, `STAGE_ZONES`):**
     - Lingkaran bergaris putus-putus warna tema (`--accent`) dengan isi tipis dan titik kecil
       di tengah, menggantikan titik bulat solid. Ukuran ±5,2% tinggi atlet (22–40 px di
       layar, tetap sama saat zoom), area sentuh 44×44 px.
     - Status: **tersedia** = warna tema, garis berputar pelan (12 dtk/putaran); **terisi** =
       abu-abu, diam; **nonaktif** = abu-abu bertitik, lebih pudar, diam; titik **tanpa zona**
       (hanya label) = warna tema, diam. `prefers-reduced-motion`: tanpa animasi garis.
     - Hover (mouse/pen) atau fokus keyboard: **satu** label "Nama zona · Rp harga" (terisi /
       nonaktif: status sebagai ganti harga). Label pindah ke atas/bawah/kanan/kiri supaya utuh
       di dalam kartu panggung dan layar; nama panjang dibungkus, harga tidak pernah terpotong.
     - Pembaca layar: "Lengan Kanan, Rp 6.000.000, tersedia". Tab berpindah antar zona.
   - **Zoom ke zona:** klik/tap/Enter pada lingkaran.
     - Atlet, penanda, bayangan dan platform CSS diperbesar bersama (transform figure);
       kamera arena 3D menyesuaikan tiap frame, jadi platform tetap tepat di bawah kaki dan
       tetap tajam. Arena digelapkan (`sceneDim`), tanpa blur (ringan di HP). Konten samping,
       readout, tombol "Place Your Logo" dan panah memudar.
     - Lingkaran terpilih ke tengah area kosong: di samping kartu (layar lebar) atau di atas
       kartu (HP/iPad potret). Animasi 0,6 dtk ease-out; `prefers-reduced-motion`: langsung.
     - Kartu zona: status, nama, harga, tombol "Pasang Logo di Sini" (alur pengajuan zona;
       hanya untuk zona tersedia), tombol × 44 px. Penanda lain diredupkan.
     - Lingkaran lain saat zoom: geser halus ke zona itu tanpa zoom out.
     - Keluar: ×, Esc, tap di luar atlet/kartu, atau gestur kembali (entri riwayat). Fokus
       kembali ke lingkaran yang sama. Putaran dan pergantian sisi berhenti selama zoom dan
       lanjut setelah jeda biasa (`autoRotateResumeMs` / `STAGE_STATIC.resumeMs`).
     - Faktor zoom: HP 2,2×, tablet 2,0×, desktop 2,4×, dibatasi resolusi foto atlet (maks
       15% pembesaran piksel, min 1,5×). Dengan foto 1680 px sekarang: Mac Retina/iPad
       ±1,7–2,0×, iPhone ±1,7–2,2×, desktop DPR 1 2,4×. Untuk 2,4× di Retina perlu foto
       ±2.800 px tinggi.
   - Kartu zona dan zoom menahan putaran selama terbuka.
   - Tab browser tidak aktif dan `prefers-reduced-motion`: putaran berhenti.
   - **Kembali dari tab lain / jendela minimize / layar HP terkunci / aplikasi lain / sleep
     (keputusan 2026-10-08):** panggung langsung seperti semula (arena 3D, frame media,
     platform, sudut dan sisi yang sama), putaran lanjut dari posisi terakhir tanpa loncatan.
     - Waktu saat halaman tersembunyi tidak pernah diukur. Setelah kembali ada jeda
       `qualityResumeGraceMs` (2,5 dtk) tanpa pengukuran; celah frame > `qualityGapMs`
       memulai ulang jendela ukur. (Penyebab bug: jendela ukur yang mencakup waktu tersembunyi
       dihitung sebagai "lambat", lalu satu tersendat sesaat setelah kembali membuat arena
       pindah ke cadangan CSS secara permanen.)
     - Fallback CSS hanya kalau lambat terus-menerus saat terlihat: `slowWindowsToDisable` = 3
       jendela 2 dtk berturut-turut. Fallback karena lambat atau error WebGL dicoba ulang ke 3D
       setelah `arenaRetryMs` (20 dtk) atau saat halaman tampil lagi, maks. `arenaRetries` (2)
       kali per kunjungan; perangkat yang memang lemah tetap di CSS. Tanpa WebGL: langsung CSS,
       tidak dicoba ulang.
     - Konteks WebGL hilang: platform CSS tampil sementara; saat dipulihkan browser, three.js
       membangun ulang scene dan tekstur (atlet, frame media). Kalau tidak dipulihkan dalam
       `contextRestoreWaitMs` (4 dtk), arena dibuat ulang di canvas baru. Selama konteks
       hilang dan sesudahnya (jeda yang sama) tidak ada pengukuran performa.
     - `?debug=perf`: panel FPS, tingkat kualitas, hitungan jendela lambat, status arena
       (3D / cadangan + alasan + percobaan ulang), status konteks WebGL, dan log kejadian.
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
12. **Kabut panggung (keputusan 2026-10-09, `STAGE_FOG`):** lapisan kabut rendah seperti dry
    ice di atas platform, untuk **semua atlet** dan kedua mode (4 sisi dan putaran).
    - **Status: DIMATIKAN sementara (2026-10-09)** atas permintaan pemilik, karena tampilannya
      belum memuaskan: `STAGE_FOG.enabled = false`. Kode tetap ada untuk versi berikutnya. Saat
      mati tidak ada lapisan kabut sama sekali (tanpa biaya), dan `?debug=perf` menampilkan
      `fog off`. Uraian di bawah berlaku kalau kabut dinyalakan lagi.
    - Tujuan: menyamarkan pertemuan sepatu dan lantai, supaya sepatu tidak terlihat pudar
      atau seperti tempelan.
    - Tinggi: menutup sepatu dan bagian bawah kaki, **tidak** sampai betis atau lutut. Puncak
      kabut (densitas sedang) 10% tinggi frame di atas garis kaki; sepatu ±8%, ujung kaus kaki
      ±11%, betis mulai ±14%.
    - Bentuk: lebih lebar dari platform (2,6× lebar frame; platform 3D ±1,7×), meluber
      sedikit lewat tepi depan dan samping lalu memudar halus (oval, bukan kotak). Tepi
      atasnya bergelombang.
    - Warna: putih yang makin ke bawah makin ke warna tema (`--accent`, jadi ikut tema biru
      atau merah), plus cahaya platform dari bawah.
    - Gerak: 2–3 lembar dari dua tekstur kabut yang mulus, dibuat sekali di browser. Bergeser
      ke samping dengan kecepatan berbeda, naik-turun pelan, dan menipis-menebal pelan. Periode
      tidak saling terkait, jadi polanya tidak terlihat berulang. Hanya `transform`/`opacity`
      (dijalankan compositor).
    - Lapisan: di depan foto atlet (dan bayangan kaki), di bawah lingkaran zona, label harga,
      kartu zona, tab, dan tombol "Pasang Logo di Sini". Kabut selalu berakhir di atas tombol
      (13–31 px di 15 ukuran layar).
    - Zoom ke zona di kaki bawah (titik zona `y` ≥ `zoomThinFromY` 0,62: tulang kering,
      pergelangan, sepatu): kabut menipis ke `zoomThinOpacity` (25%) supaya zona jelas.
    - Tingkat:
      - desktop/tablet: 3 lembar;
      - HP dan perangkat RAM kecil (`deviceClass` "phone"): 2 lembar, tekstur lebih kecil
        (`lite`);
      - perangkat lemah (kualitas panggung turun ke "half rate"): 1 lembar yang hanya bergeser
        (`weak`);
      - platform CSS (tanpa WebGL) dan `prefers-reduced-motion`: kabut tetap ada tapi diam.
    - Berhenti saat tab tersembunyi atau panggung di luar layar.
    - `?debug=perf` menampilkan tingkat kabut (`full` / `lite` / `simple` / `still`).
    - Densitas `thin` / `medium` / `thick` (opacity dan tinggi) dan saklar `enabled` ada di
      config. Default `medium`.

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
| Calysta | Set putaran **dari data**: 18 foto (0°–340°, tiap 20°), pose ditahan, fade 15%. Gambar tertanam sudah dihapus (2026-10-08) | Sama | Sesuai |
| Andrew | Set putaran dari data: 22 foto (tiap 16,4°), ditampilkan dengan alur yang sama (`STAGE_TURN_FLOW`: 18 titik tiap 20°, 18 foto terpakai) | Sama | Sesuai |
| Set foto putaran dari data | Kolom `turn` (sudut + `blendShare`) ada sejak SQL S0. "Bahan 360" + "Buat set putaran" + Publish tayang (#118–#122) | Sama | Sesuai |
| Atlet lain | Mode sementara (4 sisi, `autoSides`) | Sama sampai mereka punya set putaran atau video di data | Sesuai |
| Pemilihan mode | Satu aturan dari data: set putaran (`turn`) atau video → putaran, selain itu 4 sisi. Bahan tertanam sudah dihapus (2026-10-08). `?stage=` masih ada sebagai alat uji | Satu aturan berdasarkan data | Sesuai (sisa: `?stage=` di R2) |
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
- **`STAGE_TURN_VIDEO_AUTO`, `STAGE_TURN_FRAMES_AUTO`:** putaran otomatis untuk atlet dengan
  video atau set putaran **di data** (tidak ada lagi bahan yang ditanam di kode).
- **`STAGE_TURN_FLOW`:** alur putaran yang sama untuk semua atlet (`stops` 18, `blendShare`
  0,15), dipakai lewat `lib/turn-flow.ts` (bagian 1.2).
- **`STAGE_ARENA`:** arena 3D: kecepatan orbit di mode putaran, kualitas adaptif, DPR, kabut,
  dan kamera.
- **`STAGE_PLATFORM`, `STAGE_PLATFORM_ROUND`:** bentuk platform (`"hex"`, opsi `"round"`).
- **`STAGE_FOG`:** kabut panggung (bagian 1.12, **sekarang mati**): saklar, densitas, tinggi, lebar, warna,
  lembar dan kecepatannya, tingkat HP/perangkat lemah, dan penipisan saat zoom.
- **`STAGE_MEDIA`:** media frame panggung (bagian 5b): jumlah layar, host video yang diizinkan
  (`videoHosts`), host yang diputar lewat proxy (`proxyHosts`, `proxyPath`, `proxyCacheSec`),
  aturan putar video di frame (`video`), efek hover, dan ukuran poster tanpa WebGL
  (`fallbackTile`).
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

## 5b. Media frame panggung (keputusan 2026-10-06; video di frame + klik ke Instagram 2026-10-09)

- **Tujuan:** layar neon di arena 3D di belakang atlet memutar **video MP4** atlet di dalam frame.
  Klik/tap layar membawa pengunjung ke **postingan Instagram** atlet. Berlaku untuk semua atlet,
  diatur per atlet, dan layar ikut berputar bersama latar.
- **Admin: dua kolom per layar**, maksimal 6 layar (`STAGE_MEDIA.slots`). Admin hanya menempel
  link (tidak upload). Satu tombol **Cek link** mengecek kedua kolom, lalu simpan ke draft dan
  **Publish**.
  - **Kolom 1 "Video (MP4)":** file `.mp4`/`.webm` yang diputar di frame. Link YouTube atau gambar
    juga masih diterima (data lama tetap jalan).
  - **Kolom 2 "Link Instagram (tujuan klik)":** postingan/reel Instagram (`instagram.com/p/…`,
    `/reel/…`, juga `instagram.com/<user>/p/<kode>/`). Opsional.
  - **Layar hanya Instagram** (kolom 1 kosong) tetap didukung: tampil sampul postingan atau kartu
    Instagram. Link Instagram yang ditempel di kolom 1 dipindah otomatis ke kolom 2.
  - Link Instagram yang sama di kedua kolom: kolom video dikosongkan otomatis. Link Instagram lain
    di kolom video: pesan "reel Instagram tidak bisa diputar di frame; isi .mp4 atau kosongkan".
  - Keterangan tetap opsional. Teks EN/ID ada di `lib/i18n.ts`.
- **Cek video** (`checkStageMediaLink`, server): meminta file seperti browser di situs kita
  (`Origin: https://avatar.20fit.id` + `Range: bytes=0-1023`), lalu melaporkan semua yang membuat
  video tidak bisa diputar beserta faktanya (host, status HTTP, tipe, ukuran, Range, header CORS
  yang diterima, server/CDN):
  - host hanya dari `STAGE_MEDIA.videoHosts`: `media.20fit.id` dan Supabase Storage kita; hanya
    https; redirect ke host lain ditolak;
  - tipe `video/mp4` atau `video/webm`, maksimal 40 MB;
  - wajib **Range** (206 + `Content-Range`), karena iPhone/Safari tidak memutar tanpa itu;
  - wajib `Access-Control-Allow-Origin: https://avatar.20fit.id` (atau `*`), tepat satu kali.
  - Kalau semuanya lolos, browser admin membuat poster (WebP) dari video dan menyimpannya di bucket
    publik.
- **Cek Instagram** (`checkStageInstagramLink`): harus postingan/reel; 404 dari embed resmi
  ditolak. Kalau Instagram menolak server kita, link tetap dipakai dengan keterangan "format
  valid".
- **CORS media.20fit.id** (2026-10-09): media.20fit.id (di belakang Cloudflare) tidak mengirim
  header CORS. Panduan untuk pengelola server (Cloudflare Transform Rule, Apache/LiteSpeed,
  Nginx, perintah `curl`) sudah dikirim ke pemilik.
- **Proxy video** (2026-10-09, atas permintaan pemilik): video dari `STAGE_MEDIA.proxyHosts`
  (sekarang `media.20fit.id`) diputar lewat server kita, `GET /api/stage-video?u=<link>`
  (`app/api/stage-video/route.ts`), jadi tidak butuh CORS.
  - Data tetap menyimpan link asli. Panggung dan poster admin memakai alamat proxy
    (`videoPlaybackUrl`).
  - Hanya `.mp4`/`.webm` https di host itu (`proxiedVideoUpstream`). Redirect hanya diikuti ke
    file yang juga diizinkan.
  - Hanya untuk halaman kita sendiri: permintaan dari situs lain ditolak (`Sec-Fetch-Site`, 403),
    dan jawabannya tidak boleh ditanam di situs lain (`Cross-Origin-Resource-Policy:
    same-origin`).
  - Range diteruskan (iPhone/Safari). Isi video dialirkan (stream), tidak ditahan di memori, dan
    berhenti kalau pengunjung berhenti. Cache browser `proxyCacheSec` (1 hari).
  - "Cek link" untuk host ini tidak lagi mensyaratkan CORS ("Diputar lewat server kita"). Range,
    tipe, ukuran, dan 404 tetap dicek.
  - **Biaya:** setiap byte video ini lewat Railway (misalnya video 7,6 MB × jumlah pemutaran,
    dikurangi yang ada di cache browser). Kalau media.20fit.id nanti mengirim header CORS, hapus
    host itu dari `proxyHosts` supaya video langsung dari Cloudflare lagi.
  - Cadangan lain (tidak dikerjakan): pindah ke Supabase Storage (butuh SQL bucket).
- **Lain-lain (tetap):**
  - **YouTube:** wajib boleh di-embed (oEmbed resmi); thumbnail disalin ke bucket publik
    `smb-athlete-360/<atlet>/stage-media/`. Tidak diputar di frame; tap membuka lightbox
    `youtube-nocookie.com`.
  - **Gambar:** maksimal 5 MB, disalin ke bucket publik.
  - **Ditolak dengan pesan EN/ID:** http, Google Drive/Dropbox, TikTok/Facebook/X/Vimeo, halaman
    biasa, host video di luar daftar, file terlalu besar, YouTube privat/embed mati.
- **Keamanan:**
  - Hanya https; tidak boleh IP, localhost, user:password, atau port lain.
  - Server membuka link lewat `lib/safe-fetch.ts`: semua alamat DNS harus publik, redirect dicek
    ulang maksimal 3 kali, ada batas waktu dan ukuran.
  - Iframe hanya dari `www.youtube-nocookie.com` dan `www.instagram.com` (embed), dibangun dari
    ID/kode, bukan dari link mentah.
  - Link Instagram selalu dinormalkan ke `https://www.instagram.com/<p|reel|tv>/<kode>/` dan dibuka
    dengan `target="_blank" rel="noopener noreferrer"`.
- **Data:** tabel `smb_athlete_stage_media` (draft + published + versi + riwayat) lewat SQL M0
  (`supabase/migrations/20261007_smb_stage_media.sql`, **sudah dijalankan 2026-10-06**).
  - Bentuk jsonb:
    `{ v: 1, slots: [{ slot, kind, url, ig, ytId, thumb, w, h, title, checkedAt }] }`.
  - `ig` (2026-10-09) = link Instagram tujuan klik, atau `null`. Untuk `kind: "instagram"`, `ig`
    sama dengan `url`.
  - **Tanpa SQL baru:** `smb_check_stage_media` hanya memeriksa kunci yang dikenalnya, jadi `ig`
    tersimpan apa adanya. Sudah diuji dengan fungsi SQL asli di Postgres lokal. App membersihkan
    `ig` lagi saat membaca (`parseStageMedia`).
- **Panggung:** 6 layar **tegak/potret** 1,9 × 3,2 m (`STAGE_ARENA.screens`), satu setiap 60°, jarak
  sama (7,8 m). Isi layar "contain", diredupkan/diberi tint, tanpa kabut.
  - **Video di frame** (`STAGE_MEDIA.video`):
    - diputar `muted`, `playsinline`, `loop`, `crossOrigin="anonymous"` (tekstur WebGL), hanya
      untuk layar yang menghadap pengunjung (terlihat di kamera);
    - maksimal 1 video aktif di HP dan 2 di tablet/desktop; frame baru digambar maksimal 30 kali
      per detik;
    - berhenti saat kartu zona/lightbox terbuka, tab tersembunyi, atau panggung di luar layar.
  - **Poster diam** (tetap bisa diklik) muncul kalau:
    - `prefers-reduced-motion` atau Save-Data aktif;
    - autoplay ditolak (Mode Hemat Daya iOS);
    - video gagal dimuat (misalnya tanpa CORS);
    - video belum mulai dalam 8 detik.
  - **Klik/tap:**
    - layar dengan link Instagram membuka postingan di tab baru (di HP, aplikasi Instagram kalau
      terpasang);
    - layar YouTube membuka lightbox (pengecualian, karena YouTube tidak bisa diputar di frame);
    - layar lain tidak bisa diklik.
    - Geser/drag tidak pernah membuka Instagram (tap = gerak ≤ 8 px dan ≤ 600 ms).
    - Di dalam kotak atlet, tap hanya diteruskan ke layar di tempat yang transparan (bukan badan
      atlet), dan tidak saat video putaran menutupinya.
  - **Tanda bisa diklik:** ikon Instagram kecil di pojok layar; di desktop kursor pointer dan
    layar sedikit lebih terang dengan glow warna tema saat di-hover (`hoverBoost`,
    `glowOpacity`).
  - **Keyboard/pembaca layar:** link tersembunyi per layar yang bisa diklik, muncul saat fokus,
    misalnya "Lihat postingan Instagram Andrew (layar 3)".
  - **Tanpa WebGL** (platform CSS): layar tampil sebagai baris poster kecil di bawah tombol
    "Pasang Logo di Sini".
    - Ukuran tile `STAGE_MEDIA.fallbackTile`, ≥ 44 px.
    - Satu baris; bisa digeser ke samping kalau tidak muat.
    - Tile Instagram berupa link, tile YouTube membuka lightbox.
    - CSP `frame-src 'self' https://www.youtube-nocookie.com https://www.instagram.com` di
      `/atlet/*`.

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
- ~~Hapus gambar tertanam Calysta~~: selesai 2026-10-08 (bersama `STAGE_TURN_FLOW`).
- **SQL "video + 72" versi 30 Sep sudah usang:** lebih tua dari S0 (6 Okt) dan akan menimpa
  fungsi Publish set putaran. Jangan dijalankan; kalau jalur video (V4) dilanjutkan, tulis ulang
  dari definisi yang aktif (`pg_get_functiondef`).
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
