import { and, eq, ne, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getAdapter } from '@/adapters/registry';
import { AdapterError, type AccountRef, type NormalizedPost } from '@/adapters/types';
import { decryptTokens, encryptTokens } from './crypto';
import { invalidateCache } from './redis';
import { dispatchAlert } from './alerts';

const METRICS_DAYS = 90;
const POSTS_LIMIT = 60;
const EXPIRY_WARNING_MS = 7 * 86_400_000;

export interface SyncResult {
  accountId: string;
  status: 'success' | 'failed' | 'rate_limited';
  recordsUpserted: number;
  error?: string;
}

async function loadAccountRef(accountId: string): Promise<{
  ref: AccountRef;
  mode: 'live' | 'mock';
  workspaceSlug: string;
  tokenExpiresAt: Date | null;
} | null> {
  const [row] = await db
    .select({
      account: schema.socialAccounts,
      slug: schema.workspaces.slug,
      token: schema.oauthTokens,
    })
    .from(schema.socialAccounts)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.socialAccounts.workspaceId))
    .leftJoin(schema.oauthTokens, eq(schema.oauthTokens.accountId, schema.socialAccounts.id))
    .where(eq(schema.socialAccounts.id, accountId))
    .limit(1);
  if (!row) return null;

  const tokens = row.token ? decryptTokens(row.token) : null;
  return {
    ref: {
      id: row.account.id,
      platform: row.account.platform,
      platformAccountId: row.account.platformAccountId,
      handle: row.account.handle,
      workspaceSlug: row.slug,
      accessToken: tokens?.accessToken ?? null,
      refreshToken: tokens?.refreshToken ?? null,
    },
    mode: row.account.mode,
    workspaceSlug: row.slug,
    tokenExpiresAt: row.token?.expiresAt ?? null,
  };
}

