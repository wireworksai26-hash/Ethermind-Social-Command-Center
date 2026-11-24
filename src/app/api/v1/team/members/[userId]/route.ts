import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { MEMBER_ROLES } from '@/db/schema';
import { ApiError, json, route } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/access';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ userId: string }> };

/** Removes a member from one workspace (`?workspaceId=`) or from every workspace when omitted. */
export const DELETE = route<Ctx>(async (req, user, ctx) => {
  requireSuperAdmin(user);
  const { userId } = await ctx.params;
  if (userId === user.id) throw new ApiError(400, 'You cannot remove yourself');
  const workspaceId = z.string().uuid().optional().parse(req.nextUrl.searchParams.get('workspaceId') ?? undefined);
  await db
    .delete(schema.workspaceMembers)
    .where(
      workspaceId
        ? and(eq(schema.workspaceMembers.userId, userId), eq(schema.workspaceMembers.workspaceId, workspaceId))
        : eq(schema.workspaceMembers.userId, userId),
    );
  return json({ ok: true });
});

const patchSchema = z.object({
  workspaceId: z.string().uuid(),
  role: z.enum(MEMBER_ROLES),
});

/** Changes a member's role in one workspace. */
export const PATCH = route<Ctx>(async (req, user, ctx) => {
  requireSuperAdmin(user);
  const { userId } = await ctx.params;
  const input = patchSchema.parse(await req.json().catch(() => null));
  const updated = await db
    .update(schema.workspaceMembers)
    .set({ role: input.role })
    .where(and(eq(schema.workspaceMembers.userId, userId), eq(schema.workspaceMembers.workspaceId, input.workspaceId)))
    .returning({ userId: schema.workspaceMembers.userId });
  if (updated.length === 0) throw new ApiError(404, 'Membership not found');
  return json({ ok: true });
});
