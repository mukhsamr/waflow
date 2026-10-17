# waflow

Gateway WhatsApp untuk Cloudflare. Kelola sesi, kirim teks lewat API, dan terima event melalui webhook.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fmukhsamr%2Fwhatsapp)

**Sesi & QR** · **API key** · **Webhook** · **Log aktivitas**

## Deploy ke Cloudflare

Tombol memasang API, D1, Durable Object, dan Queues. Dashboard dipasang terpisah karena [Cloudflare belum mendukung deploy beberapa Worker sekaligus](https://developers.cloudflare.com/workers/platform/deploy-buttons/#limitations). Untuk memakai tombol, repository harus **public**.

### 1. API

Klik tombol di atas, hubungkan akun GitHub dan Cloudflare, lalu isi:

| Konfigurasi | Isi |
| --- | --- |
| `ADMIN_EMAIL` | Email login |
| `ADMIN_NAME` | Nama operator |
| `ADMIN_PASSWORD` | Password login (secret) |

`SESSION_SECRET` dibuat otomatis saat deploy pertama dan dipertahankan saat deploy ulang.

Gunakan pengaturan berikut. Migrasi D1 dijalankan otomatis saat deploy.

| Pengaturan | API | Dashboard |
| --- | --- | --- |
| Root directory | `/` | `/` |
| Build command | `bun run build` | `bun install --frozen-lockfile && bun run --cwd apps/dashboard build` |
| Deploy command | `bun run deploy` | `bun run deploy:dashboard` |

Setelah berhasil, periksa `/health` dan salin URL dasar API.

### 2. Dashboard

1. Di repository salinan hasil deploy API, isi `vars.API_URL` pada [`apps/dashboard/wrangler.jsonc`](apps/dashboard/wrangler.jsonc) dengan URL HTTPS API, tanpa `/health`.
2. Buka **Workers & Pages → Create → Import a repository** dan pilih repository salinan tersebut.
3. Buat Worker dengan nama sesuai `name` di konfigurasi (default `dashboard`), lalu gunakan pengaturan Dashboard pada tabel di atas.
4. Buka dashboard, login, buat sesi, dan scan QR. Uji kirim/terima teks serta webhook.

<details>
<summary>Catatan instalasi</summary>

- Instalasi API memakai [`wrangler.jsonc`](wrangler.jsonc) di root. Pertahankan konfigurasi hasil provisioning untuk deploy berikutnya.
- Jika dead-letter Queue belum dibuat otomatis, buat Queue sesuai kedua nilai `dead_letter_queue` dalam konfigurasi API.
- Gunakan `bun install --frozen-lockfile` jika diminta perintah instalasi dependency. Biarkan watch path mencakup root, `apps/`, `patches/`, dan `bun.lock`.
- Ganti `namespace_id` rate limit jika sudah dipakai Worker lain di akun Anda.
- Secret disimpan di Cloudflare atau `.dev.vars` lokal, jangan di Git. Tinjau migrasi baru sebelum deploy ulang ke produksi.

</details>

## Development

Memerlukan [Bun](https://bun.sh). Salin `apps/api/.dev.vars.example` ke `apps/api/.dev.vars`, lalu isi konfigurasi lokal.

```sh
bun install
bun run --cwd apps/api db:local:setup
bun run dev:api
```

Di terminal lain:

```sh
bun run dev:dashboard
```

Dashboard: [localhost:5173](http://localhost:5173) · API: [localhost:8787/health](http://localhost:8787/health)

Konfigurasi API lokal memakai `apps/api/wrangler.jsonc`.

```sh
bun run check:deploy
bun run check
bun run build
```

Koneksi WhatsApp bersifat semi-persisten. Media belum tersedia; instalasi Cloudflare nyata belum diverifikasi.
