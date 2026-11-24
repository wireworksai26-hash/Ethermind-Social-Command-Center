# Technical Requirements Document (TRD)
## Ethermind Social Command Center — System Architecture & Implementation Spec

| Atribut Teknis | Detail |
| :--- | :--- |
| **Versi Arsitektur** | v1.0 (Decoupled Ingestion + Hybrid Adapter Pattern) |
| **Stack Utama** | Next.js 15 (TypeScript), PostgreSQL 16, Redis + BullMQ, OGL WebGL, Motion |
| **Strategi Data** | Live Meta Graph API (Klozer) + Deterministic Mock Adapter (Ethermind & Platform Pending) |

---

## 1. Arsitektur Sistem Tingkat Tinggi (High-Level Architecture)

Dashboard menerapkan arsitektur **Decoupled Background Ingestion** yang dipadukan dengan **Provider Adapter Pattern**. Seluruh tampilan frontend membaca data dari PostgreSQL dan cache Redis sehingga performa antarmuka tetap instan ($< 50\text{ ms}$ per kueri) tanpa bergantung pada latensi API pihak ketiga.

```text
+-----------------------------------------------------------------------------+
|                        FRONTEND LAYER (Next.js 15 App)                      |
|  +-----------------------+  +--------------------+  +--------------------+  |
|  | Ambient WebGL Canvas  |  | Liquid Glass UI &  |  | TanStack Query     |  |
|  | (OGL GLSL Shader)     |  | Plasma Detail Panel|  | Client State Cache |  |
|  +-----------------------+  +--------------------+  +---------+----------+  |
+---------------------------------------------------------------+-------------+
                                                                | HTTPS / JSON
+---------------------------------------------------------------v-------------+
|                      BACKEND API LAYER (Next.js Route Handlers)             |
|  +-----------------------+  +--------------------+  +--------------------+  |
|  | Session & RBAC Guard  |  | Meta OAuth 2.0     |  | Analytics Query    |  |
|  | (Better-Auth)         |  | Callback Handler   |  | Aggregator Service |  |
|  +-----------------------+  +---------+----------+  +---------+----------+  |
+---------------------------------------+-----------------------+-------------+
                                        |                       |
                 +----------------------v-------+   +-----------v-----------+
                 |   REDIS + BULLMQ WORKER      |   |    POSTGRESQL 16      |
                 | - Scheduled Sync (2-3 jam)   |<--| - Workspaces & Users  |
                 | - Meta Token Auto-Refresher  |   | - Encrypted Vault     |
                 | - Adapter Router Engine      |   | - Daily Snapshots     |
                 +--------------+---------------+   +-----------------------+
                                |
                 +--------------v---------------+
                 |   HYBRID ADAPTER REGISTRY    |
                 +------+---------------+-------+
                        |               |
       [adapter_mode = 'live']   [adapter_mode = 'mock']
                        |               |
                        v               v
             +------------------+  +------------------------+
             | Meta Graph API   |  | Deterministic Mock     |
             | (Klozer IG & FB) |  | Generator (Ethermind,  |
             +------------------+  | TikTok, X, Threads)    |
                                   +------------------------+
```

---

## 2. Spesifikasi Tech Stack

| Layer | Teknologi | Versi / Detail | Alasan Pemilihan |
| :--- | :--- | :--- | :--- |
| **Framework** | **Next.js (App Router)** | v15.x + TypeScript 5 | Mendukung React Server Components, API Routes terpadu, dan *type-safety* penuh dari database hingga UI. |
| **Styling** | **Tailwind CSS + Radix UI** | Tailwind v4 | Presisi tinggi untuk efek *liquid glass*, variabel tema per *workspace*, dan primitif aksesibilitas dialog/drawer. |
| **WebGL Shader** | **OGL (Minimal WebGL)** | v1.x ($\sim 8\text{ KB}$) | Jauh lebih ringan dibanding Three.js penuh untuk merender *ambient background shader* 60fps. |
| **Animasi UI** | **Motion (Framer Motion)** | v11.x / v12.x | Mendukung *spring physics* terkalibrasi untuk *Plasma Detail Panel*, `layoutId` shared tabs, dan *staggered reveal*. |
| **Visualisasi Data** | **Recharts (Custom Theme)** | v2.x | Komponen grafik area/garis responsif yang mudah dikustomisasi dengan gradien transparan dan *custom glass tooltip*. |
| **Database** | **PostgreSQL + Drizzle ORM** | PostgreSQL 16 | Kinerja kueri agregasi *time-series* yang cepat dan skema migrasi TypeScript yang bersih. |
| **Queue & Cache** | **Redis + BullMQ** | Redis 7.x | Mengelola antrean penarikan data periodik, *rate-limit backoff*, dan caching hasil agregasi dashboard. |
| **Autentikasi** | **Better-Auth** | v1.x | Manajemen sesi internal agensi dengan dukungan peran RBAC (`super_admin`, `brand_manager`, `analyst`). |
| **Deployment** | **Docker Compose** | VPS / Coolify | Menjalankan kontainer `web`, `worker`, `postgres`, dan `redis` dalam satu jaringan privat yang mudah di-deploy. |

