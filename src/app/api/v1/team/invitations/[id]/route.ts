import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, json, route } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/access';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>(async (_req, user, ctx) => {
  requireSuperAdmin(user);
  const id = z.string().uuid().safeParse((await ctx.params).id);
  if (!id.success) throw new ApiError(400, 'Invalid invitation id');
  await db.delete(schema.invitations).where(eq(schema.invitations.id, id.data));
  return json({ ok: true });
});
