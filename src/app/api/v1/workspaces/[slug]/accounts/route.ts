import { asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { LIVE_CAPABLE } from '@/adapters/registry';
import { json, route } from '@/lib/api';
import { canExportOrSync, resolveScope } from '@/lib/access';
import type { AccountRow, AccountsResponse, TokenHealth } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

const EXPIRY_WARNING_MS = 7 * 86_400_000;

function tokenHealth(
  mode: 'live' | 'mock',
  status: AccountRow['status'],
  expiresAt: Date | null,
  hasToken: boolean,
): TokenHealth {
  if (mode === 'mock') return 'not_applicable';
  if (status === 'disconnected' || !hasToken) return 'needs_reauth';
  if (expiresAt) {
    const left = expiresAt.getTime() - Date.now();
    if (left <= 0) return 'needs_reauth';
    if (left < EXPIRY_WARNING_MS) return 'expiring_soon';
  }
  return 'healthy';
}

export const GET = route<Ctx>(async (_req, user, ctx) => {
  const { slug } = await ctx.params;
  const scope = await resolveScope(user, slug);
  const rows = await db
    .select({
      account: schema.socialAccounts,
      workspaceSlug: schema.workspaces.slug,
      workspaceName: schema.workspaces.name,
      tokenExpiresAt: schema.oauthTokens.expiresAt,
      tokenAccountId: schema.oauthTokens.accountId,
    })
    .from(schema.socialAccounts)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.socialAccounts.workspaceId))
    .leftJoin(schema.oauthTokens, eq(schema.oauthTokens.accountId, schema.socialAccounts.id))
    .where(
      inArray(
        schema.socialAccounts.workspaceId,
        scope.map((w) => w.id),
      ),
    )
    .orderBy(asc(schema.workspaces.name), asc(schema.socialAccounts.platform));

  const accounts: AccountRow[] = rows.map((r) => ({
    id: r.account.id,
    workspaceSlug: r.workspaceSlug,
    workspaceName: r.workspaceName,
    platform: r.account.platform,
    mode: r.account.mode,
    handle: r.account.handle,
    displayName: r.account.displayName,
    status: r.account.status,
    tokenHealth: tokenHealth(r.account.mode, r.account.status, r.tokenExpiresAt, r.tokenAccountId !== null),
    tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null,
    lastSyncedAt: r.account.lastSyncedAt?.toISOString() ?? null,
    liveCapable: LIVE_CAPABLE.has(r.account.platform),
  }));

  const body: AccountsResponse = {
    accounts,
    canManage: user.isSuperAdmin,
    canSync: scope.some((w) => canExportOrSync(w.role)),
    metaConfigured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
  };
  return json(body);
});
