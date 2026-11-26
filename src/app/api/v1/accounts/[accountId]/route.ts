import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, json, route } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/access';
import { invalidateCache } from '@/lib/redis';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ accountId: string }> };

export const DELETE = route<Ctx>(async (_req, user, ctx) => {
  requireSuperAdmin(user);
  const accountId = z.string().uuid().parse((await ctx.params).accountId);
  const deleted = await db
    .delete(schema.socialAccounts)
    .where(eq(schema.socialAccounts.id, accountId))
    .returning({ id: schema.socialAccounts.id });
  if (deleted.length === 0) throw new ApiError(404, 'Akun tidak ditemukan');
  await invalidateCache();
  return json({ ok: true });
});
