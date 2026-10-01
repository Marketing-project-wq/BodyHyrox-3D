# Putaran 360° atlet: membuat urutan gambar di Mac

Di panggung, atlet **berdiri diam menghadap depan**. Hanya latarnya yang berputar, seperti kamera
yang berjalan mengelilingi atlet. Skrip ini membuat urutan gambarnya dari satu video putar:

1. **Hanya frame berdiri.** Frame saat atlet melangkah atau mengangkat kaki dibuang.
2. **Celah diisi interpolasi (RIFE)** di antara dua frame berdiri yang mengapitnya, jadi setiap
   gambar tetap pose berdiri.
3. **Setiap gambar dikunci** di tempat yang sama: garis telapak, tinggi badan dan posisi tengah
   badan persis sama (tidak naik-turun, membesar-mengecil atau geser).
4. **Gambar pertama = Depan (0°).** Satu putaran penuh dengan jarak sudut rata, lalu kembali ke
   Depan tanpa sambungan. Gambar ke-k = sudut 360 × k / n, sama dengan sudut latar saat gambar itu
   tampil.

Hasil (bawaan: 60 detik per putaran, 24 gambar per detik = 1.440 gambar):
- **WebM VP9 alpha** (Chrome, Edge, Android) dan **HEVC alpha** (Safari Mac/iPad/iPhone, hanya
  bisa dibuat di Mac);
- **72 keyframe WebP** (setiap 5°) untuk drag, tab, Pause dan titik zona;
- `feet.json` (telapak tiap gambar, untuk bayangan), `poster.webp`, `contact.jpg` (24 gambar
  setiap 15° dengan garis kunci) dan `meta.json` (termasuk hasil cek kunci).

Skrip ini tidak menyentuh data atau Storage. Hasilnya diunggah ke draft lewat studio (tahap V4).

## 1. Sekali saja: instal alat
```
brew install ffmpeg python@3.12
python3 -m venv ~/v360
source ~/v360/bin/activate
pip install "rembg[cli]" pillow numpy
```
**RIFE** (interpolasi frame, memakai GPU Mac):
1. Unduh `rife-ncnn-vulkan-20221029-macos.zip` dari
   https://github.com/nihui/rife-ncnn-vulkan/releases.
2. Di Terminal:
   ```
   unzip ~/Downloads/rife-ncnn-vulkan-20221029-macos.zip -d ~/v360/
   mv ~/v360/rife-ncnn-vulkan-20221029-macos ~/v360/rife
   xattr -dr com.apple.quarantine ~/v360/rife
   ```

## 2. Tandai video di studio
1. Admin → atlet → Video 360°, pilih video, lalu klik **Buka timeline**.
2. Cek penanda **Depan** (atlet tepat menghadap kamera), Kanan, Belakang, Kiri, **Akhir** (kembali
   tepat menghadap kamera) dan pita diam.
3. Klik **Unduh penanda (JSON)** dan simpan di samping videonya.

## 3. Jalankan
```
source ~/v360/bin/activate
cd BodyHyrox-3D/scripts/video360
RIFE_BIN=~/v360/rife/rife-ncnn-vulkan ./make_360_video.sh ~/Movies/atlet.mp4 ~/Movies/atlet-marks.json ~/Movies/atlet-out
```

| Pengaturan | Bawaan | Arti |
|---|---|---|
| `TURN_SEC` | 60 | Lama satu putaran (detik) |
| `FPS` | 24 | Gambar per detik (60 × 24 = 1.440 gambar) |
| `CANVAS` | 714x1680 | Ukuran gambar |
| `RIFE_BIN` | rife-ncnn-vulkan | Lokasi program RIFE |
| `STEP_TOL` | 0.006 | Garis telapak bergeser ≥0,6% tinggi badan antar frame = melangkah |
| `LEG_GUARD` | 1.8 | Kaki berubah ≥1,8× lebih banyak dari badan atas (median 3 pasang frame) = melangkah |
| `REMBG_MODEL` | birefnet-general-lite | `isnet-general-use` ±10× lebih cepat, sedikit lebih kasar |

Lama proses di Mac Apple Silicon: ±20–40 menit (hapus latar ±1 detik per gambar).

## 4. Baca laporannya
- `standing: N; dropped M` dan daftar sudut yang dibuang beserta alasannya (melangkah atau kaki
  terangkat).
- `largest gaps filled by interpolation`: celah terbesar yang diisi RIFE. Celah di atas ±20° bisa
  terlihat kurang tajam; cek `contact.jpg` di sudut itu.
- `check lock`: rentang garis telapak, tinggi badan dan posisi tengah di semua gambar. Targetnya
  0–1 px.
- `check loop seam`: sambungan gambar terakhir → pertama. Kalau ada WARNING, geser penanda
  **Akhir** 1–3 frame, unduh ulang penanda, lalu jalankan lagi.
- `athlete-vp9.webm: alpha OK`.
- **Selalu buka `contact.jpg`:** 24 gambar setiap 15°. Garis biru = garis telapak, puncak kepala
  dan tengah badan. Atlet harus berdiri tegak di garis yang sama di semua sudut.

Cek HEVC alpha: buka `athlete-hevc.mov` di Safari di atas halaman berwarna. Latarnya harus
transparan, bukan hitam.

## 5. Video dari AI video generator
- **Mode:** image-to-video dari **foto depan asli atlet** (seluruh badan). Kalau bisa, pakai foto
  yang sama sebagai frame awal dan frame akhir.
- **Durasi:** sepanjang mungkin (10–20 detik) untuk **tepat satu putaran**.
- **Resolusi:** portrait minimal 1080×1920; atlet mengisi ±85% tinggi frame.
- **Kamera:** diam total, setinggi pinggul. **Latar:** polos abu-abu muda atau putih.
- **Contoh prompt (EN):** "Full-body shot of the same athlete standing perfectly still on a slowly
  rotating turntable, one complete 360-degree rotation at constant speed over the whole clip, feet
  planted together, arms relaxed at the sides, static locked-off camera at hip height, plain
  seamless light-grey studio background, soft even lighting, no camera movement, no zoom, same
  outfit and hairstyle from every angle, starts and ends facing the camera."
- **Yang ditangani skrip:** kecepatan tidak rata, frame ganda, langkah atau kaki terangkat
  (dibuang dan diisi RIFE), ukuran dan posisi yang berubah (dikunci).
- **Yang TIDAK bisa diperbaiki skrip:** wajah, rambut atau baju yang berubah di sisi belakang.
  Generate ulang video AI-nya.

## 6. Tes skrip tanpa rembg
`BG=colorkey` memakai colour key putih sederhana. Mode ini hanya untuk mengecek alur skrip, bukan
untuk hasil akhir. Tanpa GPU: `RIFE_GPU=-1` (CPU, lambat).
