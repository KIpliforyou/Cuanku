# Cuanku Development Plan

Status: Fase 8–13 dan fitur dasar kartu kredit diimplementasikan; quality gates lulus; deployment dilakukan setelah push.

## 1. Tujuan

Cuanku adalah aplikasi web personal finance local-first untuk mencatat dan memantau keuangan dalam dua mata uang:

- JPY (Yen Jepang)
- IDR (Rupiah Indonesia)

Aplikasi tidak memakai login atau cloud database pada MVP. Data keuangan utama tersimpan lokal di browser pengguna.

## 2. Keputusan yang Sudah Disepakati

- Nama project: Cuanku
- Lokasi: `C:\Users\USER\Desktop\project HERMES AGENT\Cuanku`
- Repo: `https://github.com/KIpliforyou/Cuanku.git`
- Design: baru, arah Modern Finance Minimal
- Platform: mobile-first dan responsive desktop
- Theme: light default, dark dan system tersedia
- Penyimpanan: IndexedDB untuk data keuangan utama
- LocalStorage: hanya preferensi kecil seperti theme dan filter terakhir
- Login: ditunda
- Cloud sync: ditunda
- Mata uang: JPY dan IDR
- Saldo JPY dan IDR selalu ditampilkan terpisah
- Remitansi bukan transaksi
- Remitansi hanya berarti estimasi saldo lintas mata uang
- Kurs otomatis dipakai hanya untuk estimasi
- Saldo awal bukan pemasukan
- Data invalid tidak boleh menghapus data valid

## 3. Scope MVP

### Masuk MVP

- Membuat, mengedit, dan menghapus dompet
- Dompet dengan mata uang JPY atau IDR
- Saldo awal per dompet
- Mencatat pemasukan
- Mencatat pengeluaran
- Anggaran bulanan per dompet dan kategori pengeluaran
- Mengedit dan menghapus transaksi
- Dashboard saldo JPY dan IDR
- Estimasi total lintas mata uang
- Kurs otomatis dengan cache lokal dan fallback
- Riwayat transaksi
- Filter dasar transaksi
- Laporan sederhana per mata uang
- Export backup JSON
- Import backup JSON dengan validasi dan replace atomik
- Light/dark/system theme
- Responsive mobile dan desktop
- Empty, loading, error, offline, dan success state
- App shell offline melalui service worker sederhana
- Test invariant dan verifikasi build

### Ditunda

- Login
- Cloud sync
- Supabase atau database server
- Transfer antar-dompet
- Remitansi sebagai transaksi
- Budgeting kompleks (multi-periode dan perencanaan lanjutan)
- Investasi
- AI assistant
- Notifikasi
- Sinkronisasi multi-perangkat
- Kategori khusus per mata uang

## 4. Invariant Data dan Keuangan

1. Satu dompet hanya memiliki satu mata uang.
2. Mata uang dompet tidak dapat diubah setelah dompet dibuat.
3. Nominal transaksi disimpan sebagai integer positif dalam unit mata uang.
4. Tipe transaksi menentukan efek nominal: income menambah, expense mengurangi.
5. Saldo berjalan dihitung dengan rumus:

   ```text
   saldo = saldoAwal + totalPemasukan - totalPengeluaran
   ```

6. Saldo awal bukan pemasukan dan tidak masuk laporan pemasukan periode.
7. JPY dan IDR tidak pernah dijumlahkan langsung.
8. Estimasi IDR dihitung dengan:

   ```text
   estimasiIDR = totalIDR + (totalJPY × kursJPYIDR)
   ```

9. Estimasi JPY dihitung dengan:

   ```text
   estimasiJPY = totalJPY + (totalIDR ÷ kursJPYIDR)
   ```

10. Estimasi selalu diberi label `Estimasi` dan bukan saldo riil.
11. Kurs harus berupa angka positif dan memiliki timestamp serta sumber.
12. Jika fetch kurs gagal, cache kurs terakhir boleh digunakan.
13. Jika tidak ada cache kurs, estimasi gabungan tidak menampilkan angka.
14. Transaksi hanya dapat menunjuk ke dompet yang ada.
15. Import backup harus memvalidasi struktur, tipe, ID, relasi, mata uang, tanggal, dan nominal.
16. Import invalid tidak boleh mengubah data lama.
17. Dompet yang memiliki transaksi tidak boleh dihapus pada MVP untuk mencegah transaksi orphan.
18. Data keuangan utama tidak disimpan di LocalStorage.

