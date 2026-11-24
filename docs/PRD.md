# Product Requirements Document (PRD)
## Ethermind Social Command Center — Multi-Brand Social Media Monitoring Dashboard

| Atribut Dokumen | Detail |
| :--- | :--- |
| **Nama Produk** | Ethermind Social Command Center |
| **Versi Dokumen** | v1.0 (MVP — Monitoring & Analytics Only) |
| **Status** | Siap Masuk Tahap Pengembangan (*Ready for Dev*) |
| **Entitas Aktif** | Ethermind Agency (`ethermind.agency`) & Klozer (`klozer.my.id`) |
| **Platform Tercakup** | Instagram, Facebook, TikTok, X (Twitter), Threads |

---

## 1. Visi Produk & Latar Belakang

### 1.1. Visi Produk
Membangun satu pusat kendali analitik media sosial (*Social Command Center*) berkecepatan tinggi dengan visual modern untuk memantau performa seluruh akun media sosial milik **Ethermind Agency** dan **Klozer** dalam satu layar terpadu—sekaligus dirancang modular agar siap menampung akun media sosial klien agensi di fase berikutnya.

### 1.2. Masalah yang Diselesaikan
Saat ini operasional konten berjalan di 5 platform berbeda (**Instagram, Facebook, TikTok, X, dan Threads**) untuk dua ekosistem utama dengan karakter tujuan yang berbeda:
* **Klozer (`klozer.my.id`)**: Berfokus pada edukasi otomatisasi WhatsApp AI, demo fitur *Dynamic QRIS*, keamanan *Anti-Struk Palsu*, dan konversi menuju *free trial* 14 hari.
* **Ethermind (`ethermind.agency`)**: Berfokus pada otoritas brand agensi AI & desain, pameran *case study* (*MultiAgentCrisis, PactWarden, DataMind, Memscroll AI*), serta akuisisi prospek B2B.

**Tantangan Operasional Saat Ini:**
1. **Fragmentasi Data**: Tim harus membuka 5 dashboard berbeda untuk mengecek metrik harian dan performa tiap postingan.
2. **Perbandingan Lintas Brand & Platform Sulit**: Tidak ada metrik agregat untuk melihat total jangkauan (*reach/views*) atau *engagement rate* gabungan antara Ethermind dan Klozer.
3. **Kesiapan API Bertahap**: Saat ini baru ekosistem **Klozer** yang sudah terhubung ke **Meta Business** (Instagram & Facebook), sedangkan akun Ethermind serta aplikasi developer untuk TikTok, X, dan Threads masih dalam tahap persiapan.

---

## 2. Target Pengguna & Hak Akses (RBAC)

| Role | Pengguna | Hak Akses & Wewenang |
| :--- | :--- | :--- |
| **Super Admin** | Founders / CTO Ethermind | Akses penuh ke seluruh *workspace* (`All Brands`, `Ethermind`, `Klozer`), pengaturan koneksi OAuth & *Adapter Mode*, serta manajemen anggota tim. |
| **Brand Manager / CMO** | Lead Strategist Brand | Melihat seluruh analitik pada *workspace* yang ditugaskan, memeriksa detail performa konten, mengekspor laporan, dan memantau status sinkronisasi akun. |
| **Content & Social Analyst** | Tim Kreator & Analis | Melihat grafik pertumbuhan, *leaderboard* konten, dan detail metrik per postingan tanpa akses ke kredensial API atau pengaturan sistem. |
| **Client Viewer (Fase 2)** | Klien Eksternal Agensi | Akses *read-only* khusus pada *workspace* milik klien tersebut. |

---

## 3. Ruang Lingkup Produk (Scope)

### 3.1. Masuk Ruang Lingkup (In-Scope v1.0)
* **100% Monitoring & Analitik**: Agregasi metrik level akun (*followers*, *reach*, *impressions*, *profile views*) dan metrik level postingan (*views*, *likes*, *comments*, *shares/reposts*, *saves*, *engagement rate*).
* **Multi-Workspace Switching**: Pemisahan data antara **Ethermind**, **Klozer**, dan tampilan gabungan **All Brands**.
* **Hybrid Data Source (Live + Adapter)**: Integrasi langsung Meta Graph API untuk akun Klozer yang sudah siap, serta *Realistic Mock Data Adapter* untuk akun/platform lain yang belum terhubung API agar seluruh UI dapat langsung dioperasikan dan diuji.
* **Plasma-Style Post Detail Panel**: Panel inspeksi detail postingan dengan transisi *spring* halus 60fps.
* **Alerting Placeholder (Coming Soon)**: Antarmuka pengaturan notifikasi otomatis (Telegram / WhatsApp Gateway) berstatus *Coming Soon* untuk rilis v1.1.

