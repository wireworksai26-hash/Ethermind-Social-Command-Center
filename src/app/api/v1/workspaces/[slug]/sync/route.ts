import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, json, route } from '@/lib/api';
import { canExportOrSync, resolveScope } from '@/lib/access';
import { getSyncQueue } from '@/lib/queue';
import { syncAccount } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ slug: string }> };

const bodySchema = z.object({ accountId: z.string().uuid().optional() }).default({});

export const POST = route<Ctx>(async (req, user, ctx) => {
  const { slug } = await ctx.params;
  const scope = await resolveScope(user, slug);
  const allowed = scope.filter((w) => canExportOrSync(w.role));
  if (allowed.length === 0) throw new ApiError(403, 'Your role cannot trigger a sync');

  const raw: unknown = await req.json().catch(() => ({}));
  const { accountId } = bodySchema.parse(raw);

  const accounts = await db
    .select({ id: schema.socialAccounts.id })
    .from(schema.socialAccounts)
    .where(
      accountId
        ? eq(schema.socialAccounts.id, accountId)
        : inArray(
            schema.socialAccounts.workspaceId,
            allowed.map((w) => w.id),
          ),
    );

  if (accountId) {
    const [owner] = await db
      .select({ workspaceId: schema.socialAccounts.workspaceId })
      .from(schema.socialAccounts)
      .where(eq(schema.socialAccounts.id, accountId))
      .limit(1);
    if (!owner || !allowed.some((w) => w.id === owner.workspaceId)) throw new ApiError(404, 'Account not found');
  }

  const queue = getSyncQueue();
  if (queue) {
    await Promise.all(
      accounts.map((a) =>
        queue.add('sync-account', { accountId: a.id }, { jobId: `manual-${a.id}-${Date.now()}` }),
      ),
    );
    return json({ queued: accounts.length, mode: 'queue' }, { status: 202 });
  }

  // No Redis (local development): run inline.
  const results = [];
  for (const a of accounts) results.push(await syncAccount(a.id));
  return json({ queued: accounts.length, mode: 'inline', results }, { status: 200 });
});
