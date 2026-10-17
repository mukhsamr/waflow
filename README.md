# waflow

Kelola sesi WhatsApp, kirim pesan, dan hubungkan aplikasi Anda.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fmukhsamr%2Fwaflow)

## Mulai

1. Deploy ke akun Cloudflare Anda.
2. Atur `ADMIN_EMAIL`, `ADMIN_NAME`, dan secret `ADMIN_PASSWORD`.
3. Masuk, buat sesi, lalu scan QR melalui WhatsApp.

Untuk deployment dari GitHub, gunakan build `bun run build` dan deploy `bun run deploy`.

## Fitur

- Kelola sesi dan koneksi WhatsApp.
- Kirim teks dan lihat riwayat pengiriman.
- Buat, edit, rotate, dan hapus API key.
- Terima event melalui webhook.
- Susun contoh request melalui Panduan API.
