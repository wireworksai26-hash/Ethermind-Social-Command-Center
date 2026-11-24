import { env } from '@/lib/env';
import { addDays, eachDate, toDateStr } from '@/lib/dates';
import {
  AdapterError,
  type AccountRef,
  type ISocialPlatformAdapter,
  type MediaType,
  type NormalizedAccountMetrics,
  type NormalizedPost,
} from './types';

interface GraphError {
  message: string;
  code?: number;
}

interface InsightValue {
  value: number | Record<string, number>;
  end_time?: string;
}

interface InsightEntry {
  name: string;
  values?: InsightValue[];
  total_value?: { value: number };
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

async function graph<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${env().META_GRAPH_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { cache: 'no-store' });
  const body = (await res.json()) as T & { error?: GraphError };
  if (!res.ok || body.error) {
    const err = body.error ?? { message: `HTTP ${res.status}` };
    if (err.code === 190) throw new AdapterError(err.message, 'auth');
    if (err.code !== undefined && RATE_LIMIT_CODES.has(err.code)) throw new AdapterError(err.message, 'rate_limited');
    throw new AdapterError(err.message);
  }
  return body;
}

async function insights(
  path: string,
  token: string,
  params: Record<string, string>,
): Promise<InsightEntry[]> {
  const res = await graph<{ data: InsightEntry[] }>(`${path}/insights`, token, params);
  return res.data;
}

/** Runs `fn` over `items` with bounded concurrency. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

function unix(dateStr: string): string {
  return String(Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / 1000));
}

function numberValue(v: InsightValue['value'] | undefined): number {
  return typeof v === 'number' ? v : 0;
}

/** Attempts a metric; absence of a metric on a given account type yields an empty series, not a failed sync. */
async function tryDaily(
  path: string,
  token: string,
  metric: string,
  since: string,
  until: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const entries = await insights(path, token, {
      metric,
      period: 'day',
      since: unix(since),
      until: unix(addDays(until, 1)),
    });
    for (const v of entries[0]?.values ?? []) {
      if (v.end_time) out.set(v.end_time.slice(0, 10), numberValue(v.value));
    }
  } catch (error) {
    if (error instanceof AdapterError && error.kind !== 'unknown') throw error;
  }
  return out;
}

/** Meta insights windows are capped at 30 days, so longer ranges are fetched in chunks. */
async function dailyChunked(
  path: string,
  token: string,
  metric: string,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const merged = new Map<string, number>();
  for (let start = from; start <= to; start = addDays(start, 28)) {
    const end = addDays(start, 27) > to ? to : addDays(start, 27);
    const chunk = await tryDaily(path, token, metric, start, end);
    for (const [k, v] of chunk) merged.set(k, v);
  }
  return merged;
}

function requireToken(account: AccountRef): string {
  if (!account.accessToken) throw new AdapterError('No access token stored for this account', 'auth');
  return account.accessToken;
}

const IG_MEDIA_TYPE: Record<string, MediaType> = {
  VIDEO: 'REEL',
  REELS: 'REEL',
  CAROUSEL_ALBUM: 'CAROUSEL',
  IMAGE: 'IMAGE',
};

/**
 * Live adapter for Instagram Business (via the linked Page token) and Facebook Pages.
 * Metric names follow Graph API v22+ (`views` replaced `impressions`); each metric is requested
 * independently so one unsupported metric degrades to zeros instead of failing the whole sync.
 */
export class MetaGraphLiveAdapter implements ISocialPlatformAdapter {
  readonly mode = 'live' as const;

  async syncAccountDailyMetrics(account: AccountRef, daysBack: number): Promise<NormalizedAccountMetrics[]> {
    return account.platform === 'instagram'
      ? this.instagramMetrics(account, daysBack)
      : this.facebookMetrics(account, daysBack);
  }

  async syncRecentPosts(account: AccountRef, limit: number): Promise<NormalizedPost[]> {
    return account.platform === 'instagram' ? this.instagramPosts(account, limit) : this.facebookPosts(account, limit);
  }

