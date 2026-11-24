import { asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, type AuthedUser } from './api';

export type EffectiveRole = 'super_admin' | 'brand_manager' | 'analyst' | 'viewer';

export interface AccessibleWorkspace {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  shaderConfig: schema.ShaderConfig;
  role: EffectiveRole;
}

export async function accessibleWorkspaces(user: Pick<AuthedUser, 'id' | 'isSuperAdmin'>): Promise<AccessibleWorkspace[]> {
  if (user.isSuperAdmin) {
    const rows = await db.select().from(schema.workspaces).orderBy(asc(schema.workspaces.name));
    return rows.map((w) => ({ ...w, role: 'super_admin' as const }));
  }
  const rows = await db
    .select({ workspace: schema.workspaces, role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(eq(schema.workspaceMembers.userId, user.id))
    .orderBy(asc(schema.workspaces.name));
  return rows.map((r) => ({ ...r.workspace, role: r.role }));
}

/** Resolves `all` or a slug to the workspaces the user may read; 403 if the slug is not theirs. */
export async function resolveScope(user: AuthedUser, workspace: string): Promise<AccessibleWorkspace[]> {
  const accessible = await accessibleWorkspaces(user);
  if (workspace === 'all') {
    if (accessible.length === 0) throw new ApiError(403, 'No workspace assigned to this account');
    return accessible;
  }
  const match = accessible.find((w) => w.slug === workspace);
  if (!match) throw new ApiError(403, 'You do not have access to this workspace');
  return [match];
}

export function canExportOrSync(role: EffectiveRole): boolean {
  return role === 'super_admin' || role === 'brand_manager';
}

export function requireSuperAdmin(user: AuthedUser): void {
  if (!user.isSuperAdmin) throw new ApiError(403, 'Super Admin only');
}

export async function accountWorkspaceId(accountId: string): Promise<string | null> {
  const [row] = await db
    .select({ workspaceId: schema.socialAccounts.workspaceId })
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.id, accountId))
    .limit(1);
  return row?.workspaceId ?? null;
}

export async function accountIdsForWorkspaces(workspaceIds: string[]): Promise<string[]> {
  if (workspaceIds.length === 0) return [];
  const rows = await db
    .select({ id: schema.socialAccounts.id })
    .from(schema.socialAccounts)
    .where(inArray(schema.socialAccounts.workspaceId, workspaceIds));
  return rows.map((r) => r.id);
}
