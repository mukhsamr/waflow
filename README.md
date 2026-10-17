# waflow

Gateway WhatsApp di Cloudflare. Dashboard dan API dalam satu Worker.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fmukhsamr%2Fwaflow)

**Sesi & QR** · **API key** · **Webhook** · **Log aktivitas**

## Deploy

1. Klik tombol, lalu hubungkan GitHub dan Cloudflare.
2. Isi `ADMIN_EMAIL`, `ADMIN_NAME`, dan secret `ADMIN_PASSWORD`.
3. Gunakan root `/`, build `bun run build`, dan deploy `bun run deploy`.
4. Buka URL Worker, login, buat sesi, lalu scan QR.

D1, Durable Object, dan Queues diprovisikan oleh Cloudflare. Migrasi D1 dan pembuatan `SESSION_SECRET` dijalankan otomatis; secret yang sudah ada dipertahankan.

Jika dead-letter Queue belum diprovisikan, buat `waflow-outgoing-failed` dan `waflow-incoming-failed` sebelum mengulang deploy.

Dashboard tersedia di `/`; API di `/api/*`. Health check: `/api/health`.

## Development

Memerlukan [Bun](https://bun.sh). Buat `.dev.vars` berisi `ADMIN_EMAIL` dan `ADMIN_PASSWORD` untuk login lokal.

```sh
bun install
bun run db:local:setup
bun run dev
```

Buka [localhost:8787](http://localhost:8787). Secret sesi lokal dibuat otomatis. Jalankan ulang `bun run dev` setelah mengubah kode.

```sh
bun run check:deploy
bun run check
bun run build
bun run test
```

Untuk instalasi yang sudah ada, pertahankan nama Worker, ID D1, nama Queue, migrasi DO `v1`, dan `SESSION_SECRET` milik instalasi tersebut. Jangan menyalin placeholder database ke konfigurasi produksi yang sudah diprovisikan.

Koneksi WhatsApp bersifat semi-persisten. Media belum tersedia. Deploy Cloudflare dan koneksi WhatsApp nyata setelah refactor belum diuji.
