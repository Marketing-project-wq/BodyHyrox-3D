# Video 360 atlet: membuat file video di Mac

Skrip ini mengubah video mentah (latar polos, dari kamera atau AI video generator) menjadi:
- video transparan **WebM VP9 alpha** untuk Chrome, Edge dan Android;
- video transparan **HEVC alpha** untuk Safari di Mac, iPad dan iPhone;
- **72 keyframe WebP** (setiap 5°) untuk drag, tab, Pause, titik zona dan cadangan;
- `poster.webp`, `contact.jpg` (36 pose untuk dicek mata) dan `meta.json`.

Hasilnya diunggah ke draft lewat studio (tahap V4, butuh SQL). Skrip ini tidak menyentuh data
atau Storage.

## 1. Sekali saja: instal alat
```
brew install ffmpeg python@3.12
python3 -m venv ~/v360
source ~/v360/bin/activate
pip install "rembg[cli]" pillow numpy
```
- Homebrew: https://brew.sh.
- ffmpeg dari Homebrew berisi `hevc_videotoolbox`, encoder Apple yang bisa membuat HEVC dengan alpha. Encoder ini hanya ada di macOS.

## 2. Tandai video di studio
1. Buka Admin → atlet → Video 360°, pilih video, lalu klik **Buka timeline**.
2. Cek penanda Awal, Depan, Kanan, Belakang, Kiri, Akhir, dan pita diam yang dibuang.
3. Klik **Unduh penanda (JSON)**, lalu simpan file `…-marks.json` di samping videonya.

## 3. Jalankan
```
source ~/v360/bin/activate
cd BodyHyrox-3D/scripts/video360
TURN_SEC=24 ./make_360_video.sh ~/Movies/atlet.mov ~/Movies/atlet-marks.json ~/Movies/atlet-out
```

| Pengaturan | Bawaan | Arti |
|---|---|---|
| `TURN_SEC` | 24 | Lama satu putaran di hasil akhir (detik) |
| `FPS` | 30 | Frame per detik hasil akhir |
| `CANVAS` | 714x1680 | Ukuran frame; ~1,5× frame sekarang, tajam di Retina/DPR 3 |
| `SPEED` | motion | Di dalam tiap seperempat putaran, sudut mengikuti gerakan yang terukur, sehingga putaran yang cepat-lambat tetap rata. `linear` = kecepatan tetap di antara dua penanda |
| `DEDUPE` | 1 | Buang frame ganda (umum di video AI dan konversi 24→30 fps) |
| `INTERP` | 0 | 2–4 = buat frame sisipan sebelum hapus-latar (untuk klip AI pendek dengan sedikit pose). Cek `contact.jpg`: tangan dan kaki bisa melengkung |
| `FIT` | set | `set` = satu transform untuk seluruh putaran (kamera diam). `frame` = tiap frame dipaskan sendiri (kamera AI yang zoom/bergeser; kaki tetap di garis, ukuran bisa sedikit berdenyut) |
| `REMBG_MODEL` | birefnet-general-lite | `birefnet-general` lebih tajam, tapi unduh ~1 GB dan butuh RAM ≥16 GB |

Lama proses: sekitar 0,5–2 detik per pose di Mac Apple Silicon, jadi 10–25 menit untuk 720 frame.

## 4. Baca laporannya
- `distinct poses`: jumlah pose berbeda. **WARNING** muncul kalau jauh lebih sedikit dari jumlah frame hasil; putarannya akan patah-patah. Solusinya: video lebih panjang/lambat, `TURN_SEC` lebih kecil, atau `INTERP=2..4`.
- `body height … varies`: kalau lebih dari 4%, kamera ber-zoom atau bergeser. Coba `FIT=frame`.
- `check sole line`: garis telapak di semua frame harus dekat target (±2–3 px). Kalau melebar, atlet melangkah, kakinya "meluncur", atau bayangan lantai ikut terpotong.
- `check loop seam`: loncatan frame terakhir → pertama harus setara satu langkah biasa. Kalau ada WARNING, geser penanda **Akhir** 1–3 frame di timeline, unduh ulang, lalu jalankan lagi.
- `check colours`: sudut-sudut yang warna badannya berbeda, misalnya baju atau rambut berubah di sisi belakang pada video AI.
- `athlete-vp9.webm: alpha OK`.
- **Selalu buka `contact.jpg`**: cek wajah, rambut, logo baju dan sepatu di setiap 10°.

