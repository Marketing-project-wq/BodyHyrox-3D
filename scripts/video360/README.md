# Putaran 360° atlet: membuat urutan gambar di Mac

Di panggung, atlet **berdiri diam menghadap depan**. Hanya latarnya yang berputar, seperti kamera
yang berjalan mengelilingi atlet. Skrip ini membuat urutan gambarnya dari satu video putar:

1. **Hapus latar dari frame ASLI, tentukan sudutnya, lalu ambil hanya frame berdiri.** Sudut
   tiap frame dihitung dari penanda (Depan/Kanan/Belakang/Kiri), gerakannya, dan bentuk badan
   (pinggul dan bahu paling lebar dari depan/belakang, paling sempit dari samping). Frame saat
   atlet melangkah atau mengangkat kaki dibuang.
2. **Isi celah sudut**, dari yang paling tajam:
   - **cermin** (`GAP_FILL=mirror`, bawaan): celah di atas 25° diisi frame berdiri dari sisi
     seberang yang dibalik kiri-kanan (frame di sudut a, dibalik, menjadi sudut 360 − a). Dua
     celah cermin yang hanya dipisah beberapa frame asli dijadikan satu, karena setiap pergantian
     sumber bisa terlihat sebagai loncatan kecil pada pose;
   - **RIFE bertahap**: celah yang masih di atas 6° diberi frame bantu dari sisi yang sama, yaitu
     frame yang posisi kakinya paling mirip dengan gambar sebelum dan sesudahnya, supaya kaki tidak
     meloncat dan RIFE tidak pernah menjembatani celah lebar;
   - **RIFE** (interpolasi) untuk setiap sudut di antaranya.
3. **Badan 100% padat**: lubang kecil diisi, bagian badan tidak ada yang tembus pandang; hanya
   tepi luar dan rambut yang halus.
4. **Cek kualitas setiap gambar**: bagian tembus pandang, dan bentuk badan atau sepatu yang
   berubah mendadak dibanding gambar tetangganya. Gambar yang gagal diganti: sepatunya diambil
   dari frame asli terdekat, atau seluruh gambar diganti frame asli terdekat. Semuanya
   dilaporkan.
5. **Setiap gambar dikunci** di tempat yang sama: garis telapak, tinggi badan dan tengah badan
   persis sama (selisih di bawah 1 px).
6. **Gambar pertama = Depan (0°).** Satu putaran penuh dengan jarak sudut rata, lalu kembali ke
   Depan tanpa sambungan. Gambar ke-k = sudut 360 × k / n, sama dengan sudut latar saat gambar itu
   tampil.

**Yang ikut terbalik di gambar cermin:** jam tangan pindah ke pergelangan sebelah, logo di baju dan
legging terbalik dan pindah sisi, arah kibasan rambut, dan belahan atau lipatan baju yang tidak
simetris. Kalau ini mengganggu, pakai `GAP_FILL=anchor` (tanpa cermin; bagian yang melangkah
lebih banyak) atau rekam ulang.

Hasil (bawaan: 60 detik per putaran, 24 gambar per detik = 1.440 gambar):
- **WebM VP9 alpha** (Chrome, Edge, Android) dan **HEVC alpha** (Safari Mac/iPad/iPhone, hanya
  bisa dibuat di Mac);
- **72 keyframe WebP** (setiap 5°) untuk drag, tab, Pause dan titik zona;
- `feet.json` (telapak tiap gambar, untuk bayangan), `poster.webp`, `contact.jpg` (24 gambar
  setiap 15°, ukuran penuh, dengan garis kunci) dan `meta.json` (termasuk hasil cek kunci dan cek
  kualitas).

Skrip ini tidak menyentuh data atau Storage. Hasilnya diunggah ke draft lewat studio (tahap V4).

