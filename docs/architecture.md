# Satu Worker

waflow adalah satu aplikasi SvelteKit di root repository. Dashboard, API, Durable Object, Queue consumer, dan cron memakai satu deployment Cloudflare Worker.

- `src/routes`: panel dan server action.
- `src/hooks.server.ts`: endpoint publik `/api/*` ke handler Hono.
- `src/lib/server/gateway`: validasi, autentikasi, sesi WhatsApp, pesan, dan webhook.
- `src/lib/server/api.ts`: server action memanggil handler yang sama langsung tanpa jaringan internal.
- `src/worker.ts`: class `WaSession`, Queue consumer, dan cron.
- `scripts/worker-build.ts`: menggabungkan fetch hasil adapter resmi dengan ekspor background. Renderer server berada di luar assets publik.
- `migrations`: migrasi D1 yang sama dengan versi sebelum refactor.
- `wrangler.jsonc`: satu konfigurasi binding dan deployment.

Deployment mempertahankan `SESSION_SECRET` yang sudah ada. Instalasi baru membuat secret acak sebelum migrasi D1 dan deploy. Lokal membuat secret di `.dev.vars` dan menjalankan bundle yang sama dengan Wrangler.

## Instalasi yang sudah berjalan

Pertahankan nama Worker, ID D1, nama Queue, class `WaSession`, tag migrasi DO `v1`, dan `SESSION_SECRET` dari instalasi yang sudah terpasang. Nama Worker berbeda berarti namespace DO berbeda. Resource produksi tidak dihapus atau dimigrasi otomatis oleh refactor ini.

Endpoint API berpindah ke `/api/*`; integrasi perlu memperbarui URL. Tidak ada deploy frontend/backend terpisah atau variabel alamat API.

## Verifikasi

`bun run check:deploy`, `bun run check`, `bun run build`, dan `bun run test` memeriksa konfigurasi, tipe, bundle Worker, dan alur gateway/webhook. Smoke gabungan menguji login dashboard, seluruh halaman panel, assets, API terautentikasi, D1, DO, cron, serta CSRF. Tes Queue dan webhook memakai receiver terkontrol dan tidak menghubungi WhatsApp.

Browser Worker lokal sudah membuktikan login dan panel pada host yang sama dengan API. Deploy Cloudflare dan WhatsApp nyata setelah refactor belum diuji.
