import { json, route } from '@/lib/api';
import { resolveScope } from '@/lib/access';
import { getOverview } from '@/lib/analytics';
import { parseFilters } from '@/lib/query';
import { getOrSetCache } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, user) => {
  const filters = parseFilters(req);
  const scope = await resolveScope(user, filters.workspace);
  const workspaceIds = scope.map((w) => w.id).sort();
  const key = `overview:${workspaceIds.join(',')}:${filters.platform}:${filters.range.from}:${filters.range.to}`;
  const data = await getOrSetCache(key, 300, () =>
    getOverview({ workspaceIds, platform: filters.platform }, filters.range),
  );
  return json(data);
});
