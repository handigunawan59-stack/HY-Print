# HY Print

Aplikasi Windows untuk memeriksa dokumen dan memperkirakan biaya sebelum mencetak. Antarmuka dirancang dengan FigCraft dan memakai gaya visual yang terinspirasi iOS.

## Fitur

- Membuka PDF serta file Word (`.doc`, `.docx`). File Word diubah menjadi PDF sementara menggunakan Microsoft Word desktop yang terpasang; pemeriksaan dan pencetakan menggunakan PDF tersebut.
- Menampilkan pratinjau, ukuran dan perkiraan warna setiap halaman.
- Memilih halaman, mengatur mode hitam putih atau warna dan jumlah salinan pada setiap halaman.
- Mendeteksi printer Windows dan menampilkan pilihan kertas yang dilaporkan driver.
- Menghitung estimasi biaya berdasarkan tarif per halaman hitam putih dan warna yang dapat diubah dan disimpan di komputer.
- Mengirim pekerjaan ke antrean printer Windows dengan pengaturan warna, kertas dan orientasi per halaman.

## Penggunaan

1. Unduh installer Windows dari halaman **Releases**, pasang dan jalankan HY Print.
2. Pilih dokumen PDF atau Word. Untuk Word, Microsoft Word desktop harus terpasang dan dapat dijalankan pada komputer tersebut.
3. Periksa ukuran dokumen dan perkiraan warna. Tentukan halaman, mode warna dan jumlah salinan. Periksa kembali hasil deteksi sebelum mencetak.
4. Pilih printer, ukuran kertas yang sesuai, dan masukkan tarif per halaman. Periksa estimasi lalu klik **Cetak sekarang**.

## Batasan penting

- Deteksi warna berbasis tampilan raster adalah perkiraan, bukan jaminan akurasi 100%. Area warna yang sangat kecil dapat diabaikan menurut ambang deteksi. Periksa dokumen dan ubah mode secara manual jika diperlukan.
- Pilihan kertas dan status berasal dari driver Windows; aplikasi tidak dapat memastikan kertas fisik yang ada di baki. Driver tertentu mungkin tidak menerapkan semua pengaturan. Periksa printer dan kertas sebelum mencetak.
- Halaman disesuaikan ke area cetak printer; hasilnya tidak dijamin mempertahankan ukuran fisik 100%. Hitam putih dikirim sebagai gambar abu-abu, tetapi printer dapat menggunakan tinta warna untuk menghasilkan abu-abu.
- Berhasil dikirim berarti pekerjaan masuk ke antrean Windows, bukan jaminan bahwa halaman telah selesai keluar dari printer. Pesanan terpisah dikirim untuk setiap halaman/salinan.
- PDF yang dilindungi kata sandi tidak didukung. Dokumen dengan tautan eksternal, font atau fitur Word tertentu dapat menghasilkan keluaran yang berbeda menurut instalasi Word.
- Aplikasi berjalan secara lokal; dokumen tidak perlu diunggah ke layanan web oleh HY Print.

## Pengembangan

Lihat [BUILD.md](BUILD.md) untuk membangun aplikasi dan installer. Untuk menjalankan dari sumber di Windows, pasang `requirements.txt`, lalu jalankan `python app.py`. Tes dapat dijalankan dengan `python -m pytest -q` setelah memasang pytest.

## Lisensi

Kode proyek ini dirilis di bawah GNU AGPL-3.0-or-later, lihat [LICENSE](LICENSE). Aplikasi menggunakan PyMuPDF yang memiliki lisensi AGPL atau lisensi komersial, serta komponen pihak ketiga lain dengan lisensi masing-masing. Periksa persyaratan lisensi sebelum mendistribusikan versi turunan atau menggunakannya di luar ketentuan AGPL.