  async refreshAccessToken(account: AccountRef): Promise<{
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
  }> {
    const { META_APP_ID, META_APP_SECRET } = env();
    if (!META_APP_ID || !META_APP_SECRET) throw new AdapterError('META_APP_ID / META_APP_SECRET are not configured', 'auth');
    const userToken = account.refreshToken ?? account.accessToken;
    if (!userToken) throw new AdapterError('No token available to refresh', 'auth');

    const exchanged = await graph<{ access_token: string; expires_in?: number }>('oauth/access_token', userToken, {
      grant_type: 'fb_exchange_token',
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      fb_exchange_token: userToken,
    });
    const pages = await graph<{ data: Array<{ id: string; access_token: string; instagram_business_account?: { id: string } }> }>(
      'me/accounts',
      exchanged.access_token,
      { fields: 'id,access_token,instagram_business_account{id}' },
    );
    const match = pages.data.find(
      (p) => p.id === account.platformAccountId || p.instagram_business_account?.id === account.platformAccountId,
    );
    if (!match) throw new AdapterError('Account is no longer accessible with the refreshed user token', 'auth');
    return {
      accessToken: match.access_token,
      refreshToken: exchanged.access_token,
      expiresAt: exchanged.expires_in ? new Date(Date.now() + exchanged.expires_in * 1000) : null,
    };
  }

  /* ---------------------------------- Instagram ---------------------------------- */

  private async instagramMetrics(account: AccountRef, daysBack: number): Promise<NormalizedAccountMetrics[]> {
    const token = requireToken(account);
    const id = account.platformAccountId;
    const days = Math.min(daysBack, 30);
    const to = toDateStr(new Date());
    const from = addDays(to, -(days - 1));

    const profile = await graph<{ followers_count: number }>(id, token, { fields: 'followers_count' });
    const [reach, followerDelta, views] = await Promise.all([
      dailyChunked(id, token, 'reach', from, to),
      dailyChunked(id, token, 'follower_count', from, to),
      dailyChunked(id, token, 'views', from, to),
    ]);

    const dates = eachDate(from, to);
    const perDay = await mapLimit(dates, 5, async (date) => {
      try {
        const entries = await insights(id, token, {
          metric: 'profile_views,total_interactions',
          metric_type: 'total_value',
          period: 'day',
          since: unix(date),
          until: unix(addDays(date, 1)),
        });
        const get = (name: string) => entries.find((e) => e.name === name)?.total_value?.value ?? 0;
        return { profileViews: get('profile_views'), interactions: get('total_interactions') };
      } catch (error) {
        if (error instanceof AdapterError && error.kind !== 'unknown') throw error;
        return { profileViews: 0, interactions: 0 };
      }
    });

    let running = profile.followers_count;
    const followersByDate = new Map<string, number>();
    for (const date of [...dates].reverse()) {
      followersByDate.set(date, running);
      running -= followerDelta.get(date) ?? 0;
    }

    return dates.map((date, i) => {
      const dayReach = reach.get(date) ?? 0;
      const detail = perDay[i]!;
      return {
        date,
        followersCount: followersByDate.get(date) ?? profile.followers_count,
        followersDelta: followerDelta.get(date) ?? 0,
        totalReach: dayReach,
        totalImpressions: views.get(date) ?? dayReach,
        profileViews: detail.profileViews,
        engagementRate: dayReach > 0 ? Number(((detail.interactions / dayReach) * 100).toFixed(3)) : 0,
      };
    });
  }

  private async instagramPosts(account: AccountRef, limit: number): Promise<NormalizedPost[]> {
    const token = requireToken(account);
    const list = await graph<{
      data: Array<{
        id: string;
        caption?: string;
        media_type: string;
        media_product_type?: string;
        permalink: string;
        thumbnail_url?: string;
        media_url?: string;
        timestamp: string;
        like_count?: number;
        comments_count?: number;
      }>;
    }>(`${account.platformAccountId}/media`, token, {
      fields:
        'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count',
      limit: String(Math.min(limit, 50)),
    });

    return mapLimit(list.data, 5, async (m) => {
      let reach = 0;
      let views = 0;
      let saved = 0;
      let shares = 0;
      try {
        const entries = await insights(m.id, token, { metric: 'reach,views,saved,shares' });
        const get = (name: string) => entries.find((e) => e.name === name)?.values?.[0]?.value;
        reach = numberValue(get('reach'));
        views = numberValue(get('views'));
        saved = numberValue(get('saved'));
        shares = numberValue(get('shares'));
      } catch (error) {
        if (error instanceof AdapterError && error.kind !== 'unknown') throw error;
      }
      const likes = m.like_count ?? 0;
      const comments = m.comments_count ?? 0;
      const denominator = reach || views;
      const mediaType =
        m.media_product_type === 'REELS' ? 'REEL' : (IG_MEDIA_TYPE[m.media_type] ?? 'IMAGE');
      return {
        platformPostId: m.id,
        mediaType,
        caption: m.caption ?? '',
        permalink: m.permalink,
        thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
        publishedAt: new Date(m.timestamp),
        viewsCount: views || reach,
        reachCount: reach,
        likesCount: likes,
        commentsCount: comments,
        sharesCount: shares,
        savesCount: saved,
        engagementRate: denominator > 0 ? Number((((likes + comments + shares + saved) / denominator) * 100).toFixed(3)) : 0,
        hourlyVelocity: null,
      } satisfies NormalizedPost;
    });
  }