### 3.2. Di Luar Ruang Lingkup (Out of Scope v1.0)
* Fitur penjadwalan dan publikasi konten lintas platform (*cross-posting / auto-scheduler*).
* Kotak masuk terpadu untuk membalas komentar atau *Direct Message* (DM).
* Pelacakan kampanye iklan berbayar (*Meta Ads / TikTok Ads Manager*).

---

## 4. Alur Pengguna Utama (User Flow)

```text
[1. Login Tim Internal]
         │
         ▼
[2. Workspace Switcher] ──► Pilih: [ All Brands ] | [ Ethermind ] | [ Klozer ]
         │
         ▼
[3. Executive Command Overview]
   ├──► Filter Global: Rentang Waktu (7D, 30D, 90D, Custom) & Platform (All, IG, FB, TikTok, X, Threads)
   ├──► Pantau 4 Kartu KPI Utama + Grafik Tren Pertumbuhan Lintas Platform
   │
   ├──► [Alur A: Inspeksi Postingan (Plasma Detail Transition)]
   │      └──► Klik baris/kartu postingan di Content Leaderboard
   │           └──► Background dashboard sedikit mengecil (scale 0.985) & meredup
   │           └──► Detail Panel meluncur & mengembang mulus (60fps spring)
   │           └──► Lihat preview media, rincian metrik, grafik velocity 48 jam, & tombol buka post asli
   │
   ├──► [Alur B: Account & Data Source Manager]
   │      └──► Cek daftar akun per workspace (Badge: LIVE META API vs ADAPTER SANDBOX)
   │      └──► Trigger manual sync atau hubungkan OAuth baru saat App Review platform selesai
   │
   └──► [Alur C: Alerting & Integrations (Coming Soon)]
          └──► Halaman pratinjau integrasi Telegram Bot & Klozer WhatsApp Gateway (Status: Coming Soon v1.1)
```

---

## 5. Kebutuhan Fungsional (Functional Requirements)

### FR-01: Multi-Workspace & Multi-Account Architecture
* Sistem mendukung hirarki `Organization -> Workspace -> Social Accounts`.
* Satu *workspace* dapat menautkan banyak akun pada platform yang sama (contoh: akun utama brand + akun pendukung/founder).
* *Workspace Switcher* di bagian atas memungkinkan perpindahan instan antar **All Brands**, **Ethermind**, dan **Klozer**.

### FR-02: Unified KPI & Cross-Platform Time-Series Analytics
* Menampilkan 4 kartu metrik utama dengan persentase perbandingan terhadap periode sebelumnya (*period-over-period delta*):
  1. **Total Reach / Views**: Akumulasi tayangan lintas platform terpilih.
  2. **Weighted Engagement Rate (%)**:
     $$\text{ER (\%)} = \frac{\text{Likes} + \text{Comments} + \text{Shares/Reposts} + \text{Saves}}{\text{Reach atau Views}} \times 100$$
  3. **Net Follower Growth**: Penambahan bersih pengikut dalam periode terpilih.
  4. **Published Content Count**: Total konten yang terbit pada rentang waktu aktif.
* Grafik garis/area interaktif (*multi-series chart*) yang dapat dipecah berdasarkan platform (`IG`, `FB`, `TikTok`, `X`, `Threads`) maupun perbandingan antar brand (`Ethermind vs Klozer`).

### FR-03: Unified Content Leaderboard & Viral Spike Detection
* Tabel dan tampilan grid yang menggabungkan seluruh postingan terbaru dari ke-5 platform.
* Mendukung pencarian *caption*, filter jenis format (`Reels/Video`, `Carousel`, `Image`, `Text/Thread`), dan pengurutan berdasarkan metrik tertinggi.
* **Viral Spike Indicator**: Penanda visual otomatis apabila sebuah postingan mencetak *engagement* atau *views* lebih dari $2\times$ rata-rata performa akun tersebut.

### FR-04: Hybrid Data Source & Account Health Monitor
* Setiap akun menampilkan status sumber datanya secara transparan:
  * **`LIVE API`**: Data ditarik langsung dari API resmi (aktif untuk akun **Klozer** di Instagram & Facebook via Meta Business).
  * **`MOCK ADAPTER`**: Data simulasi terstruktur untuk akun **Ethermind** serta platform **TikTok, X, dan Threads** selama proses pengajuan developer app berlangsung.
* Menampilkan waktu sinkronisasi terakhir (`Last Synced`) dan status kesehatan token OAuth (`Healthy`, `Expiring Soon`, `Needs Re-auth`).

