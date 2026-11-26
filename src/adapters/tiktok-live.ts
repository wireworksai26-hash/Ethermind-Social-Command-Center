import { and, eq, lt } from 'drizzle-orm';
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

interface TikTokError {
  code?: string;
  message?: string;
}

interface TikTokUser {
  open_id: string;
  display_name?: string;
  avatar_url?: string;
  follower_count?: number;
  likes_count?: number;
  video_count?: number;
}

interface TikTokVideo {
  id: string;
  title?: string;
  video_description?: string;
  cover_image_url?: string;
  share_url?: string;
  create_time?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  view_count?: number;
}

async function tiktokApi<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://open.tiktokapis.com/v2/${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const body = (await res.json()) as { data?: T; error?: TikTokError };
  const code = body.error?.code;
  if (!res.ok || (code && code !== 'ok')) {
    if (res.status === 401 || code === 'access_token_invalid' || code === 'token_expired') {
      throw new AdapterError(body.error?.message ?? 'TikTok token invalid', 'auth');
    }
    if (res.status === 429 || code === 'rate_limit_exceeded') {
      throw new AdapterError(body.error?.message ?? 'TikTok rate limit exceeded', 'rate_limited');
    }
    throw new AdapterError(body.error?.message ?? `TikTok API HTTP ${res.status}`);
  }
  if (!body.data) throw new AdapterError('TikTok API returned empty data');
  return body.data;
}

function requireToken(account: AccountRef): string {
  if (!account.accessToken) throw new AdapterError('No access token stored for this TikTok account', 'auth');
  return account.accessToken;
}

async function fetchVideos(token: string, limit: number): Promise<TikTokVideo[]> {
  const collected: TikTokVideo[] = [];
  let cursor: number | undefined;
  let hasMore = true;

  while (hasMore && collected.length < limit) {
    const batch = Math.min(20, limit - collected.length);
    const data = await tiktokApi<{ videos?: TikTokVideo[]; cursor?: number; has_more?: boolean }>(
      'video/list/?fields=id,title,video_description,cover_image_url,share_url,create_time,like_count,comment_count,share_count,view_count',
      token,
      {
        method: 'POST',
        body: JSON.stringify(cursor !== undefined ? { max_count: batch, cursor } : { max_count: batch }),
      },
    );
    const items = data.videos ?? [];
    collected.push(...items);
    hasMore = Boolean(data.has_more && data.cursor !== undefined && items.length > 0);
    cursor = data.cursor;
  }
  return collected;
}

export class TikTokLiveAdapter implements ISocialPlatformAdapter {
  readonly mode = 'live' as const;

  async syncAccountDailyMetrics(account: AccountRef, daysBack: number): Promise<NormalizedAccountMetrics[]> {
    const token = requireToken(account);
    const userRes = await tiktokApi<{ user: TikTokUser }>(
      'user/info/?fields=open_id,display_name,avatar_url,follower_count,likes_count,video_count',
      token,
    );
    const followersNow = userRes.user.follower_count ?? 0;
    const videos = await fetchVideos(token, 60);

    const today = toDateStr(new Date());
    const from = addDays(today, -(Math.min(daysBack, 90) - 1));
    const [prevRow] = await db
      .select({ followersCount: schema.accountDailyMetrics.followersCount })
      .from(schema.accountDailyMetrics)
      .where(and(eq(schema.accountDailyMetrics.accountId, account.id), lt(schema.accountDailyMetrics.metricDate, today)))
      .orderBy(schema.accountDailyMetrics.metricDate)
      .limit(1);

    const byDate = new Map<string, { views: number; interactions: number }>();
    for (const v of videos) {
      if (!v.create_time) continue;
      const d = toDateStr(new Date(v.create_time * 1000));
      if (d < from || d > today) continue;
      const cur = byDate.get(d) ?? { views: 0, interactions: 0 };
      cur.views += v.view_count ?? 0;
      cur.interactions += (v.like_count ?? 0) + (v.comment_count ?? 0) + (v.share_count ?? 0);
      byDate.set(d, cur);
    }

    const dates = eachDate(from, today);
    const latestPrevFollowers = prevRow?.followersCount;
    return dates.map((date) => {
      const bucket = byDate.get(date);
      const reach = bucket?.views ?? 0;
      const isToday = date === today;
      return {
        date,
        followersCount: followersNow,
        followersDelta: isToday && latestPrevFollowers !== undefined ? followersNow - latestPrevFollowers : 0,
        totalReach: reach,
        totalImpressions: reach,
        profileViews: 0,
        engagementRate: reach > 0 ? Number((((bucket?.interactions ?? 0) / reach) * 100).toFixed(3)) : 0,
      };
    });
  }

  async syncRecentPosts(account: AccountRef, limit: number): Promise<NormalizedPost[]> {
    const token = requireToken(account);
    const videos = await fetchVideos(token, limit);
    return videos.map((v) => {
      const views = v.view_count ?? 0;
      const likes = v.like_count ?? 0;
      const comments = v.comment_count ?? 0;
      const shares = v.share_count ?? 0;
      const interactions = likes + comments + shares;
      const caption = (v.video_description || v.title || '').trim();
      return {
        platformPostId: v.id,
        mediaType: 'VIDEO',
        caption,
        permalink: v.share_url || `https://www.tiktok.com/@${account.handle}/video/${v.id}`,
        thumbnailUrl: v.cover_image_url ?? null,
        publishedAt: v.create_time ? new Date(v.create_time * 1000) : new Date(),
        viewsCount: views,
        reachCount: views,
        likesCount: likes,
        commentsCount: comments,
        sharesCount: shares,
        savesCount: 0,
        engagementRate: views > 0 ? Number(((interactions / views) * 100).toFixed(3)) : 0,
        hourlyVelocity: null,
      } satisfies NormalizedPost;
    });
  }

  async refreshAccessToken(account: AccountRef): Promise<{
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
  }> {
    const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET } = env();
    if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
      throw new AdapterError('TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET are not configured', 'auth');
    }
    if (!account.refreshToken) throw new AdapterError('No TikTok refresh token available', 'auth');

    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
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
      throw new AdapterError(body.error_description ?? 'TikTok token refresh failed', 'auth');
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? account.refreshToken,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : null,
    };
  }
}
