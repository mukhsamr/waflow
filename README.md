# waflow

Gateway WhatsApp open source untuk satu instalasi Cloudflare dengan satu panel operator. Paket dikelola dengan Bun. Aturan proyek ada di [`.ai/spec.md`](.ai/spec.md).

## Deploy ke Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fmukhsamr%2Fwhatsapp)

Untuk memakai tombol ini, repository harus **public**. Tombol memasang **Worker API** beserta D1, Durable Object, dan Queues di akun Cloudflare pemasang. Dashboard dipasang sesudah API berhasil. Cloudflare belum mendukung deploy beberapa Worker sekaligus melalui tombol ini; jangan memakai URL subfolder karena API membutuhkan workspace, lockfile, dan patch dari root. [Batas tombol deploy Cloudflare](https://developers.cloudflare.com/workers/platform/deploy-buttons/#limitations).

### 1. Pasang API

1. Klik tombol, hubungkan GitHub dan akun Cloudflare, lalu tentukan nama repository salinan dan Worker API.
2. Tinjau resource yang dibuat: D1 `DB`, Durable Object `WA_SESSIONS`, dua Queue utama dan dua dead-letter Queue. Pastikan kedua `dead_letter_queue` pada konfigurasi consumer sesuai nama Queue gagal yang dibuat. Jika Queue gagal belum diprovisikan, buat melalui **Queues → Create** sebelum mengulang deploy.
3. Isi empat secret yang diminta: `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` yang kuat, dan `SESSION_SECRET` acak minimal 32 karakter. Contoh pembuat secret lokal: `bun -e "console.log(crypto.randomUUID() + crypto.randomUUID())"`. Simpan secret ini; menggantinya membuat konfigurasi webhook tersimpan tidak dapat dibaca.
4. Pertahankan root directory `/`, build command `bun run build`, dan deploy command `bun run deploy`. Instalasi dependency memakai Bun dari `bun.lock`; jika pengaturan instalasi perlu ditentukan, gunakan `bun install --frozen-lockfile`.
5. Cloudflare membuat resource dan memperbarui konfigurasi root. Script deploy menerapkan seluruh migrasi D1 melalui binding `DB`, lalu deploy API. Setelah berhasil, buka `https://<worker-api>.<subdomain-akun>.workers.dev/health` dan salin URL dasar API.

Konfigurasi instalasi adalah **`wrangler.jsonc` di root**, bukan `apps/api/wrangler.jsonc` yang dipakai pengembangan lokal. Konfigurasi root tidak memuat account ID atau UUID D1 pengembangan. R2 belum diperlukan karena fitur media belum aktif. Jika `namespace_id` untuk `LOGIN_RATE_LIMIT` sudah dipakai Worker lain, ganti dengan angka positif yang belum dipakai. Provisioning mengikuti dukungan akun Cloudflare; jika dashboard meminta aktivasi layanan atau paket, selesaikan dahulu. [Provisioning resource](https://developers.cloudflare.com/workers/platform/deploy-buttons/#automatic-resource-provisioning).

### 2. Pasang dashboard

Gunakan **repository salinan yang dibuat pada langkah API**, sehingga konfigurasi resource hasil provisioning tetap tersimpan.

1. Pada repository tersebut, isi `vars.API_URL` di `apps/dashboard/wrangler.jsonc` dengan URL dasar HTTPS API yang sudah berhasil, lalu commit. Jangan memakai `localhost` atau menambahkan `/health`.
2. Di **Workers & Pages → Create → Import a repository**, pilih repository tersebut dan buat Worker kedua.
3. Gunakan pengaturan berikut:

| Pengaturan | Nilai |
| --- | --- |
| Worker name | Sama dengan `name` di `apps/dashboard/wrangler.jsonc` (default `dashboard`) |
| Root directory | `/` |
| Build command | `bun install --frozen-lockfile && bun run --cwd apps/dashboard build` |
| Deploy command | `bun run deploy:dashboard` |

API dan dashboard memakai repository yang sama dengan deploy command berbeda. Biarkan perubahan root, `patches/`, `bun.lock`, dan `apps/` memicu build; jangan membatasi watch path hanya ke satu subfolder tanpa menyertakan dependency workspace. [Monorepo Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/).

### 3. Verifikasi instalasi

Buka dashboard, login memakai kredensial yang diisi, buat sesi, scan QR, lalu uji kirim/terima teks dan webhook. Koneksi WhatsApp bersifat semi-persisten; keberhasilan build belum membuktikan koneksi WhatsApp pada Cloudflare remote.

Untuk memeriksa konfigurasi tanpa deploy: `bun run check:deploy`, `bun run check`, dan `bun run build`. Tombol baru memakai perubahan setelah di-commit dan di-push ke branch default GitHub. Jangan menjalankan `bun run deploy` pada database produksi sebelum meninjau migrasi yang belum diterapkan.

## Lokal

```powershell
bun install
if (!(Test-Path apps/api/wrangler.jsonc)) { Copy-Item apps/api/wrangler.example.jsonc apps/api/wrangler.jsonc }
if (!(Test-Path apps/dashboard/wrangler.jsonc)) { Copy-Item apps/dashboard/wrangler.example.jsonc apps/dashboard/wrangler.jsonc }
Copy-Item apps/api/.dev.vars.example apps/api/.dev.vars
# Isi ADMIN_EMAIL, ADMIN_PASSWORD, dan SESSION_SECRET acak (minimal 32 karakter) di apps/api/.dev.vars.
bun run --cwd apps/api db:local:setup
bun run dev:api
# terminal lain
bun run dev:dashboard
```

Dashboard dev: http://localhost:5173; API: http://localhost:8787/health. Akun demo `admin@example.test` / `password` hanya berlaku jika disetel di `.dev.vars` lokal. Tidak ada akun seed D1 atau registrasi. Untuk produksi, isi `ADMIN_EMAIL`, `ADMIN_PASSWORD`, dan `SESSION_SECRET` sebagai secret Worker API (`bunx wrangler secret put NAMA_SECRET`); `ADMIN_NAME` diisi sebagai secret juga. Jangan gunakan password contoh.

API key integrasi dibuat dan dicabut di Pengaturan; D1 tetap dipakai untuk key dan metadata sesi. Konfigurasi Wrangler disimpan di Git; template `wrangler.example.jsonc` tersedia untuk pengembangan lokal. Secret lokal tetap di `.dev.vars` yang diabaikan Git; secret produksi diatur melalui Cloudflare. Pada instalasi dari tombol, gunakan konfigurasi root yang diperbarui Cloudflare untuk migrasi dan deploy API berikutnya; perubahan `apps/api/wrangler.jsonc` tidak mengubah konfigurasi instalasi root.

waflow mengikuti fitur inti gateway Evolution API: sesi/QR/koneksi, kirim teks API, API key, webhook per sesi dan log operasional. Dashboard menyediakan Kirim teks, Log aktivitas tanpa isi pesan dan Panduan API; tidak ada UI chat/percakapan. Terapkan migrasi sampai `0008_gateway_events.sql`. Webhook mendukung MESSAGES_UPSERT, MESSAGES_UPDATE, SEND_MESSAGE dan CONNECTION_UPDATE dengan enabled serta pilihan event. Endpoint/payload tetap kontrak waflow; tidak diklaim kompatibel penuh Evolution API. Keputusan dan status gate ada di [.ai/gateway-revision.md](.ai/gateway-revision.md).

Binding rate limit login (`LOGIN_RATE_LIMIT`) ada di template Wrangler. Pilih `namespace_id` positif yang belum dipakai Worker lain pada akun Cloudflare pemasang. Batas default adalah 10 percobaan per IP per 60 detik.

`bun run check` dan `bun run build` memverifikasi kode tanpa deploy. Koneksi/QR, restart lokal, logout serta kirim/terima teks nyata pernah teruji sebelum revisi gateway ini. Empat event baru belum terverifikasi WhatsApp nyata/Cloudflare remote. Kontrak dan receiver ada di [.ai/features/webhooks/spec.md](.ai/features/webhooks/spec.md). Uji Bun: `bun apps/api/test/messaging-check.ts` dan `bun apps/api/test/webhooks-check.ts`. Uji Worker terisolasi setelah build API: `bun apps/api/test/gateway-worker-smoke.ts` dan `bun apps/api/test/webhooks-worker-smoke.ts`. Tes API lokal: `pwsh -NoProfile -File apps/api/test/messaging-smoke.ps1`. Check, build, seluruh tes tersebut, migrasi D1 lokal dan browser localhost:4173 lulus pada revisi gateway 2026-10-04. Media belum aktif.





