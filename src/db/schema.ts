import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/* ---------------------------------- Better-Auth tables ---------------------------------- */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------- Domain tables ------------------------------------- */

export const MEMBER_ROLES = ['brand_manager', 'analyst', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'x', 'threads'] as const;
export type PlatformType = (typeof PLATFORMS)[number];

export const platformEnum = pgEnum('social_platform', PLATFORMS);
export const adapterModeEnum = pgEnum('adapter_mode', ['live', 'mock']);
export const accountStatusEnum = pgEnum('account_status', [
  'active',
  'expiring_soon',
  'disconnected',
  'rate_limited',
]);

export interface ShaderConfig {
  primary: string;
  secondary: string;
}

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  websiteUrl: varchar('website_url', { length: 200 }),
  shaderConfig: jsonb('shader_config')
    .$type<ShaderConfig>()
    .notNull()
    .default({ primary: '#4F46E5', secondary: '#06B6D4' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').$type<MemberRole>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    role: text('role').$type<MemberRole>().notNull(),
    workspaceIds: uuid('workspace_ids').array().notNull(),
    invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (t) => [index('idx_invitations_email').on(t.email)],
);

export const socialAccounts = pgTable(
  'social_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull(),
    mode: adapterModeEnum('mode').notNull().default('mock'),
    platformAccountId: varchar('platform_account_id', { length: 120 }).notNull(),
    handle: varchar('handle', { length: 120 }).notNull(),
    displayName: varchar('display_name', { length: 150 }).notNull(),
    avatarUrl: text('avatar_url'),
    status: accountStatusEnum('status').notNull().default('active'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_social_accounts_platform_account').on(t.workspaceId, t.platform, t.platformAccountId)],
);

/**
 * One AES-256-GCM ciphertext per account holding both tokens as JSON.
 * A single IV is never reused for two encryptions under the same key.
 */
export const oauthTokens = pgTable('oauth_tokens', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => socialAccounts.id, { onDelete: 'cascade' }),
  encryptedPayload: text('encrypted_payload').notNull(),
  iv: varchar('iv', { length: 64 }).notNull(),
  authTag: varchar('auth_tag', { length: 64 }).notNull(),
  scopes: text('scopes').array(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accountDailyMetrics = pgTable(
  'account_daily_metrics',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => socialAccounts.id, { onDelete: 'cascade' }),
    metricDate: date('metric_date', { mode: 'string' }).notNull(),
    followersCount: integer('followers_count').notNull().default(0),
    followersDelta: integer('followers_delta').notNull().default(0),
    totalReach: bigint('total_reach', { mode: 'number' }).notNull().default(0),
    totalImpressions: bigint('total_impressions', { mode: 'number' }).notNull().default(0),
    profileViews: integer('profile_views').notNull().default(0),
    engagementRate: numeric('engagement_rate', { precision: 6, scale: 3, mode: 'number' })
      .notNull()
      .default(0),
  },
  (t) => [
    unique('uq_daily_metrics_account_date').on(t.accountId, t.metricDate),
    index('idx_daily_metrics_account_date').on(t.accountId, t.metricDate.desc()),
  ],
);

export const socialPosts = pgTable(
  'social_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => socialAccounts.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull(),
    platformPostId: varchar('platform_post_id', { length: 150 }).notNull(),
    mediaType: varchar('media_type', { length: 40 }).notNull(),
    caption: text('caption'),
    permalink: text('permalink').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    viewsCount: bigint('views_count', { mode: 'number' }).notNull().default(0),
    reachCount: bigint('reach_count', { mode: 'number' }).notNull().default(0),
    likesCount: integer('likes_count').notNull().default(0),
    commentsCount: integer('comments_count').notNull().default(0),
    sharesCount: integer('shares_count').notNull().default(0),
    savesCount: integer('saves_count').notNull().default(0),
    engagementRate: numeric('engagement_rate', { precision: 6, scale: 3, mode: 'number' })
      .notNull()
      .default(0),
    isViralSpike: boolean('is_viral_spike').notNull().default(false),
    hourlyVelocity: jsonb('hourly_velocity').$type<number[]>(),
    lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_social_posts_account_post').on(t.accountId, t.platformPostId),
    index('idx_social_posts_account_published').on(t.accountId, t.publishedAt.desc()),
    index('idx_social_posts_engagement').on(t.engagementRate.desc()),
  ],
);

export const syncLogs = pgTable('sync_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: uuid('account_id').references(() => socialAccounts.id, { onDelete: 'set null' }),
  mode: adapterModeEnum('mode').notNull(),
  status: varchar('status', { length: 20 }).$type<'success' | 'failed' | 'rate_limited'>().notNull(),
  recordsUpserted: integer('records_upserted').notNull().default(0),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
});
