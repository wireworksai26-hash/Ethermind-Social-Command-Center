import { and, desc, eq, lt } from 'drizzle-orm';
import { db, schema } from '@/db';
import { addDays, eachDate, toDateStr } from '@/lib/dates';
import { env } from '@/lib/env';
import {
  AdapterError,
  type AccountRef,
  type ISocialPlatformAdapter,
  type NormalizedAccountMetrics,
  type NormalizedPost,
} from './types';

interface XUser {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
  };
}

interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: {
    retweet_count?: number;
    reply_count?: number;
    like_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
}

async function xApi<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.x.com/2/${path}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => null)) as (T & { detail?: string; title?: string; error?: string }) | null;
  if (!res.ok || !body) {
    if (res.status === 401 || res.status === 403) {
      throw new AdapterError(body?.detail ?? body?.title ?? 'X token unauthorized or insufficient tier', 'auth');
    }
    if (res.status === 429) {
      throw new AdapterError(body?.detail ?? 'X API rate limit exceeded', 'rate_limited');
    }
    throw new AdapterError(body?.detail ?? body?.error ?? `X API HTTP ${res.status}`);
  }
  return body;
}

function requireToken(account: AccountRef): string {
  if (!account.accessToken) throw new AdapterError('No access token stored for this X account', 'auth');
  return account.accessToken;
}

export class XLiveAdapter implements ISocialPlatformAdapter {
  readonly mode = 'live' as const;

  async syncAccountDailyMetrics(account: AccountRef, daysBack: number): Promise<NormalizedAccountMetrics[]> {
    const token = requireToken(account);
    const me = await xApi<{ data: XUser }>('users/me?user.fields=public_metrics', token);
    const followersNow = me.data.public_metrics?.followers_count ?? 0;

    const tweetsRes = await xApi<{ data?: XTweet[] }>(
      `users/${account.platformAccountId}/tweets?max_results=50&tweet.fields=created_at,public_metrics`,
      token,
    );
    const tweets = tweetsRes.data ?? [];

    const today = toDateStr(new Date());
    const from = addDays(today, -(Math.min(daysBack, 90) - 1));
    const [prevRow] = await db
      .select({ followersCount: schema.accountDailyMetrics.followersCount })
      .from(schema.accountDailyMetrics)
      .where(and(eq(schema.accountDailyMetrics.accountId, account.id), lt(schema.accountDailyMetrics.metricDate, today)))
      .orderBy(desc(schema.accountDailyMetrics.metricDate))
      .limit(1);

    const byDate = new Map<string, { impressions: number; interactions: number }>();
    for (const t of tweets) {
      if (!t.created_at) continue;
      const d = t.created_at.slice(0, 10);
      if (d < from || d > today) continue;
      const m = t.public_metrics ?? {};
      const impressions = m.impression_count ?? 0;
      const interactions =
        (m.like_count ?? 0) + (m.reply_count ?? 0) + (m.retweet_count ?? 0) + (m.quote_count ?? 0) + (m.bookmark_count ?? 0);
      const cur = byDate.get(d) ?? { impressions: 0, interactions: 0 };
      cur.impressions += impressions;
      cur.interactions += interactions;
      byDate.set(d, cur);
    }

    const dates = eachDate(from, today);
    return dates.map((date) => {
      const bucket = byDate.get(date);
      const impressions = bucket?.impressions ?? 0;
      const isToday = date === today;
      return {
        date,
        followersCount: followersNow,
        followersDelta: isToday && prevRow ? followersNow - prevRow.followersCount : 0,
        totalReach: impressions,
        totalImpressions: impressions,
        profileViews: 0,
        engagementRate: impressions > 0 ? Number((((bucket?.interactions ?? 0) / impressions) * 100).toFixed(3)) : 0,
      };
    });
  }

  async syncRecentPosts(account: AccountRef, limit: number): Promise<NormalizedPost[]> {
    const token = requireToken(account);
    const maxResults = Math.max(5, Math.min(limit, 100));
    const res = await xApi<{ data?: XTweet[] }>(
      `users/${account.platformAccountId}/tweets?max_results=${maxResults}&tweet.fields=created_at,public_metrics`,
      token,
    );
    return (res.data ?? []).map((t) => {
      const m = t.public_metrics ?? {};
      const impressions = m.impression_count ?? 0;
      const likes = m.like_count ?? 0;
      const comments = m.reply_count ?? 0;
      const shares = (m.retweet_count ?? 0) + (m.quote_count ?? 0);
      const saves = m.bookmark_count ?? 0;
      const interactions = likes + comments + shares + saves;
      return {
        platformPostId: t.id,
        mediaType: 'TWEET',
        caption: t.text,
        permalink: `https://x.com/${account.handle}/status/${t.id}`,
        thumbnailUrl: null,
        publishedAt: t.created_at ? new Date(t.created_at) : new Date(),
        viewsCount: impressions,
        reachCount: impressions,
        likesCount: likes,
        commentsCount: comments,
        sharesCount: shares,
        savesCount: saves,
        engagementRate: impressions > 0 ? Number(((interactions / impressions) * 100).toFixed(3)) : 0,
        hourlyVelocity: null,
      } satisfies NormalizedPost;
    });
  }

  async refreshAccessToken(account: AccountRef): Promise<{
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
  }> {
    const { X_CLIENT_ID, X_CLIENT_SECRET } = env();
    if (!X_CLIENT_ID || !X_CLIENT_SECRET) {
      throw new AdapterError('X_CLIENT_ID / X_CLIENT_SECRET are not configured', 'auth');
    }
    if (!account.refreshToken) throw new AdapterError('No X refresh token available', 'auth');

    const basic = Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64');
    const res = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
      }),
    });
    const body = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!res.ok || !body.access_token) {
      throw new AdapterError(body.error_description ?? 'X token refresh failed', 'auth');
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? account.refreshToken,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : null,
    };
  }
}
