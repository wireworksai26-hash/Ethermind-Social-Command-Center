import { and, desc, asc, eq, gte, ilike, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/db';
import { eachDate, previousRange, type DateRange } from './dates';
import type { KpiValue, OverviewResponse, Platform, PlatformFilter, PostDetailResponse, PostRow, PostsResponse, SeriesPoint } from './types';

export interface ScopeFilter {
  workspaceIds: string[];
  platform: PlatformFilter;
}

export type PostFormat = 'all' | 'video' | 'carousel' | 'image' | 'text';
export type PostSort = 'engagement_rate' | 'views_count' | 'published_at';

const FORMAT_TYPES: Record<Exclude<PostFormat, 'all'>, string[]> = {
  video: ['REEL', 'VIDEO'],
  carousel: ['CAROUSEL'],
  image: ['IMAGE'],
  text: ['TEXT_THREAD', 'TWEET'],
};

function accountWhere(scope: ScopeFilter): SQL {
  const conditions: SQL[] = [inArray(schema.socialAccounts.workspaceId, scope.workspaceIds)];
  if (scope.platform !== 'all') conditions.push(eq(schema.socialAccounts.platform, scope.platform));
  return and(...conditions) as SQL;
}

function kpi(value: number, previous: number): KpiValue {
  return {
    value,
    previous,
    deltaPct: previous === 0 ? null : Number((((value - previous) / previous) * 100).toFixed(1)),
  };
}

interface PeriodTotals {
  reach: number;
  weightedEr: number;
  followerGrowth: number;
  contentCount: number;
}

async function periodTotals(scope: ScopeFilter, range: DateRange): Promise<PeriodTotals> {
  const [metrics] = await db
    .select({
      reach: sql<number>`coalesce(sum(${schema.accountDailyMetrics.totalReach}), 0)`.mapWith(Number),
      erWeight: sql<number>`coalesce(sum(${schema.accountDailyMetrics.engagementRate} * ${schema.accountDailyMetrics.totalReach}), 0)`.mapWith(
        Number,
      ),
      growth: sql<number>`coalesce(sum(${schema.accountDailyMetrics.followersDelta}), 0)`.mapWith(Number),
    })
    .from(schema.accountDailyMetrics)
    .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.accountDailyMetrics.accountId))
    .where(
      and(
        accountWhere(scope),
        gte(schema.accountDailyMetrics.metricDate, range.from),
        lte(schema.accountDailyMetrics.metricDate, range.to),
      ),
    );

  const [posts] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.socialPosts)
    .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.socialPosts.accountId))
    .where(
      and(
        accountWhere(scope),
        gte(schema.socialPosts.publishedAt, new Date(`${range.from}T00:00:00Z`)),
        lte(schema.socialPosts.publishedAt, new Date(`${range.to}T23:59:59.999Z`)),
      ),
    );

  const reach = metrics?.reach ?? 0;
  return {
    reach,
    weightedEr: reach > 0 ? (metrics?.erWeight ?? 0) / reach : 0,
    followerGrowth: metrics?.growth ?? 0,
    contentCount: posts?.count ?? 0,
  };
}

export async function getOverview(scope: ScopeFilter, range: DateRange): Promise<OverviewResponse> {
  const [current, previous, rows, workspaceRows] = await Promise.all([
    periodTotals(scope, range),
    periodTotals(scope, previousRange(range)),
    db
      .select({
        date: schema.accountDailyMetrics.metricDate,
        platform: schema.socialAccounts.platform,
        slug: schema.workspaces.slug,
        reach: sql<number>`sum(${schema.accountDailyMetrics.totalReach})`.mapWith(Number),
      })
      .from(schema.accountDailyMetrics)
      .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.accountDailyMetrics.accountId))
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.socialAccounts.workspaceId))
      .where(
        and(
          accountWhere(scope),
          gte(schema.accountDailyMetrics.metricDate, range.from),
          lte(schema.accountDailyMetrics.metricDate, range.to),
        ),
      )
      .groupBy(schema.accountDailyMetrics.metricDate, schema.socialAccounts.platform, schema.workspaces.slug),
    db
      .select({ slug: schema.workspaces.slug, name: schema.workspaces.name })
      .from(schema.workspaces)
      .where(inArray(schema.workspaces.id, scope.workspaceIds))
      .orderBy(asc(schema.workspaces.name)),
  ]);

  const byDate = new Map<string, SeriesPoint>();
  for (const date of eachDate(range.from, range.to)) {
    byDate.set(date, { date, total: 0, platforms: {}, brands: {} });
  }
  for (const r of rows) {
    const point = byDate.get(r.date);
    if (!point) continue;
    point.total += r.reach;
    point.platforms[r.platform as Platform] = (point.platforms[r.platform as Platform] ?? 0) + r.reach;
    point.brands[r.slug] = (point.brands[r.slug] ?? 0) + r.reach;
  }

  return {
    range,
    kpis: {
      reach: kpi(current.reach, previous.reach),
      engagementRate: kpi(Number(current.weightedEr.toFixed(2)), Number(previous.weightedEr.toFixed(2))),
      followerGrowth: kpi(current.followerGrowth, previous.followerGrowth),
      contentCount: kpi(current.contentCount, previous.contentCount),
    },
    series: [...byDate.values()],
    brands: workspaceRows,
    hasData: rows.length > 0,
  };
}

