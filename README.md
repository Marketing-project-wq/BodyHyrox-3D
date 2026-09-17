# BodyHyrox-3D

Landing page marketing 3D interaktif untuk brand kebugaran & kompetisi Hyrox.
Dibangun dengan **Three.js** dan dilayani oleh server **Node.js / Express**
yang siap di-deploy ke **Railway**.

## Struktur

```
BodyHyrox-3D/
├── server.js         # Server Express (bind ke process.env.PORT)
├── package.json      # Dependency & start script
├── railway.json      # Konfigurasi deploy Railway
└── public/
    ├── index.html    # Halaman landing
    ├── styles.css    # Styling
    └── main.js       # Scene 3D (Three.js)
```

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
> di dashboard Railway untuk mendapatkan URL publik (service saat ini masih
> "Unexposed").

## Health check

`GET /health` → `{ "status": "ok" }`
