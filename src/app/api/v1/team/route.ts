import { z } from 'zod';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { MEMBER_ROLES } from '@/db/schema';
import { ApiError, json, route } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/access';
import type { TeamResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

const INVITE_TTL_MS = 14 * 86_400_000;

export const GET = route(async (_req, user) => {
  requireSuperAdmin(user);
  const [workspaces, users, memberships, invitations] = await Promise.all([
    db
      .select({ id: schema.workspaces.id, name: schema.workspaces.name, slug: schema.workspaces.slug })
      .from(schema.workspaces)
      .orderBy(asc(schema.workspaces.name)),
    db.select().from(schema.user).orderBy(asc(schema.user.createdAt)),
    db
      .select({
        userId: schema.workspaceMembers.userId,
        workspaceId: schema.workspaceMembers.workspaceId,
        role: schema.workspaceMembers.role,
        slug: schema.workspaces.slug,
      })
      .from(schema.workspaceMembers)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId)),
    db
      .select()
      .from(schema.invitations)
      .where(sql`${schema.invitations.acceptedAt} IS NULL`)
      .orderBy(asc(schema.invitations.createdAt)),
  ]);

  const body: TeamResponse = {
    workspaces,
    members: users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      isSuperAdmin: u.isSuperAdmin,
      memberships: memberships
        .filter((m) => m.userId === u.id)
        .map((m) => ({ workspaceId: m.workspaceId, workspaceSlug: m.slug, role: m.role })),
    })),
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      workspaceIds: i.workspaceIds,
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
      expired: i.expiresAt.getTime() < Date.now(),
    })),
  };
  return json(body);
});

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  role: z.enum(MEMBER_ROLES),
  workspaceIds: z.array(z.string().uuid()).min(1).max(50),
});

export const POST = route(async (req, user) => {
  requireSuperAdmin(user);
  const input = inviteSchema.parse(await req.json().catch(() => null));

  const found = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(inArray(schema.workspaces.id, input.workspaceIds));
  if (found.length !== new Set(input.workspaceIds).size) throw new ApiError(400, 'Unknown workspace in selection');

  const [existingUser] = await db.select().from(schema.user).where(eq(schema.user.email, input.email)).limit(1);
  if (existingUser) {
    if (existingUser.isSuperAdmin) throw new ApiError(409, 'That account is already a Super Admin');
    // Already registered: grant access immediately, no invitation needed.
    await db
      .insert(schema.workspaceMembers)
      .values(input.workspaceIds.map((workspaceId) => ({ workspaceId, userId: existingUser.id, role: input.role })))
      .onConflictDoUpdate({
        target: [schema.workspaceMembers.workspaceId, schema.workspaceMembers.userId],
        set: { role: input.role },
      });
    return json({ result: 'access_granted', email: input.email }, { status: 200 });
  }

  await db.delete(schema.invitations).where(eq(schema.invitations.email, input.email));
  await db.insert(schema.invitations).values({
    email: input.email,
    role: input.role,
    workspaceIds: [...new Set(input.workspaceIds)],
    invitedBy: user.id,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  return json({ result: 'invited', email: input.email }, { status: 201 });
});
