# HY Print Web

HY Print membantu menyiapkan cetakan dari browser Windows. Dokumen PDF dan DOCX diproses di perangkat pengguna; dokumen tidak diunggah untuk pemeriksaan. Antarmuka dirancang menggunakan FigCraft.

[Buka HY Print](https://hy-print.handigunawan59-aa6.workers.dev)

## Fitur

- Pratinjau semua halaman, halaman warna saja, atau hitam putih saja. Klik gambar halaman untuk melihatnya lebih besar; mode dan salinan dapat diubah per halaman.
- Pilih semua halaman, hanya warna, atau hanya hitam putih untuk dicetak. Hanya halaman yang dicentang dan sesuai filter yang disertakan dalam perhitungan dan cetakan.
- Admin mengatur tarif dan ambang warna, serta dapat mengganti kata sandi dari panel admin. Perubahan tarif atau ambang mungkin memerlukan waktu untuk tersebar ke lokasi lain.
- Halaman yang terdeteksi kosong otomatis dilewati dari perhitungan dan cetakan. Jumlah halaman kosong, berisi, dan yang akan dicetak ditampilkan; status halaman dapat diperiksa dan diperbaiki.
- Pilih urutan halaman belakang ke depan dan sesuaikan opsi kompensasi dengan pengaturan pembalikan pada printer.
- DOCX dikonversi menjadi PDF di browser. Tata letak, font, gambar, dan pemisahan halaman dapat berbeda dari Microsoft Word; jika isi tidak dapat ditampung, simpan sebagai PDF di Word.

## Cara menggunakan

Buka situs di browser modern pada Windows, lalu pilih PDF atau DOCX. Periksa halaman, pilih mode dan salinannya, kemudian pilih filter cetak. Di dialog cetak browser, pilih printer dan kertas, lalu pilih **semua halaman** dan **1 salinan** karena HY Print sudah menyiapkan jumlah salinan.

Untuk mengubah harga, ambang, atau kata sandi, pilih **Admin** dan masuk. Kata sandi baru minimal 12 karakter; setelah diganti, masuk kembali dengan kata sandi baru. Tarif dan ambang disimpan pada Cloudflare; dokumen pelanggan tetap di browser. Nilai awal tersedia jika belum ada pengaturan yang tersimpan.

Deteksi halaman kosong adalah perkiraan yang berhati-hati. Tanda sangat kecil mungkin tidak terdeteksi, sedangkan hasil scan berisik bisa dianggap berisi. Periksa dan perbaiki status halaman bila diperlukan. Browser tidak dapat membaca atau mengunci pengaturan urutan driver. Jika printer juga diatur membalik urutan, aktifkan opsi kompensasi yang sesuai dan periksa hasilnya. Deteksi warna adalah estimasi, bukan jaminan 100% atau pengukuran tinta. Halaman hitam putih dikirim sebagai gambar abu-abu, tetapi driver printer menentukan penggunaan tinta. Printer dan ukuran kertas dipilih melalui dialog browser. Hasil cetak fisik bergantung pada printer dan driver. File `.doc` lama harus disimpan sebagai `.docx` atau PDF terlebih dahulu.

## Pengembangan dan deployment

Memerlukan Node.js 22 atau lebih baru. Jalankan `npm ci`, `npm test`, dan `npm run build`. Antarmuka membutuhkan API Worker, sehingga `npm run dev` saja tidak menyediakan login atau pengaturan admin. Lihat [CLOUDFLARE.md](CLOUDFLARE.md) untuk konfigurasi dan pengujian lokal. Perubahan GitHub tidak otomatis menerbitkan situs.

## Lisensi

Proyek ini dirilis dengan GNU AGPL-3.0-or-later, lihat [LICENSE](LICENSE). Dependensi memiliki lisensinya masing-masing. Rilis desktop v0.1.0 merupakan versi lama dan tidak digunakan oleh situs ini.
