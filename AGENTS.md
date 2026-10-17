# Aturan proyek waflow

Pada awal **setiap request**, wajib baca [aturan navigasi nqmcreative-ui](D:/Web/SELF/CLOUDFLARE/nqmcreative-ui/docs/navigation-rules.md) sebelum analisis, perencanaan, atau perubahan. Aturan ini memiliki prioritas tertinggi di antara pedoman desain proyek: **DILARANG KERAS membuat menu navigasi di atas konten pada viewport apa pun.** Navigasi wajib sidebar vertikal; pada ruang terbatas gunakan collapse/drawer samping.

- Semua page panel wajib memakai breadcrumb sesuai hierarki route SvelteKit. Route detail menampilkan nama entitas sebagai crumb terakhir.
- Dilarang menulis atau menambah teks deskripsi yang sudah jelas atau tidak diperlukan pengguna. Teks UI hanya boleh ada jika tanpa teks itu pengguna sulit memahami status, tindakan, akibat, atau error. Jangan menambah deskripsi atas inisiatif sendiri.
- Tombol sekunder seperti Batal memakai warna abu-abu (`tone="neutral"` pada komponen Matte). Gunakan warna semantik lain hanya untuk aksi utama atau tindakan yang memang perlu penekanan khusus.
- Tombol yang menjalankan aksi asinkron (simpan, buat, hapus/cabut, login, logout, pairing) wajib menampilkan loader dan mencegah pengiriman ganda selama permintaan berlangsung. Gunakan properti `loading` dari komponen Matte bila tersedia.
- Jika menjalankan PHP, selalu gunakan `herd php`; jangan menjalankan `php` langsung.

Spesifikasi lengkap berada di `.ai/spec.md`.