export function flagViralSpikes(posts: NormalizedPost[]): Set<string> {
  const flagged = new Set<string>();
  if (posts.length < 5) return flagged;
  const avgEr = posts.reduce((s, p) => s + p.engagementRate, 0) / posts.length;
  const avgViews = posts.reduce((s, p) => s + p.viewsCount, 0) / posts.length;
  for (const p of posts) {
    if ((avgEr > 0 && p.engagementRate >= 2 * avgEr) || (avgViews > 0 && p.viewsCount >= 2 * avgViews)) {
      flagged.add(p.platformPostId);
    }
  }
  return flagged;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function clampEr(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Number(Math.min(999.999, n).toFixed(3));
}

export async function syncAccount(accountId: string): Promise<SyncResult> {
  const started = Date.now();
  const loaded = await loadAccountRef(accountId);
  if (!loaded) return { accountId, status: 'failed', recordsUpserted: 0, error: 'Account not found' };
  const { ref, mode, workspaceSlug, tokenExpiresAt } = loaded;

  try {
    const adapter = getAdapter({ platform: ref.platform, mode });
    const [metrics, posts] = await Promise.all([
      adapter.syncAccountDailyMetrics(ref, METRICS_DAYS),
      adapter.syncRecentPosts(ref, POSTS_LIMIT),
    ]);

    for (const part of chunk(metrics, 200)) {
      await db
        .insert(schema.accountDailyMetrics)
        .values(
          part.map((m) => ({
            accountId,
            metricDate: m.date,
            followersCount: Math.max(0, Math.round(m.followersCount)),
            followersDelta: Math.round(m.followersDelta),
            totalReach: Math.max(0, Math.round(m.totalReach)),
            totalImpressions: Math.max(0, Math.round(m.totalImpressions)),
            profileViews: Math.max(0, Math.round(m.profileViews)),
            engagementRate: clampEr(m.engagementRate),
          })),
        )
        .onConflictDoUpdate({
          target: [schema.accountDailyMetrics.accountId, schema.accountDailyMetrics.metricDate],
          set: {
            followersCount: sql`excluded.followers_count`,
            followersDelta: sql`excluded.followers_delta`,
            totalReach: sql`excluded.total_reach`,
            totalImpressions: sql`excluded.total_impressions`,
            profileViews: sql`excluded.profile_views`,
            engagementRate: sql`excluded.engagement_rate`,
          },
        });
    }

    const viral = flagViralSpikes(posts);
    for (const part of chunk(posts, 100)) {
      await db
        .insert(schema.socialPosts)
        .values(
          part.map((p) => ({
            accountId,
            platform: ref.platform,
            platformPostId: p.platformPostId,
            mediaType: p.mediaType,
            caption: p.caption,
            permalink: p.permalink,
            thumbnailUrl: p.thumbnailUrl,
            publishedAt: p.publishedAt,
            viewsCount: p.viewsCount,
            reachCount: p.reachCount,
            likesCount: Math.max(0, Math.round(p.likesCount)),
            commentsCount: Math.max(0, Math.round(p.commentsCount)),
            sharesCount: Math.max(0, Math.round(p.sharesCount)),
            savesCount: Math.max(0, Math.round(p.savesCount)),
            engagementRate: clampEr(p.engagementRate),
            isViralSpike: viral.has(p.platformPostId),
            hourlyVelocity: p.hourlyVelocity,
            lastUpdatedAt: new Date(),
          })),
        )
        .onConflictDoUpdate({
          target: [schema.socialPosts.accountId, schema.socialPosts.platformPostId],
          set: {
            mediaType: sql`excluded.media_type`,
            caption: sql`excluded.caption`,
            permalink: sql`excluded.permalink`,
            thumbnailUrl: sql`excluded.thumbnail_url`,
            viewsCount: sql`excluded.views_count`,
            reachCount: sql`excluded.reach_count`,
            likesCount: sql`excluded.likes_count`,
            commentsCount: sql`excluded.comments_count`,
            sharesCount: sql`excluded.shares_count`,
            savesCount: sql`excluded.saves_count`,
            engagementRate: sql`excluded.engagement_rate`,
            isViralSpike: sql`excluded.is_viral_spike`,
            hourlyVelocity: sql`excluded.hourly_velocity`,
            lastUpdatedAt: sql`excluded.last_updated_at`,
          },
        });
    }

    const expiringSoon =
      mode === 'live' && tokenExpiresAt !== null && tokenExpiresAt.getTime() - Date.now() < EXPIRY_WARNING_MS;
    await db
      .update(schema.socialAccounts)
      .set({ lastSyncedAt: new Date(), status: expiringSoon ? 'expiring_soon' : 'active' })
      .where(eq(schema.socialAccounts.id, accountId));

    const records = metrics.length + posts.length;
    await db.insert(schema.syncLogs).values({
      accountId,
      mode,
      status: 'success',
      recordsUpserted: records,
      durationMs: Date.now() - started,
    });
    await invalidateCache();

    if (expiringSoon) {
      await dispatchAlert({
        type: 'token_expiring',
        workspaceSlug,
        message: `${ref.handle} (${ref.platform}) token expires within 7 days`,
      });
    }
    return { accountId, status: 'success', recordsUpserted: records };
  } catch (error) {
    const kind = error instanceof AdapterError ? error.kind : 'unknown';
    const message = error instanceof Error ? error.message : String(error);
    const status: SyncResult['status'] = kind === 'rate_limited' ? 'rate_limited' : 'failed';

    await db.insert(schema.syncLogs).values({
      accountId,
      mode,
      status,
      errorMessage: message.slice(0, 1000),
      durationMs: Date.now() - started,
    });
    if (kind === 'auth' || kind === 'rate_limited') {
      await db
        .update(schema.socialAccounts)
        .set({ status: kind === 'auth' ? 'disconnected' : 'rate_limited' })
        .where(eq(schema.socialAccounts.id, accountId));
    }
    if (kind === 'auth') {
      await dispatchAlert({
        type: 'token_needs_reauth',
        workspaceSlug,
        message: `${ref.handle} (${ref.platform}) needs re-authentication`,
      });
    }
    return { accountId, status, recordsUpserted: 0, error: message };
  }
}

export async function syncAllAccounts(): Promise<SyncResult[]> {
  const accounts = await db
    .select({ id: schema.socialAccounts.id })
    .from(schema.socialAccounts)
    .where(ne(schema.socialAccounts.status, 'disconnected'));
  const results: SyncResult[] = [];
  for (const { id } of accounts) results.push(await syncAccount(id));
  return results;
}

/** Re-exchanges Meta tokens that expire in under 7 days (called by the 12h worker job). */
export async function refreshExpiringTokens(): Promise<number> {
  const rows = await db
    .select({ accountId: schema.oauthTokens.accountId })
    .from(schema.oauthTokens)
    .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.oauthTokens.accountId))
    .where(
      and(
        eq(schema.socialAccounts.mode, 'live'),
        sql`${schema.oauthTokens.expiresAt} IS NOT NULL AND ${schema.oauthTokens.expiresAt} < NOW() + INTERVAL '7 days'`,
      ),
    );

  let refreshed = 0;
  for (const { accountId } of rows) {
    const loaded = await loadAccountRef(accountId);
    if (!loaded) continue;
    const adapter = getAdapter({ platform: loaded.ref.platform, mode: 'live' });
    if (!adapter.refreshAccessToken) continue;
    try {
      const next = await adapter.refreshAccessToken(loaded.ref);
      const enc = encryptTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken });
      await db
        .update(schema.oauthTokens)
        .set({ ...enc, expiresAt: next.expiresAt, updatedAt: new Date() })
        .where(eq(schema.oauthTokens.accountId, accountId));
      await db.update(schema.socialAccounts).set({ status: 'active' }).where(eq(schema.socialAccounts.id, accountId));
      refreshed++;
    } catch (error) {
      console.error('[token-refresh] failed for', accountId, (error as Error).message);
      await db.update(schema.socialAccounts).set({ status: 'disconnected' }).where(eq(schema.socialAccounts.id, accountId));
      await dispatchAlert({
        type: 'token_needs_reauth',
        workspaceSlug: loaded.workspaceSlug,
        message: `${loaded.ref.handle} (${loaded.ref.platform}) token could not be refreshed`,
      });
    }
  }
  await invalidateCache();
  return refreshed;
}
