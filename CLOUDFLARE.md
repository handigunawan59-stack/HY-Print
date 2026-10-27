# Cloudflare Workers

HY Print menggunakan Worker untuk API admin dan aset statis, Workers KV untuk pengaturan, D1 untuk hash kata sandi admin, serta pembatas percobaan login. Dokumen pelanggan tetap diproses di browser.

## Deployment

Prasyarat: Node.js dan akses ke akun Cloudflare yang memiliki Worker, namespace KV, dan izin deployment. Nilai rahasia **tidak** boleh dimasukkan ke Git, source, aset publik, atau file contoh. `wrangler.jsonc` berisi ID namespace dan binding, bukan nilainya.

Gunakan secret `ADMIN_PASSWORD` sebagai kata sandi awal, `SESSION_SECRET` untuk kunci sesi, dan `PASSWORD_PEPPER` sebagai pepper hash. Dua secret terakhir harus acak, berbeda, dan minimal 32 karakter. Atur masing-masing melalui `npx wrangler secret put NAMA_SECRET` dan masukkan nilai secara privat. Siapkan D1 dan jalankan migrasi sebelum deployment:

```powershell
npm ci
npm test
npm run build
npx wrangler d1 migrations apply hy-print-admin --remote
npx wrangler deploy
```

Setelah admin mengganti kata sandi melalui situs, hash pada D1 menggantikan kata sandi awal; memperbarui `ADMIN_PASSWORD` saja tidak lagi mengubah kata sandi. Jangan rotasi atau hapus `PASSWORD_PEPPER`: hash yang tersimpan tidak dapat diverifikasi tanpa nilai tersebut. Pemulihan kata sandi memerlukan tindakan D1 yang dikendalikan pemilik akun. Secret sesi independen mencegah kata sandi digunakan sebagai kunci token. Pembatas login bekerja per lokasi Cloudflare dan tidak menggantikan kata sandi yang kuat. Pengaturan KV bersifat eventually consistent, sehingga perubahan bisa terlambat terlihat di lokasi lain.

Untuk pengembangan lokal, jalankan `npx wrangler d1 migrations apply hy-print-admin --local`, lalu `npx wrangler dev --local` setelah build, dan atur secret pengujian di `.dev.vars` yang diabaikan Git. Gunakan nilai khusus pengujian, bukan kata sandi produksi. Vite saja tidak menyediakan API admin.

Jangan menaruh dokumen pelanggan, kunci API, file `.env`, atau hasil print pada `dist/`, karena aset yang diterbitkan bersifat publik.
