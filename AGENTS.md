# Aturan proyek waflow

- Semua page panel wajib memakai breadcrumb sesuai hierarki route SvelteKit. Route detail menampilkan nama entitas sebagai crumb terakhir.
- Dilarang menulis atau menambah teks deskripsi yang sudah jelas atau tidak diperlukan pengguna. Teks UI hanya boleh ada jika tanpa teks itu pengguna sulit memahami status, tindakan, akibat, atau error. Jangan menambah deskripsi atas inisiatif sendiri.
- Tombol sekunder seperti Batal memakai warna abu-abu (`tone="neutral"` pada komponen Matte). Gunakan warna semantik lain hanya untuk aksi utama atau tindakan yang memang perlu penekanan khusus.
- Tombol yang menjalankan aksi asinkron (simpan, buat, hapus/cabut, login, logout, pairing) wajib menampilkan loader dan mencegah pengiriman ganda selama permintaan berlangsung. Gunakan properti `loading` dari komponen Matte bila tersedia.
- Jika menjalankan PHP, selalu gunakan `herd php`; jangan menjalankan `php` langsung.

Spesifikasi lengkap berada di `.ai/spec.md`.
