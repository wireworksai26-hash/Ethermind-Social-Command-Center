import { json, route } from '@/lib/api';
import { resolveScope } from '@/lib/access';
import { listPosts } from '@/lib/analytics';
import { parseFilters, parsePostsQuery } from '@/lib/query';
import { getOrSetCache } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, user) => {
  const filters = parseFilters(req);
  const query = parsePostsQuery(req);
  const scope = await resolveScope(user, filters.workspace);
  const workspaceIds = scope.map((w) => w.id).sort();
  const key = `posts:${workspaceIds.join(',')}:${filters.platform}:${filters.range.from}:${filters.range.to}:${JSON.stringify(query)}`;
  const data = await getOrSetCache(key, 120, () =>
    listPosts({ scope: { workspaceIds, platform: filters.platform }, range: filters.range, ...query }),
  );
  return json(data);
});
