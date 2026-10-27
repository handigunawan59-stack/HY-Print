# Cloudflare Workers

HY Print dapat di-host sebagai situs statis di Cloudflare Workers. Pemrosesan dokumen terjadi di browser; deployment ini tidak memerlukan database atau secret aplikasi.

## Deployment manual

Prasyarat: Node.js dan akun Cloudflare dengan izin Workers. Dari direktori proyek:

```powershell
npm ci
npm run build
npx wrangler login
npx wrangler deploy
```

Jika Wrangler sudah login pada akun yang benar, langkah login dapat dilewati. `wrangler.jsonc` mengunggah direktori `dist/` sebagai aset statis. Wrangler akan menampilkan URL deployment setelah berhasil. Bila akun memiliki lebih dari satu akun Cloudflare, pilih akun yang sesuai saat diminta.

Setiap `wrangler deploy` memperbarui situs produksi pada Worker `hy-print`. Jangan menaruh dokumen pelanggan, kunci API, file `.env`, atau hasil print pada direktori `dist/`; isinya menjadi publik. Untuk pengaturan domain sendiri dan CI/CD, lihat [dokumentasi Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).
