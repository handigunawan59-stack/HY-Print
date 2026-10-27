# HY Print Web

HY Print adalah aplikasi browser untuk menyiapkan cetakan dari komputer Windows. Dokumen diproses di perangkat pengguna; situs tidak mengunggahnya untuk pemeriksaan. Desain antarmuka dibuat di FigCraft dengan gaya yang terinspirasi iOS.

## Kemampuan

- Memeriksa PDF dan mengubah dokumen Word `.docx` menjadi PDF di browser. Konversi Word bersifat perkiraan: font, tata letak, gambar, dan pemisahan halaman dapat berbeda dari Microsoft Word. Untuk hasil yang membutuhkan kesetiaan tinggi, simpan sebagai PDF melalui Word lalu buka PDF tersebut.
- Melihat pratinjau, ukuran halaman dan perkiraan cakupan warna. Ambang warna dapat diatur; mode setiap halaman dapat dikoreksi.
- Memilih halaman dan jumlah salinan per halaman, menetapkan tarif hitam putih dan warna, serta melihat estimasi biaya.
- Membuka dialog cetak browser untuk memilih printer dan kertas. Aplikasi menyiapkan salinan yang dipilih; gunakan **1 salinan** dan **semua halaman** di dialog cetak agar jumlah tidak berlipat.

## Menggunakan

Buka alamat situs melalui browser modern di Windows. Pilih atau seret dokumen PDF/DOCX, periksa pratinjau dan ukuran, lalu atur halaman, mode, salinan, dan tarif. Klik tombol cetak dan pilih printer, ukuran kertas, dan pengaturan driver pada dialog browser. Dokumen `.doc` lama perlu disimpan sebagai `.docx` atau PDF terlebih dahulu.

Deteksi warna adalah estimasi, bukan jaminan 100% atau pengukuran tinta. Mode hitam putih membuat gambar halaman abu-abu, tetapi driver dan perangkat menentukan cara tinta dipakai. Dialog browser menentukan printer dan kertas; website tidak dapat mendeteksi printer atau memastikan kertas yang terpasang. Hasil cetak fisik belum diuji untuk semua printer dan driver. Periksa pratinjau cetak sebelum mencetak.

## Menjalankan dari sumber

Memerlukan Node.js 22 atau lebih baru.

```sh
npm ci
npm run dev
npm test
npm run build
```

Build statis tersedia di `dist/`. Lihat [CLOUDFLARE.md](CLOUDFLARE.md) untuk menerbitkan ke Cloudflare Workers. Perubahan GitHub tidak otomatis menerbitkan situs; jalankan deployment setelah build.

## Lisensi

Proyek ini dirilis dengan GNU AGPL-3.0-or-later, lihat [LICENSE](LICENSE). Dependensi memiliki lisensinya masing-masing. Rilis desktop v0.1.0 merupakan versi lama dan tidak digunakan oleh situs ini.