---

## 3. Desain Hybrid Data Adapter (Live Meta API vs Mock Adapter)

Karena saat ini baru **Klozer** yang memiliki koneksi aktif ke **Meta Business**, backend menerapkan antarmuka standar `ISocialPlatformAdapter`. Setiap baris pada tabel `social_accounts` memiliki kolom `adapter_mode` bernilai `'live'` atau `'mock'`.

### 3.1. Kontrak Antarmuka Adapter (TypeScript)

```typescript
export type PlatformType = 'instagram' | 'facebook' | 'tiktok' | 'x' | 'threads';
export type AdapterMode = 'live' | 'mock';

export interface NormalizedAccountMetrics {
  date: string; // YYYY-MM-DD
  followersCount: number;
  followersDelta: number;
  totalReach: number;
  totalImpressions: number;
  profileViews: number;
  engagementRate: number;
}

export interface NormalizedPost {
  platformPostId: string;
  mediaType: 'REEL' | 'CAROUSEL' | 'IMAGE' | 'VIDEO' | 'TEXT_THREAD' | 'TWEET';
  caption: string;
  permalink: string;
  thumbnailUrl: string | null;
  publishedAt: Date;
  viewsCount: number;
  reachCount: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  engagementRate: number;
}

export interface ISocialPlatformAdapter {
  readonly platform: PlatformType;
  readonly mode: AdapterMode;

  syncAccountDailyMetrics(accountId: string, daysBack: number): Promise<NormalizedAccountMetrics[]>;
  syncRecentPosts(accountId: string, limit: number): Promise<NormalizedPost[]>;
  refreshAccessToken?(accountId: string): Promise<{ accessToken: string; expiresAt: Date }>;
}
```

### 3.2. Implementasi Adapter per Ekosistem

1. **`MetaGraphLiveAdapter` (Aktif untuk Klozer IG & FB)**:
   * Menggunakan Meta Graph API v21.0+.
   * **Instagram Business**: Menarik `follower_count`, `reach`, `impressions` dari `GET /{ig-user-id}/insights` serta daftar media dan metrik engagement (`likes`, `comments`, `saved`, `shares`, `plays`) dari `GET /{ig-user-id}/media`.
   * **Facebook Page**: Menarik `page_impressions_unique`, `page_post_engagements`, dan `page_fans` dari `GET /{page-id}/insights`.
2. **`DeterministicMockAdapter` (Aktif untuk Ethermind, TikTok, X, Threads)**:
   * Menggunakan *seeded pseudo-random generator* berdasarkan `account_id` dan tanggal sehingga data historis 30–90 hari ke belakang tetap konsisten saat halaman di-refresh, namun terus bertambah secara natural setiap kali siklus sync berjalan.
   * Menyertakan simulasi skenario nyata (misal: lonjakan *viral spike* pada konten demo AI atau *case study* agensi) untuk menguji fitur deteksi anomali di UI.
   * Begitu developer app untuk Ethermind, TikTok, X, atau Threads disetujui, admin cukup mengubah `adapter_mode` akun terkait dari `'mock'` ke `'live'` dan menyelesaikan alur OAuth 2.0.

---

## 4. Skema Database Relasional (PostgreSQL DDL)