  /* ----------------------------------- Facebook ---------------------------------- */

  private async facebookMetrics(account: AccountRef, daysBack: number): Promise<NormalizedAccountMetrics[]> {
    const token = requireToken(account);
    const id = account.platformAccountId;
    const days = Math.min(daysBack, 30);
    const to = toDateStr(new Date());
    const from = addDays(to, -(days - 1));

    const page = await graph<{ followers_count?: number; fan_count?: number }>(id, token, {
      fields: 'followers_count,fan_count',
    });
    const currentFollowers = page.followers_count ?? page.fan_count ?? 0;

    const [reach, impressions, follows, unfollows, engagements, views] = await Promise.all([
      dailyChunked(id, token, 'page_total_media_view_unique', from, to),
      dailyChunked(id, token, 'page_media_view', from, to),
      dailyChunked(id, token, 'page_daily_follows_unique', from, to),
      dailyChunked(id, token, 'page_daily_unfollows_unique', from, to),
      dailyChunked(id, token, 'page_post_engagements', from, to),
      dailyChunked(id, token, 'page_views_total', from, to),
    ]);

    const dates = eachDate(from, to);
    let running = currentFollowers;
    const followersByDate = new Map<string, number>();
    const deltaByDate = new Map<string, number>();
    for (const date of [...dates].reverse()) {
      const delta = (follows.get(date) ?? 0) - (unfollows.get(date) ?? 0);
      followersByDate.set(date, running);
      deltaByDate.set(date, delta);
      running -= delta;
    }

    return dates.map((date) => {
      const dayReach = reach.get(date) ?? 0;
      return {
        date,
        followersCount: followersByDate.get(date) ?? currentFollowers,
        followersDelta: deltaByDate.get(date) ?? 0,
        totalReach: dayReach,
        totalImpressions: impressions.get(date) ?? dayReach,
        profileViews: views.get(date) ?? 0,
        engagementRate: dayReach > 0 ? Number((((engagements.get(date) ?? 0) / dayReach) * 100).toFixed(3)) : 0,
      };
    });
  }

  private async facebookPosts(account: AccountRef, limit: number): Promise<NormalizedPost[]> {
    const token = requireToken(account);
    const list = await graph<{
      data: Array<{
        id: string;
        message?: string;
        permalink_url: string;
        full_picture?: string;
        created_time: string;
        status_type?: string;
        shares?: { count: number };
        reactions?: { summary?: { total_count: number } };
        comments?: { summary?: { total_count: number } };
      }>;
    }>(`${account.platformAccountId}/posts`, token, {
      fields:
        'id,message,permalink_url,full_picture,created_time,status_type,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)',
      limit: String(Math.min(limit, 50)),
    });

    return mapLimit(list.data, 5, async (p) => {
      let views = 0;
      let reach = 0;
      try {
        const entries = await insights(p.id, token, { metric: 'post_media_view,post_total_media_view_unique' });
        const get = (name: string) => entries.find((e) => e.name === name)?.values?.[0]?.value;
        views = numberValue(get('post_media_view'));
        reach = numberValue(get('post_total_media_view_unique'));
      } catch (error) {
        if (error instanceof AdapterError && error.kind !== 'unknown') throw error;
      }
      const likes = p.reactions?.summary?.total_count ?? 0;
      const comments = p.comments?.summary?.total_count ?? 0;
      const shares = p.shares?.count ?? 0;
      const denominator = reach || views;
      const mediaType: MediaType = p.status_type?.includes('video') ? 'VIDEO' : 'IMAGE';
      return {
        platformPostId: p.id,
        mediaType,
        caption: p.message ?? '',
        permalink: p.permalink_url,
        thumbnailUrl: p.full_picture ?? null,
        publishedAt: new Date(p.created_time),
        viewsCount: views || reach,
        reachCount: reach,
        likesCount: likes,
        commentsCount: comments,
        sharesCount: shares,
        savesCount: 0,
        engagementRate: denominator > 0 ? Number((((likes + comments + shares) / denominator) * 100).toFixed(3)) : 0,
        hourlyVelocity: null,
      } satisfies NormalizedPost;
    });
  }
}
