import { route } from '@/lib/api';
import { canExportOrSync, resolveScope } from '@/lib/access';
import { ApiError } from '@/lib/api';
import { getOverview, listAllPostsForExport } from '@/lib/analytics';
import { parseFilters, parsePostsQuery } from '@/lib/query';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

function csvCell(value: string | number | boolean): string {
  let text = String(value);
  // Neutralise spreadsheet formula injection from captions.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(header: string[], rows: Array<Array<string | number | boolean>>): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export const GET = route(async (req, user) => {
  const filters = parseFilters(req);
  const type = z.enum(['overview', 'posts']).default('posts').parse(req.nextUrl.searchParams.get('type') ?? undefined);
  const scope = (await resolveScope(user, filters.workspace)).filter((w) => canExportOrSync(w.role));
  if (scope.length === 0) throw new ApiError(403, 'Your role cannot export data');
  const workspaceIds = scope.map((w) => w.id);
  const filename = `ethermind-${type}-${filters.workspace}-${filters.range.from}_${filters.range.to}.csv`;

  let csv: string;
  if (type === 'overview') {
    const overview = await getOverview({ workspaceIds, platform: filters.platform }, filters.range);
    const platforms = ['instagram', 'facebook', 'tiktok', 'x', 'threads'] as const;
    csv = toCsv(
      ['date', 'total_reach', ...platforms.map((p) => `${p}_reach`), ...overview.brands.map((b) => `${b.slug}_reach`)],
      overview.series.map((s) => [
        s.date,
        s.total,
        ...platforms.map((p) => s.platforms[p] ?? 0),
        ...overview.brands.map((b) => s.brands[b.slug] ?? 0),
      ]),
    );
  } else {
    const query = parsePostsQuery(req);
    const posts = await listAllPostsForExport({
      scope: { workspaceIds, platform: filters.platform },
      range: filters.range,
      q: query.q,
      format: query.format,
      sort: query.sort,
    });
    csv = toCsv(
      ['published_at', 'workspace', 'platform', 'account', 'type', 'caption', 'views', 'reach', 'likes', 'comments', 'shares', 'saves', 'engagement_rate_pct', 'viral_spike', 'data_source', 'url'],
      posts.map((p) => [
        p.publishedAt,
        p.workspaceSlug,
        p.platform,
        p.accountHandle,
        p.mediaType,
        p.caption,
        p.viewsCount,
        p.reachCount,
        p.likesCount,
        p.commentsCount,
        p.sharesCount,
        p.savesCount,
        p.engagementRate,
        p.isViralSpike,
        p.mode,
        p.permalink,
      ]),
    );
  }

  return new Response(`\uFEFF${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