export interface PostsQuery {
  scope: ScopeFilter;
  range: DateRange;
  q?: string;
  format: PostFormat;
  sort: PostSort;
  page: number;
  pageSize: number;
}

const postSelection = {
  id: schema.socialPosts.id,
  platform: schema.socialPosts.platform,
  mediaType: schema.socialPosts.mediaType,
  caption: schema.socialPosts.caption,
  permalink: schema.socialPosts.permalink,
  thumbnailUrl: schema.socialPosts.thumbnailUrl,
  publishedAt: schema.socialPosts.publishedAt,
  viewsCount: schema.socialPosts.viewsCount,
  reachCount: schema.socialPosts.reachCount,
  likesCount: schema.socialPosts.likesCount,
  commentsCount: schema.socialPosts.commentsCount,
  sharesCount: schema.socialPosts.sharesCount,
  savesCount: schema.socialPosts.savesCount,
  engagementRate: schema.socialPosts.engagementRate,
  isViralSpike: schema.socialPosts.isViralSpike,
  accountHandle: schema.socialAccounts.handle,
  workspaceSlug: schema.workspaces.slug,
  workspaceName: schema.workspaces.name,
  mode: schema.socialAccounts.mode,
};

type PostRecord = Omit<PostRow, 'caption' | 'publishedAt'> & { caption: string | null; publishedAt: Date };

function toPostRow(r: PostRecord): PostRow {
  return {
    ...r,
    caption: r.caption ?? '',
    publishedAt: r.publishedAt.toISOString(),
  };
}

export async function listPosts(query: PostsQuery): Promise<PostsResponse> {
  const conditions: SQL[] = [
    accountWhere(query.scope),
    gte(schema.socialPosts.publishedAt, new Date(`${query.range.from}T00:00:00Z`)),
    lte(schema.socialPosts.publishedAt, new Date(`${query.range.to}T23:59:59.999Z`)),
  ];
  if (query.q) conditions.push(ilike(schema.socialPosts.caption, `%${query.q.replace(/[%_\\]/g, '\\$&')}%`));
  if (query.format !== 'all') conditions.push(inArray(schema.socialPosts.mediaType, FORMAT_TYPES[query.format]));
  const where = and(...conditions);

  const sortColumn =
    query.sort === 'views_count'
      ? schema.socialPosts.viewsCount
      : query.sort === 'published_at'
        ? schema.socialPosts.publishedAt
        : schema.socialPosts.engagementRate;

  const [items, [count]] = await Promise.all([
    db
      .select(postSelection)
      .from(schema.socialPosts)
      .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.socialPosts.accountId))
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.socialAccounts.workspaceId))
      .where(where)
      .orderBy(desc(sortColumn), desc(schema.socialPosts.publishedAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.socialPosts)
      .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.socialPosts.accountId))
      .where(where),
  ]);

  return { items: items.map(toPostRow), page: query.page, pageSize: query.pageSize, total: count?.total ?? 0 };
}

export async function listAllPostsForExport(query: Omit<PostsQuery, 'page' | 'pageSize'>): Promise<PostRow[]> {
  const first = await listPosts({ ...query, page: 1, pageSize: 5000 });
  return first.items;
}

/** Returns the post only when it belongs to one of the allowed workspaces. */
export async function getPostDetail(postId: string, workspaceIds: string[]): Promise<PostDetailResponse | null> {
  const [row] = await db
    .select({
      ...postSelection,
      hourlyVelocity: schema.socialPosts.hourlyVelocity,
      accountId: schema.socialPosts.accountId,
      accountDisplayName: schema.socialAccounts.displayName,
    })
    .from(schema.socialPosts)
    .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.socialPosts.accountId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.socialAccounts.workspaceId))
    .where(and(eq(schema.socialPosts.id, postId), inArray(schema.socialAccounts.workspaceId, workspaceIds)))
    .limit(1);
  if (!row) return null;

  const [avg] = await db
    .select({
      er: sql<number>`coalesce(avg(${schema.socialPosts.engagementRate}), 0)`.mapWith(Number),
      views: sql<number>`coalesce(avg(${schema.socialPosts.viewsCount}), 0)`.mapWith(Number),
    })
    .from(schema.socialPosts)
    .where(eq(schema.socialPosts.accountId, row.accountId));

  const { accountId: _accountId, hourlyVelocity, accountDisplayName, ...rest } = row;
  return {
    ...toPostRow(rest),
    hourlyVelocity: hourlyVelocity ?? null,
    accountDisplayName,
    accountAverageEngagementRate: Number((avg?.er ?? 0).toFixed(2)),
    accountAverageViews: Math.round(avg?.views ?? 0),
  };
}