```sql
-- 1. Workspaces (Ethermind Agency, Klozer, Klien Masa Depan)
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    website_url VARCHAR(200),
    shader_config JSONB NOT NULL DEFAULT '{"primary": "#4F46E5", "secondary": "#06B6D4"}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Pengguna Internal & RBAC
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(120) NOT NULL,
    password_hash TEXT NOT NULL,
    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL CHECK (role IN ('brand_manager', 'analyst', 'viewer')),
    PRIMARY KEY (workspace_id, user_id)
);

-- 3. Akun Media Sosial & Konfigurasi Adapter
CREATE TYPE social_platform AS ENUM ('instagram', 'facebook', 'tiktok', 'x', 'threads');
CREATE TYPE adapter_mode AS ENUM ('live', 'mock');
CREATE TYPE account_status AS ENUM ('active', 'expiring_soon', 'disconnected', 'rate_limited');

CREATE TABLE social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform social_platform NOT NULL,
    mode adapter_mode NOT NULL DEFAULT 'mock',
    platform_account_id VARCHAR(120) NOT NULL,
    handle VARCHAR(120) NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    avatar_url TEXT,
    status account_status NOT NULL DEFAULT 'active',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, platform, platform_account_id)
);

-- 4. Encrypted OAuth Token Vault (Untuk Akun Mode 'live')
CREATE TABLE oauth_tokens (
    account_id UUID PRIMARY KEY REFERENCES social_accounts(id) ON DELETE CASCADE,
    encrypted_access_token TEXT NOT NULL,
    encrypted_refresh_token TEXT,
    iv VARCHAR(64) NOT NULL,
    auth_tag VARCHAR(64) NOT NULL,
    scopes TEXT[],
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Snapshot Metrik Harian Level Akun
CREATE TABLE account_daily_metrics (
    id BIGSERIAL PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    followers_count INT NOT NULL DEFAULT 0,
    followers_delta INT NOT NULL DEFAULT 0,
    total_reach BIGINT NOT NULL DEFAULT 0,
    total_impressions BIGINT NOT NULL DEFAULT 0,
    profile_views INT NOT NULL DEFAULT 0,
    engagement_rate NUMERIC(6, 3) NOT NULL DEFAULT 0,
    UNIQUE (account_id, metric_date)
);

CREATE INDEX idx_daily_metrics_account_date ON account_daily_metrics (account_id, metric_date DESC);

-- 6. Katalog Postingan Lintas Platform
CREATE TABLE social_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    platform social_platform NOT NULL,
    platform_post_id VARCHAR(150) NOT NULL,
    media_type VARCHAR(40) NOT NULL,
    caption TEXT,
    permalink TEXT NOT NULL,
    thumbnail_url TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    views_count BIGINT NOT NULL DEFAULT 0,
    reach_count BIGINT NOT NULL DEFAULT 0,
    likes_count INT NOT NULL DEFAULT 0,
    comments_count INT NOT NULL DEFAULT 0,
    shares_count INT NOT NULL DEFAULT 0,
    saves_count INT NOT NULL DEFAULT 0,
    engagement_rate NUMERIC(6, 3) NOT NULL DEFAULT 0,
    is_viral_spike BOOLEAN NOT NULL DEFAULT FALSE,
    hourly_velocity JSONB, -- Menyimpan kurva performa 24-48 jam untuk Plasma Detail Panel
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (account_id, platform_post_id)
);

CREATE INDEX idx_social_posts_account_published ON social_posts (account_id, published_at DESC);
CREATE INDEX idx_social_posts_engagement ON social_posts (engagement_rate DESC);

-- 7. Log Audit Sinkronisasi
CREATE TABLE sync_logs (
    id BIGSERIAL PRIMARY KEY,
    account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,
    mode adapter_mode NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'rate_limited')),
    records_upserted INT NOT NULL DEFAULT 0,
    error_message TEXT,
    duration_ms INT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 5. Spesifikasi Endpoint REST API Internal

Seluruh endpoint berada di bawah prefix `/api/v1` dan dilindungi oleh *session middleware* serta pengecekan akses *workspace*.

| Method & Endpoint | Deskripsi | Query / Payload Utama |
| :--- | :--- | :--- |
| `GET /api/v1/analytics/overview` | Mengambil agregasi 4 KPI utama dan *time-series* harian. | `?workspace=all\|ethermind\|klozer&platform=all\|instagram\|...&range=7d\|30d\|90d` |
| `GET /api/v1/analytics/posts` | Mengambil daftar postingan terpadu dengan paginasi & sorting. | `?workspace=...&platform=...&sort=engagement_rate\|views_count\|published_at&page=1` |
| `GET /api/v1/posts/:postId/detail` | Mengambil detail lengkap postingan + data kurva *velocity* untuk **Plasma Detail Panel**. | Path param `postId` (UUID) |
| `GET /api/v1/workspaces/:slug/accounts` | Mengambil daftar akun terhubung, status kesehatan token, dan `adapter_mode`. | Path param `slug` |
| `POST /api/v1/workspaces/:slug/sync` | Memicu sinkronisasi latar belakang secara manual via BullMQ. | `{ "accountId": "optional-uuid" }` |
| `GET /api/v1/oauth/meta/callback` | Menangani pertukaran kode OAuth Meta menjadi *Long-Lived Token* terenkripsi. | `?code=...&state=...` |
| `GET /api/v1/integrations/alerts` | Mengembalikan konfigurasi kanal alert (saat ini mengembalikan status `coming_soon`). | — |

---

## 6. Keamanan Token & Background Worker Pipeline

### 6.1. Enkripsi Token OAuth (AES-256-GCM)
* Token API (seperti Meta Long-Lived Token untuk Klozer) tidak pernah disimpan dalam bentuk *plain text*.
* Modul `TokenVaultService` mengenkripsi token menggunakan `crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv)` sebelum melakukan `INSERT/UPDATE` ke PostgreSQL, serta mendekripsinya hanya di dalam memori worker saat melakukan panggilan API.

### 6.2. Siklus BullMQ Workers
1. **`metrics-ingestion-worker` (Setiap 2 Jam)**:
   * Mengambil seluruh `social_accounts` dengan status bukan `disconnected`.
   * Memilih adapter yang sesuai (`MetaGraphLiveAdapter` vs `DeterministicMockAdapter`).
   * Melakukan *upsert* ke `account_daily_metrics` dan `social_posts`, sekaligus menghitung flag `is_viral_spike` apabila `post.engagement_rate >= 2.0 * account_avg_er`.
   * Menghapus kunci cache Redis terkait agar dashboard menampilkan angka terbaru.
2. **`meta-token-refresher` (Setiap 12 Jam)**:
   * Memeriksa token akun bermode `'live'` yang masa berlakunya tersisa $< 7\text{ hari}$ (`expires_at < NOW() + INTERVAL '7 days'`).
   * Memperbarui token melalui endpoint `oauth/access_token` Meta dan memperbarui kolom `expires_at`.
3. **`alert-dispatcher` (Stub v1.0 / Coming Soon v1.1)**:
   * Interface `IAlertChannel` sudah disiapkan di kode worker namun dalam keadaan *no-op* dengan flag `ENABLE_EXTERNAL_ALERTS=false`, siap dihubungkan ke **Telegram Bot API** atau **Klozer WhatsApp Gateway** pada iterasi berikutnya.

---

## 7. Rekayasa Frontend: WebGL Shader & Plasma 60fps Detail Panel

Untuk menjaga performa tetap stabil di $60\text{ fps}$ meskipun menggunakan efek *WebGL Shader* dan *backdrop-filter blur*, arsitektur frontend menerapkan aturan berikut:

### 7.1. Optimasi WebGL Ambient Shader (OGL)
* **Resolusi Terbatas**: Kanvas WebGL dikunci pada `dpr = Math.min(window.devicePixelRatio, 1.5)` sehingga GPU tidak terbebani rendering piksel berlebih pada layar Retina/4K.
* **Smart Lifecycle Pause**: Menggunakan `document.addEventListener('visibilitychange')` untuk menghentikan `requestAnimationFrame` saat tab browser tidak aktif, serta otomatis dijeda saat **Plasma Detail Panel** terbuka penuh agar seluruh daya GPU terfokus pada transisi panel.
* **Aksesibilitas**: Mendukung media query `prefers-reduced-motion: reduce` dan tombol *toggle* manual di header.

### 7.2. Arsitektur Motion Plasma Detail Panel
Komponen `<PostDetailPanel />` dibangun menggunakan **Motion (`AnimatePresence`)** dan **Radix Dialog** tanpa memicu *layout reflow*:
* **Isolasi Layer Komposit**: Seluruh animasi transisi hanya memanipulasi properti GPU `transform` (`translate3d`, `scale`) dan `opacity` dengan `will-change: transform, opacity`.
* **Konfigurasi Fisika Pegas**:
  ```typescript
  export const PLASMA_PANEL_SPRING = {
    type: 'spring' as const,
    stiffness: 360,
    damping: 32,
    mass: 0.85,
  };

  export const VIEWPORT_RECEDE_TRANSITION = {
    duration: 0.38,
    ease: [0.22, 1, 0.36, 1] as const,
  };
  ```
* **Prefetching Data**: Saat kursor pengguna berada di atas baris postingan (`onMouseEnter`) selama $> 120\text{ ms}$, TanStack Query melakukan *prefetch* ke `/api/v1/posts/:postId/detail` sehingga saat postingan diklik, transisi panel terbuka seketika tanpa *loading spinner* yang mengganggu alur visual.