## 1. Sekali saja: instal alat
```
brew install ffmpeg python@3.12
python3 -m venv ~/v360
source ~/v360/bin/activate
pip install "rembg[cli]" pillow numpy scipy
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
| `GAP_FILL` | mirror | `mirror` (cermin + RIFE bertahap), `anchor` (RIFE bertahap tanpa cermin), `rife` (hanya frame berdiri + RIFE) |
| `MIRROR_GAP` | 25 | Dengan `mirror`: hanya celah yang lebih lebar dari ini (derajat) yang diisi gambar cermin |
| `SIDE_PHOTOS` | (kosong) | Opsional: foto atlet berdiri tepat dari samping (Kanan dan/atau Kiri, urutan bebas), dipisah koma. Tiap foto dipasang di 90° atau 270°, sesuai sisi yang paling cocok dengan video |
| `RIFE_BIN` | rife-ncnn-vulkan | Lokasi program RIFE |
| `STEP_TOL` | 0.006 | Garis telapak bergeser ≥0,6% tinggi badan antar frame = melangkah |
| `LEG_GUARD` | 1.8 | Kaki berubah ≥1,8× lebih banyak dari badan atas (median 3 pasang frame) = melangkah |
| `SHARPEN` | 0 | Penajaman ringan pada warna (0 = mati, 0.3–0.6 = ringan) |
| `REMBG_MODEL` | birefnet-general-lite | `isnet-general-use` ±10× lebih cepat, sedikit lebih kasar |

Lama proses di Mac Apple Silicon: ±20–40 menit (hapus latar ±1 detik per gambar).

### Foto samping (opsional, disarankan kalau atlet melangkah di sisi samping)
Kalau di video atlet melangkah saat tampak samping, frame berdiri di 90° dan 270° tidak ada.
Foto berdiri tepat dari samping mengisinya:
```
SIDE_PHOTOS=~/Movies/atlet-kanan.jpg,~/Movies/atlet-kiri.jpg RIFE_BIN=~/v360/rife/rife-ncnn-vulkan ./make_360_video.sh …
```
- Baju, sepatu, rambut dan jam tangan harus sama dengan di video. Pose berdiri tegak, kaki rapat,
  seluruh badan dan sepatu terlihat. Latar polos (warna apa saja).
- Skrip menyamakan ukuran, posisi dan warna foto dengan video, dan membersihkan tepi rambut dari
  warna latar foto. Laporannya menyebut sisi yang dipilih (`side photo …: Right/Left`); kalau ada
  WARNING, cek fotonya.
- Makin besar resolusi foto, makin tajam sudut samping (idealnya tinggi badan ≥ 1.000 px).

## 4. Baca laporannya
- `standing: N; dropped M` dan daftar sudut yang dibuang beserta alasannya (melangkah atau kaki
  terangkat).
- `gap … standing frames of the other side, flipped`: celah yang diisi gambar cermin.
- `widest RIFE gaps`: celah terlebar yang masih dijembatani RIFE (idealnya ≤ 6–10°).
- `check quality`: jumlah gambar yang gagal cek (tembus pandang, bentuk badan atau sepatu yang
  meloncat) dan cara perbaikannya. Daftar lengkapnya ada di `meta.json` → `qualityCheck`.
- `check lock`: rentang garis telapak, tinggi badan dan posisi tengah di semua gambar. Targetnya
  0–1 px.
- `check loop seam`: sambungan gambar terakhir → pertama. Kalau ada WARNING, geser penanda
  **Akhir** 1–3 frame, unduh ulang penanda, lalu jalankan lagi.
- `athlete-vp9.webm: alpha OK`.
- **Selalu buka `contact.jpg`:** 24 gambar setiap 15°. Garis biru = garis telapak, puncak kepala
  dan tengah badan. Atlet harus berdiri tegak di garis yang sama di semua sudut.

## 4a. Urutan gambar untuk panggung
Panggung memakai **urutan gambar**, bukan video, supaya jalan di semua browser (termasuk Safari dan
iPhone) tanpa beban decode video:
```
python3 export_frames.py ~/Movies/atlet-out ~/Movies/atlet-gambar 12 1680
```
Hasilnya N gambar WebP (`000.webp` = Depan, lalu setiap 360/N derajat; Kanan di N/4, Belakang di
N/2, Kiri di 3N/4; N harus kelipatan 4) dan `feet.json`.
- **Foto tajam di sisi utama** (opsional): `PHOTOS_AT="90=kanan.jpg,180=belakang.jpg,270=kiri.jpg"`.
  Latar foto dihapus, badannya dikunci di garis telapak, tinggi dan tengah yang sama.
- **Selalu pakai folder baru** setiap kali gambarnya berubah (misalnya `atlet-turn-v3`) dan ubah
  `baseUrl` di `STAGE_FRAMES_BUNDLED`: browser menyimpan gambar lama dengan nama file yang sama.
- **Atlet yang memutar badannya sendiri di video** (posenya berubah dari sudut ke sudut): pakai
  sedikit pose, misalnya **12** (setiap 30°), dengan `blendShare` kecil (0,15) di
  `STAGE_FRAMES_BUNDLED`. Atlet berdiri diam di tiap pose, lalu pose berikutnya masuk dengan fade
  singkat.
- **Rekaman meja putar** (atlet benar-benar diam): pakai banyak gambar, misalnya **120** (setiap
  3°) dengan tinggi 1260, tanpa `blendShare`, supaya putarannya mulus terus.

## 4b. Ketajaman
- Langkah paling aman: **perbesar frame asli dulu dengan Real-ESRGAN** (di Mac memakai GPU), lalu
  jalankan skrip pada hasilnya. Contoh:
  `ffmpeg -i atlet.mp4 frames/%05d.png`, lalu
  `realesrgan-ncnn-vulkan -i frames -o frames2x -n realesrgan-x4plus -s 2`, lalu
  `ffmpeg -framerate 30 -i frames2x/%05d.png -c:v libx264 -crf 12 -pix_fmt yuv420p atlet-2x.mp4`.
  Cek wajah dan tulisan di `contact.jpg`: Real-ESRGAN kadang membuat kulit terlalu halus.
- `SHARPEN=0.4` menajamkan warna sedikit setelah interpolasi, tanpa menyentuh tepi transparan.
- Model hapus latar `birefnet-general-lite` (bawaan) memberi tepi lebih rapi (rambut, sela jari)
  daripada `isnet-general-use`.

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