## 5. Kurs Otomatis

Calon sumber yang akan diuji pada Fase 0:

- `https://open.er-api.com/v6/latest/JPY`
- `https://api.frankfurter.app/latest?from=JPY&to=IDR`

Pemilihan provider belum dikunci. Fase 0 harus memverifikasi:

- HTTP status
- Struktur JSON
- Nilai rate
- CORS jika dipanggil dari browser
- Timeout
- Reliabilitas dasar
- Kesesuaian rate JPY/IDR

Aturan runtime yang direncanakan:

- Fetch maksimal sekali per 15 menit, kecuali refresh manual.
- Simpan rate, source, fetchedAt, dan cachedAt.
- Validasi rate sebelum disimpan.
- Gunakan cache terakhir jika fetch gagal.
- Jangan memakai nilai kurs buatan atau default palsu.
- Jika provider langsung dari browser bermasalah, gunakan Route Handler Next.js sebagai proxy server-side tanpa menyimpan secret di client.

## 6. Model Data Awal

### Wallet

```ts
{
  id: string;
  name: string;
  currency: "JPY" | "IDR";
  openingBalance: number;
  createdAt: string;
  updatedAt: string;
}
```

### Transaction

```ts
{
  id: string;
  walletId: string;
  type: "income" | "expense";
  amount: number;
  categoryId: string;
  date: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Exchange Rate Cache

```ts
{
  id: "JPY_IDR";
  base: "JPY";
  quote: "IDR";
  rate: number;
  source: string;
  fetchedAt: string;
  cachedAt: string;
}
```

### Backup Envelope

```ts
{
  schemaVersion: number;
  exportedAt: string;
  app: "Cuanku";
  wallets: Wallet[];
  transactions: Transaction[];
  categories: Category[];
  preferences?: Preferences;
}
```

Model final dapat berubah setelah tracing implementasi dan verifikasi dependency, tetapi perubahan harus menjaga invariant di atas.

## 7. Kategori Default

### Pemasukan

- Gaji
- Freelance
- Bonus
- Refund
- Hadiah
- Lainnya

### Pengeluaran

- Makan & Minum
- Transportasi
- Belanja Harian
- Sewa & Tempat Tinggal
- Tagihan
- Komunikasi
- Kesehatan
- Keluarga
- Pendidikan
- Asuransi & Pajak
- Hiburan
- Lainnya

## 8. Arsitektur Teknis Rencana

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Zod untuk validasi runtime
- IndexedDB melalui library `idb` atau wrapper kecil yang sesuai kebutuhan
- Vitest untuk unit test
- ESLint dan konfigurasi yang kompatibel dengan versi Next.js
- Service worker sederhana untuk app shell offline
- Tidak ada monorepo pada MVP
- Tidak ada abstraksi adapter tunggal tanpa kebutuhan nyata

Layer yang direncanakan:

- `domain`: tipe, invariant, kalkulasi saldo, dan kalkulasi estimasi
- `validation`: schema Zod untuk input dan backup
- `storage`: repository IndexedDB
- `exchange-rate`: fetch, validasi, cache, dan fallback
- `app`: route/page dan state UI
- `components`: komponen visual dan form

## 9. Rencana Halaman

- `/` — dashboard
- `/transaksi` — daftar, filter, edit, hapus, dan tambah transaksi
- `/dompet` — daftar dan pengelolaan dompet
- `/laporan` — laporan JPY/IDR terpisah
- `/backup` — export/import dan hapus data
- `/pengaturan` — theme, preferensi estimasi, dan status kurs

## 10. Aturan UX dan Accessibility

- JPY dan IDR memakai label teks, bukan warna saja.
- Income dan expense memakai tanda `+`/`-` serta label atau ikon.
- Semua input memiliki label.
- Semua error form dekat dengan field terkait.
- Focus keyboard terlihat jelas.
- Modal/drawer memiliki focus trap dan dapat ditutup dengan Escape.
- Tap target minimal 44px.
- Chart memiliki fallback tabel.
- Reduced motion dihormati.
- Target kontras WCAG AA harus diverifikasi saat implementasi, bukan diasumsikan.
- Layout diuji pada mobile kecil, desktop, dan zoom 200%.

## 11. Fase Pengerjaan

### Fase 0 — Planning dan Verifikasi

- Inspeksi repo dan environment
- Verifikasi versi Node/npm
- Verifikasi dependency stabil
- Uji sumber kurs
- Finalisasi model data dan keputusan terbuka
- Review dan persetujuan PLAN.md

### Fase 1 — Fondasi

- Scaffold Next.js
- TypeScript, lint, test, build
- Schema Zod
- Domain calculations
- Repository IndexedDB
- Unit test invariant

### Fase 2 — Fitur Inti

- Wallet CRUD
- Transaction CRUD
- Dashboard
- Riwayat dan filter
- Empty/loading/error states

### Fase 3 — Kurs, Laporan, dan Backup

- Exchange-rate fetch/cache/fallback
- Estimasi total
- Laporan per mata uang
- Export/import JSON atomik
- Hapus data dengan konfirmasi

### Fase 4 — UI dan Offline

- Responsive layout
- Light/dark/system theme
- Service worker app shell
- Accessibility hardening
- Browser smoke test

### Fase 5 — Final Verification

- Typecheck
- Unit test
- Lint
- Build
- Manual smoke test
- Review security/data-loss risks
- Commit
- Push ke `origin/main`
- Deploy Vercel hanya setelah repo dan deployment target siap

### Roadmap Lanjutan — CUANKU_ROADMAP.md

Roadmap lanjutan disetujui untuk dikerjakan bertahap. Urutan yang dipilih: Fase 12, 8, 9, 10, 11, 13, 14, 15, 16, 17, lalu 18. Pertahankan invariant keuangan dan jangan mengaktifkan cloud sync tanpa persetujuan eksplisit.

#### Fase 6 — UX Mobile dan Dashboard (dirilis)

- Ringkas navigasi mobile menjadi Ringkasan, Transaksi, Anggaran, dan Laporan; pindahkan Dompet, Backup, dan Pengaturan ke menu “Lainnya”.
- Jadikan aksi tambah transaksi mudah dijangkau di layar kecil, dengan form singkat dan target maksimal tiga ketukan untuk pencatatan normal.
- Tambahkan ringkasan pemasukan/pengeluaran bulan ini dan sisa anggaran ke dashboard tanpa mencampur JPY dan IDR.
- Ganti indikator tunggu dengan skeleton singkat; pertahankan state error pemuatan lokal yang dapat dipulihkan.
- Pertahankan empty state, kontras, dark/system theme, reduced motion, dan akses keyboard.

#### Fase 7 — Laporan, Kategori, dan Ekspor (dirilis)

- Tambahkan pencarian dan filter transaksi berdasarkan rentang tanggal, kategori, dompet, dan catatan.
- Tambahkan tren bulanan, perbandingan bulan sebelumnya, serta distribusi kategori; setiap grafik wajib memiliki tabel aksesibel.
- Tambahkan ikon kategori dan kategori kustom dengan validasi tipe pemasukan/pengeluaran.
- Tambahkan export CSV sebagai pelengkap backup JSON; format Excel dapat dipertimbangkan setelah kebutuhan format disepakati.

Fase 6–7 dirilis bersama pada commit `2cbc064`.

#### Fase 12 — Keamanan Data: Backup dan Migrasi

- Tambahkan versi skema IndexedDB dan migrasi berurutan; versi database tidak dicampur dengan versi file backup.
- Migrasikan backup v1 ke format terkini tanpa kehilangan transaksi; backup rusak atau versi tak didukung tidak boleh mengganti data.
- Simpan waktu backup terakhir dan interval pengingat (default 14 hari); tampilkan banner Ringkasan dan tombol backup langsung.
- Tampilkan status penyimpanan persisten browser; permintaan persist hanya dilakukan setelah tindakan pengguna.
- Ekspor/impor manual tetap menjadi jalur pemulihan utama. Backup otomatis berbasis File System Access API ditunda sampai izin dan dukungan browser dirancang.
- Status: implementasi dan validasi selesai; typecheck, lint, build, 23 tes, audit dependency (0 kerentanan), dan smoke test UI mobile lolos.

#### Fase 8 — Kurs JPY ↔ IDR (diimplementasikan)
- Simpan riwayat kurs manual dan API serta gunakan kurs tersimpan untuk estimasi.
- Gunakan nilai berskala integer dan pembulatan eksplisit untuk konversi.
- Estimasi menampilkan mata uang tujuan, kurs, sumber, dan tanggal.

#### Fase 9 — Transfer Antar-Dompet (diimplementasikan)
- Transfer biasa dibatasi ke dompet bermata uang sama.
- Konversi lintas mata uang memakai alur berbeda, kurs eksplisit, dan snapshot kurs.
- Biaya admin dicatat atomik sebagai pengeluaran pada dompet asal dan kategori “Biaya transfer”.
- Transfer dan konversi tidak dimasukkan sebagai pemasukan/pengeluaran laporan.

#### Fase 10 — Transaksi Berulang (diimplementasikan)
- Aturan mingguan, bulanan, dan tahunan menghasilkan draf saat jadwal jatuh tempo.
- Setiap draf harus disetujui satu per satu sebelum menjadi transaksi dan memengaruhi saldo.
- Persetujuan transaksi dan penghapusan draf dilakukan secara atomik; draf dapat dilewati.

#### Fase 11 — Peringatan Anggaran (diimplementasikan)
- Ambang 80% dan 100% dapat diatur per anggaran.
- Tampilkan tingkat penggunaan pada anggaran dan dashboard.
- Notifikasi hanya muncul saat transaksi melewati ambang; klaim notifikasi disimpan lokal per periode agar tidak berulang.

#### Fase 13 — PWA (diimplementasikan)
- Tambahkan manifest, ikon aplikasi, petunjuk pemasangan, status koneksi, dan fallback offline.
- Cache app shell dan aset statis; pengecekan pembaruan tidak memaksa reload.
- Pembaruan baru diterapkan atas tindakan pengguna, dan aksi ditahan selama form masih terbuka.

Fase 14–18 tetap berada di luar lingkup pekerjaan ini. Setiap perubahan pada entitas keuangan harus mempertahankan migrasi backup, operasi IndexedDB atomik, dan tes invariant.

#### Fitur Dasar Kartu Kredit (diimplementasikan)
- Tambah jenis dompet kartu kredit terpisah dari dompet/rekening kas.
- Kartu kredit menyimpan limit, tanggal tutup tagihan, tanggal jatuh tempo, dan utang awal.
- Pengeluaran pada kartu kredit menambah utang; refund atau koreksi dapat mengurangi utang.
- Transfer dari rekening kas ke kartu kredit dianggap pembayaran dan mengurangi utang.
- Utang kartu kredit tidak dicampur dengan saldo kas JPY/IDR.
- Pembelian kartu kredit tetap tampil sebagai pengeluaran pada laporan periode, sesuai tanggal transaksi.

## 12. Quality Gates

Tidak boleh mengklaim selesai tanpa output nyata dari:

```text
npm run typecheck
npm test
npm run lint
npm run build
```

Urutan eksekusi dapat disesuaikan dengan scripts final, tetapi setiap gate wajib memiliki hasil nyata.

## 13. Keputusan Terbuka untuk Persetujuan

1. Apakah service worker app shell masuk MVP atau ditunda?
2. Apakah saldo negatif diperbolehkan dan hanya diberi peringatan?
3. Apakah dompet dengan transaksi memang tidak dapat dihapus?
4. Apakah kategori default di atas sudah cukup?
5. Apakah pembulatan estimasi ke unit penuh JPY/IDR sudah sesuai?
6. Apakah transfer antar-dompet tetap ditunda?
7. Apakah icon library dipakai atau icon SVG lokal?
8. Provider kurs mana yang dipilih setelah Fase 0 selesai?
9. Apakah target deployment Vercel memakai project baru atau Git integration?

## 14. Risiko

- Data lokal dapat hilang jika browser/storage dibersihkan.
- API kurs dapat gagal, berubah, atau membatasi akses.
- Service worker dapat menyajikan app shell lama sampai cache diperbarui.
- Import/restore adalah operasi sensitif dan harus atomik.
- Perubahan transaksi tanggal lama mengubah saldo saat ini.
- Tanpa transfer antar-dompet, pemindahan dana internal harus dicatat manual sebagai expense/income terpisah dan dapat memengaruhi laporan.
- Browser private mode atau storage terbatas dapat membuat IndexedDB tidak tersedia.

## 15. Status Persetujuan

- [ ] PLAN.md disetujui pengguna
- [ ] Keputusan terbuka dikunci
- [ ] Fase 1 boleh dimulai
