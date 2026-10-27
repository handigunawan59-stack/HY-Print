# Membuat installer HY Print

Build dilakukan di Windows 64-bit dengan Python 3.12 64-bit, akses internet untuk memasang dependensi, dan [NSIS](https://nsis.sourceforge.io/Download). Dari PowerShell di folder proyek:

```powershell
py -3.12 --version
.\build.ps1 -Python 'python' -Version 0.1.0
```

Jika `python` bukan Python 3.12, berikan path lengkap ke `python.exe` Python 3.12 melalui parameter `-Python`. Skrip membuat virtual environment `.build-venv`, memasang `requirements.txt` dan PyInstaller, lalu menghasilkan `dist\installer\HY-Print-Setup-0.1.0.exe`. Berikan `-CompilerPath` jika `makensis.exe` dipasang di lokasi lain. Jalankan `./build.ps1 -SkipInstaller` jika hanya ingin membuat folder aplikasi tanpa NSIS. Dependensi Python dibundel; pengguna tidak perlu memasang Python untuk menjalankan hasilnya.

Workflow GitHub Actions membangun installer pada push ke `main`, pull request, atau pemicu manual dan menyimpannya sebagai artifact. Tag versi numerik seperti `v0.1.0` juga membuat GitHub Release dengan file installer. File ini tidak ditandatangani secara digital; Windows mungkin menampilkan peringatan SmartScreen. Gunakan printer yang benar-benar terpasang untuk memverifikasi pencetakan sebelum distribusi.
