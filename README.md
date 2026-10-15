# waflow

Gateway WhatsApp open source untuk satu instalasi Cloudflare dengan satu panel operator. Paket dikelola dengan Bun. Aturan proyek ada di [`.ai/spec.md`](.ai/spec.md).

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

API key integrasi dibuat dan dicabut di Pengaturan; D1 tetap dipakai untuk key dan metadata sesi. Salin `wrangler.example.jsonc` ke `wrangler.jsonc` dan isi UUID D1 milik akun Cloudflare pemasang sebelum deploy. Konfigurasi lokal diabaikan Git. Worker dashboard memerlukan `API_URL` yang mengarah ke Worker API instalasi tersebut.

waflow mengikuti fitur inti gateway Evolution API: sesi/QR/koneksi, kirim teks API, API key, webhook per sesi dan log operasional. Dashboard menyediakan Kirim teks, Log aktivitas tanpa isi pesan dan Panduan API; tidak ada UI chat/percakapan. Terapkan migrasi sampai `0008_gateway_events.sql`. Webhook mendukung MESSAGES_UPSERT, MESSAGES_UPDATE, SEND_MESSAGE dan CONNECTION_UPDATE dengan enabled serta pilihan event. Endpoint/payload tetap kontrak waflow; tidak diklaim kompatibel penuh Evolution API. Keputusan dan status gate ada di [.ai/gateway-revision.md](.ai/gateway-revision.md).

Binding rate limit login (`LOGIN_RATE_LIMIT`) ada di template Wrangler. Pilih `namespace_id` positif yang belum dipakai Worker lain pada akun Cloudflare pemasang. Batas default adalah 10 percobaan per IP per 60 detik.

`bun run check` dan `bun run build` memverifikasi kode tanpa deploy. Koneksi/QR, restart lokal, logout serta kirim/terima teks nyata pernah teruji sebelum revisi gateway ini. Empat event baru belum terverifikasi WhatsApp nyata/Cloudflare remote. Kontrak dan receiver ada di [.ai/features/webhooks/spec.md](.ai/features/webhooks/spec.md). Uji Bun: `bun apps/api/test/messaging-check.ts` dan `bun apps/api/test/webhooks-check.ts`. Uji Worker terisolasi setelah build API: `bun apps/api/test/gateway-worker-smoke.ts` dan `bun apps/api/test/webhooks-worker-smoke.ts`. Tes API lokal: `pwsh -NoProfile -File apps/api/test/messaging-smoke.ps1`. Check, build, seluruh tes tersebut, migrasi D1 lokal dan browser localhost:4173 lulus pada revisi gateway 2026-10-04. Media belum aktif.





