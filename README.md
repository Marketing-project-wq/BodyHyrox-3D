# BodyHyrox-3D

Aplikasi web 20FIT: **Super Admin Dashboard** sebagai halaman utama, plus
landing page marketing 3D (Three.js). Dilayani oleh server **Node.js / Express**
yang siap di-deploy ke **Railway**.

## Struktur

```
BodyHyrox-3D/
├── server.js          # Server Express (bind ke process.env.PORT)
├── package.json       # Dependency & start script
├── railway.json       # Konfigurasi deploy Railway
└── public/
    ├── index.html     # Halaman utama — 20FIT Super Admin Dashboard
    ├── landing.html   # Landing page marketing 3D (Three.js)
    ├── styles.css     # Styling landing page
    └── main.js        # Scene 3D landing page (Three.js)
```

## Halaman

| Rute            | Isi                                |
| --------------- | ---------------------------------- |
| `/`             | 20FIT Super Admin Dashboard        |
| `/landing.html` | Landing page marketing BodyHyrox   |
| `/health`       | Health check (`{ "status": "ok" }`) |

## Menjalankan secara lokal

```bash
npm install
npm start
```

Buka http://localhost:3000

## Deploy ke Railway

Railway (Railpack) otomatis mendeteksi project Node.js:

1. `npm install` — memasang dependency
2. `npm start` — menjalankan `node server.js`

Server otomatis membaca `process.env.PORT` yang disediakan Railway.

> Setelah deploy hijau, buka **Settings → Networking → Generate Domain**
> (atau **Custom Domain**) di dashboard Railway untuk mendapatkan URL publik.