### FR-05: Automated Alerting (Coming Soon — v1.1)
* Menyediakan tab/kartu **Automated Alerts** di menu pengaturan dengan label **`COMING SOON`**.
* Menampilkan pratinjau opsi kanal notifikasi masa depan (**Telegram Bot Alert** dan **WhatsApp Alert via Klozer Gateway**) untuk peringatan token kedaluwarsa dan deteksi konten viral, tanpa memblokir rilis v1.0.

### FR-06: Data Export
* Pengguna dapat mengunduh ringkasan metrik dan daftar performa postingan ke format **CSV** sesuai filter *workspace* dan rentang tanggal yang sedang aktif.

---

## 6. Spesifikasi Desain UI/UX & Sistem Animasi

Desain memadukan atmosfer visual **ZEN WebGL Shader & Liquid Glass** dengan presisi interaksi **Plasma 60fps Detail Panel**:

### 6.1. Sistem Visual (ZEN WebGL & Liquid Glass)
* **Ambient WebGL Shader Background**: Lapisan kanvas WebGL beresolusi ringan di belakang antarmuka gelap (`#070709`) yang merender gradien organik bergerak lambat dengan opasitas rendah ($12\% - 16\%$) agar keterbacaan angka tetap tajam.
  * *Tema Ethermind*: Nuansa *Indigo Violet* (`#4F46E5`) dan *Electric Cobalt* (`#3B82F6`).
  * *Tema Klozer*: Nuansa *Emerald Teal* (`#10B981`) dan *Cyan Glow* (`#06B6D4`).
  * Tersedia tombol kontrol di header untuk mengatur intensitas atau menjeda (*pause*) animasi shader.
* **Permukaan Kartu Liquid Glass**:
  * Latar semi-transparan `rgba(16, 17, 23, 0.65)` dengan `backdrop-filter: blur(20px) saturate(140%)`.
  * Garis tepi tipis `1px solid rgba(255, 255, 255, 0.08)` dan pantulan cahaya tipis di sisi atas (`inset 0 1px 0 rgba(255, 255, 255, 0.14)`).
* **Aksen Identitas Platform**:
  * Instagram: `#E1306C` | Facebook: `#1877F2` | TikTok: `#00F2FE` | X: `#E4E4E7` | Threads: `#A855F7`.
* **Tipografi**:
  * Heading & Angka Metrik: **Plus Jakarta Sans** dengan `font-variant-numeric: tabular-nums` agar angka sejajar rapi saat berubah.
  * Teks UI & Tabel: **Inter**.
  * Label Status & Timestamp: **JetBrains Mono**.
* **ZEN Kinetic Action Buttons**: Tombol utama (`Sync Data`, `Export CSV`, `Connect Account`) menggunakan efek *double-layer vertical text roll* saat di-*hover*.

### 6.2. Transisi Pembukaan Detail Panel (Plasma-Inspired 60fps Motion)
Saat pengguna mengklik salah satu item postingan untuk melihat analitik mendalamnya, sistem menjalankan koreografi transisi 3 lapis yang berjalan pada 60fps:
1. **Spatial Viewport Recede**: Kontainer dashboard utama di belakang secara halus mundur sedikit (`scale: 0.985`, `opacity: 0.72`, `border-radius: 20px`) disertai lapisan *backdrop blur* gelap (`rgba(4, 5, 8, 0.55)`) untuk menciptakan kedalaman ruang (*z-axis depth*).
2. **Fluid Spring Panel Expansion**: Panel detail (*slide-over / floating glass sheet* di sisi kanan layar) muncul dengan fisika pegas terkalibrasi (`type: "spring", stiffness: 360, damping: 32, mass: 0.85`), meluncur masuk tanpa memantul berlebihan (*critically damped feel*).
3. **Staggered Content Choreography**: Setelah panel mencapai $\sim 60\%$ bukaan, elemen di dalamnya (thumbnail media, badge platform, kartu metrik detail, dan grafik performa per jam) muncul berurutan dengan jeda mikro (`staggerChildren: 0.035s`) menggunakan properti GPU (`transform` dan `opacity`).

---

## 7. Kriteria Keberhasilan (Success Metrics)
* **Kecepatan Muat Awal (LCP)**: $< 1.5\text{ detik}$ untuk memuat tampilan ringkasan *workspace*.
* **Responsivitas Transisi**: Pembukaan *Post Detail Panel* dan perpindahan *workspace* berjalan stabil di $60\text{ fps}$ tanpa *frame drop*.
* **Kesiapan Plug-and-Play API**: Peralihan sebuah akun dari mode `MOCK ADAPTER` ke `LIVE API` cukup dilakukan melalui konfigurasi akun dan token OAuth tanpa mengubah kode komponen UI.