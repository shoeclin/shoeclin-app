# Shoeclin App — aplikasi HP untuk kurir & admin

Satu aplikasi untuk semua. Saat pertama dibuka, pilih **Kurir** atau **Admin** (admin butuh kunci).
Admin bisa pindah ke mode kurir lewat tombol di bagian atas. Halaman kurir dan admin tetap memakai
Apps Script yang sudah ada; aplikasi ini membukanya di dalam "cangkang" yang bisa dipasang di HP
dan bisa menerima notifikasi lewat Firebase.

## Isi folder ini (semuanya diunggah ke GitHub)

| File | Gunanya | Perlu diubah? |
|---|---|---|
| `config.js` | Alamat Apps Script + data Firebase | **Ya** — paling mudah diisi langsung di GitHub |
| `index.html`, `app.js` | Tampilan dan logika aplikasi | Tidak |
| `sw.js` | Pekerja latar: notifikasi dan tampilan saat offline | Tidak |
| `manifest.webmanifest`, `icon.svg` | Nama dan ikon aplikasi | Tidak |
| `buat-ikon.html` | Pembuat 4 ikon PNG | Tidak |
| `README.md` | Panduan ini | Tidak |

Folder `2-untuk-apps-script` **tidak** ikut diunggah ke GitHub.

---

## Urutan pengerjaan

### 1. Firebase (±10 menit)
1. Buka https://console.firebase.google.com → **Create a project** → nama `shoeclin` → Analytics boleh dimatikan.
2. Klik ikon **Web `</>`** → nama `Shoeclin App` → jangan centang Hosting → **Register app**.
   Catat 6 nilai di `firebaseConfig`: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId.
3. Gerigi ⚙ → **Project settings** → tab **Cloud Messaging**.
   Pastikan *Firebase Cloud Messaging API (V1)* = **Enabled**.
   Di **Web Push certificates** klik **Generate key pair**, catat isinya (ini `vapidKey`).
4. Tab **Service accounts** → **Generate new private key** → file JSON terunduh.
   **File ini rahasia, jangan pernah diunggah ke GitHub.**

### 2. Apps Script (±10 menit)
Ikuti `2-untuk-apps-script/PETUNJUK-APPS-SCRIPT.txt`.
Hasil akhirnya: **URL Web App** yang berakhiran `/exec`.

### 3. Buat ikon (±2 menit)
Klik dua kali `buat-ikon.html` (terbuka di Chrome) → **Unduh semua**.
Pindahkan 4 file PNG (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`)
dari folder Downloads ke folder ini.

### 4. Unggah ke GitHub (±10 menit)
1. Daftar di https://github.com. Alamat aplikasimu nanti: `https://USERNAME.github.io/shoeclin-app/`
2. Klik **+ → New repository** → nama `shoeclin-app` → **Public** → centang **Add a README file** → **Create repository**.
3. Klik **Add file → Upload files** → seret **semua file di folder ini** (termasuk 4 PNG) ke halaman → **Commit changes**.
4. Klik file `config.js` di repository → ikon pensil ✏️ → isi:
   - `appsScriptUrl` = URL Web App dari langkah 2
   - 6 nilai `firebase` dari langkah 1.2
   - `vapidKey` dari langkah 1.3

   lalu **Commit changes**. Pastikan tanda kutip `'...'` tetap ada di sekitar setiap nilai.
5. Tab **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → **Save**.
   Tunggu 1–3 menit sampai muncul *Your site is live at ...* (bisa dipantau di tab **Actions**).

### 5. Coba di laptop
Buka `https://USERNAME.github.io/shoeclin-app/` di Chrome → isi nama → pilih **Admin** → masukkan kunci admin → **Mulai**.
Dashboard admin muncul di dalam aplikasi. Klik lonceng → **Izinkan** → menu ⋯ → **Kirim notifikasi tes**.

### 6. Pasang di HP admin
- **Android:** buka link di **Chrome** → **Pasang aplikasi di HP** (atau menu ⋮ → *Instal aplikasi*) →
  buka dari ikon → isi pengaturan → ketuk **Aktifkan** → **Izinkan**.
- **iPhone (iOS 16.4+):** buka link di **Safari** → **Bagikan → Tambahkan ke Layar Utama** →
  buka dari ikonnya (bukan dari Safari) → isi pengaturan → **Aktifkan** → **Izinkan**.

Uji sungguhan: di laptop buka menu ⋯ → *Ganti nama atau peran* → pilih Kurir dengan nama `Tes` → buat 1 order.
HP admin harus berbunyi "Order baru". Setelah itu batalkan order tes itu dan kembalikan laptop ke Admin.

### 7. Bagikan ke kurir
Kirim link lewat WhatsApp: *"Buka di Chrome (iPhone: Safari), pasang ke layar utama, pilih Kurir, aktifkan notifikasi."*
Minta kurir mengisi **nama yang sama** dengan yang biasa dipakai di kolom Petugas, karena pengingat pagi
dan komisi dicocokkan dari nama itu. Daftar HP yang terdaftar bisa dilihat di sheet `Perangkat_Notif`.

---

## Notifikasi yang dikirim
- **Admin:** order baru, order dibatalkan, order diperbaiki, order pindah tipe, order selesai diantar,
  pembayaran customer masuk, dan ringkasan pagi. Order mitra yang disimpan beruntun digabung jadi satu notifikasi.
- **Kurir:** pengingat jam 7 pagi untuk order miliknya yang telat, jatuh tempo hari ini, atau besok.

Pengaturan (mana yang dikirim, jam pengingat) ada di bagian atas `Notifikasi.gs`.

## Memperbarui nanti
- **Kode Apps Script diubah:** Deploy → Manage deployments → Edit → **New version** (URL tetap sama).
- **File di GitHub diubah:** edit (✏️) → Commit → naikkan `versi` di `config.js` → tutup lalu buka lagi aplikasinya.
- **`ADMIN_MODE` diganti:** deploy versi baru; HP admin otomatis diminta kunci baru.

## Kalau ada masalah
- *"Server menjawab, tapi belum mengenal aplikasi ini"* → `Notifikasi.gs` belum ikut ter-deploy. Deploy **New version**.
- *"Tidak bisa menghubungi server"* → cek `appsScriptUrl` (harus `/exec`) dan akses Web App = **Anyone**.
- Halaman di dalam aplikasi kosong atau minta login → akses Web App harus **Anyone**. Kalau Chrome di HP login
  banyak akun Google, coba keluarkan akun yang tidak dipakai.
- Admin malah melihat portal kurir → kunci salah. Menu ⋯ → *Ganti nama atau peran*.
- Notifikasi tidak datang → di editor Apps Script jalankan `tesNotifikasi()` dan baca log-nya.
  `FCM 403` = Cloud Messaging API (V1) belum aktif. `Login ke Firebase gagal` = isi Script Properties keliru.
  Di HP, matikan penghemat baterai untuk Chrome/Shoeclin.
- iPhone tidak bisa notifikasi → harus dibuka dari ikon Layar Utama, iOS 16.4 ke atas.
- Tombol "Pasang aplikasi" tidak muncul → pastikan 4 file PNG sudah ada di repository.

## Keamanan
- Isi `config.js` memang terlihat publik dan itu aman; kunci rahasia Firebase hanya ada di Script Properties.
- Pakai `ADMIN_MODE` yang panjang. Kunci admin hanya tersimpan di HP admin.
  Kalau HP admin hilang, ganti `ADMIN_MODE` lalu deploy ulang.
