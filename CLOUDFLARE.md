# Cloudflare Workers

HY Print menggunakan Worker untuk API admin dan aset statis, Workers KV untuk pengaturan, serta pembatas percobaan login. Dokumen pelanggan tetap diproses di browser.

## Deployment

Prasyarat: Node.js dan akses ke akun Cloudflare yang memiliki Worker, namespace KV, dan izin deployment. Nilai rahasia **tidak** boleh dimasukkan ke Git, source, aset publik, atau file contoh. `wrangler.jsonc` berisi ID namespace dan binding, bukan nilainya.

Gunakan secret `ADMIN_PASSWORD` untuk kata sandi dan `SESSION_SECRET` untuk kunci sesi acak yang berbeda (minimal 32 karakter). Atur secret dengan `npx wrangler secret put ADMIN_PASSWORD` dan `npx wrangler secret put SESSION_SECRET`; masukkan nilainya secara privat saat diminta. Kemudian:

```powershell
npm ci
npm test
npm run build
npx wrangler deploy
```

`wrangler secret put` memperbarui secret pada Worker yang dipilih. Untuk mengganti kata sandi, perbarui secret `ADMIN_PASSWORD`; jangan mengunggahnya ke GitHub. Secret sesi independen mencegah kata sandi digunakan sebagai kunci token. Pembatas login bekerja per lokasi Cloudflare dan tidak menggantikan kata sandi yang kuat. Pengaturan KV bersifat eventually consistent, sehingga perubahan bisa terlambat terlihat di lokasi lain.

Untuk pengembangan lokal, jalankan Worker dengan `npx wrangler dev --local` setelah build, dan atur secret pengujian di `.dev.vars` yang diabaikan Git. Gunakan nilai khusus pengujian, bukan kata sandi produksi. Vite saja tidak menyediakan API admin.

Jangan menaruh dokumen pelanggan, kunci API, file `.env`, atau hasil print pada `dist/`, karena aset yang diterbitkan bersifat publik.