Cek HEVC alpha: buka `athlete-hevc.mov` di Safari di atas halaman berwarna. Latarnya harus transparan, bukan hitam.

## 5. Video dari AI video generator

### Spesifikasi
- **Mode:** image-to-video dari **foto asli atlet** (menghadap kamera, seluruh badan), supaya wajah dan baju sesuai. Kalau alatnya bisa memakai **frame awal dan frame akhir**, pakai foto yang **sama** untuk keduanya: sambungan loop jadi mulus.
- **Durasi:** sepanjang yang bisa (10–20 detik) untuk **tepat satu putaran**. Lebih banyak pose berarti lebih halus. Jangan lebih dari satu putaran.
- **Resolusi:** portrait **1080×1920** minimal (4K kalau tersedia). Atlet mengisi ~85% tinggi frame, dengan seluruh badan dan kaki terlihat.
- **fps:** 30 kalau ada (24 juga bisa). Jangan pakai "slow motion" buatan alat.
- **Kamera:** diam total (tanpa zoom, pan, dolly atau goyang), setinggi pinggul, lurus ke depan.
- **Latar:** polos, abu-abu muda atau putih, rata, tanpa lantai bertekstur, tanpa bayangan keras. Kalau baju atau sepatu putih, pakai latar abu-abu atau hijau.
- **Gerak:** atlet **diam dengan pose yang sama** di atas **meja putar** yang berputar pelan dan rata. Kaki tidak melangkah, tangan tidak bergerak.
- **Contoh prompt (EN):** "Full-body shot of the same athlete standing perfectly still on a slowly rotating turntable, one complete 360-degree clockwise rotation at constant speed over the whole clip, feet planted, arms relaxed at the sides, static locked-off camera at hip height, plain seamless light-grey studio background, soft even lighting, no shadows, no camera movement, no zoom, same outfit and hairstyle from every angle, starts and ends facing the camera."

### Yang ditangani skrip, dan yang tidak
- **Frame ganda: ditangani.** `DEDUPE=1` membuangnya sebelum sudut dihitung.
- **Kecepatan tidak rata: ditangani.** `SPEED=motion` meratakan di dalam tiap seperempat putaran, memakai penanda Depan/Kanan/Belakang/Kiri. Makin tepat penandanya, makin rata hasilnya.
- **Terlalu sedikit pose** (klip pendek): **sebagian**. `INTERP=2..4` menambah frame sisipan; cek `contact.jpg`.
- **Kamera zoom/bergeser: sebagian.** Terdeteksi (`body height varies`), dan `FIT=frame` menjaga kaki di garis.
- **Wajah, rambut atau baju berubah di sisi belakang: TIDAK bisa diperbaiki skrip.** Skrip hanya menandai (`check colours`) dan menampilkannya di `contact.jpg`. Solusinya generate ulang; beri foto referensi sisi dan belakang kalau alatnya mendukung.
- **Kaki meluncur atau "melayang": TIDAK bisa diperbaiki**, hanya terlihat di `check sole line`. Solusinya generate ulang dengan prompt meja putar.
- **Loop:** penanda Akhir menentukan satu putaran tepat, dan `check loop seam` memberi tahu kalau sambungannya meloncat.

## 6. Tes skrip tanpa rembg
`BG=colorkey` memakai colour key putih sederhana. Mode ini hanya untuk mengecek alur skrip, bukan untuk hasil akhir.
