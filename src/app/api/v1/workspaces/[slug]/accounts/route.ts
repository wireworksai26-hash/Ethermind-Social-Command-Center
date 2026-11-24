import { z } from 'zod';
import { asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { PLATFORMS } from '@/db/schema';
import { LIVE_CAPABLE } from '@/adapters/registry';
import { ApiError, json, route } from '@/lib/api';
import { canExportOrSync, requireSuperAdmin, resolveScope } from '@/lib/access';
import { encryptTokens } from '@/lib/crypto';
import { getSyncQueue } from '@/lib/queue';
import { invalidateCache } from '@/lib/redis';
import { syncAccount } from '@/lib/sync';
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

const createAccountSchema = z.object({
  platform: z.enum(PLATFORMS),
  handle: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(150),
  mode: z.enum(['live', 'mock']).default('mock'),
  platformAccountId: z.string().trim().max(120).optional(),
  accessToken: z.string().trim().optional(),
  refreshToken: z.string().trim().optional(),
});

export const POST = route<Ctx>(async (req, user, ctx) => {
  requireSuperAdmin(user);
  const { slug } = await ctx.params;
  if (slug === 'all') throw new ApiError(400, 'Pilih brand spesifik untuk menambah akun');

  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, slug)).limit(1);
  if (!workspace) throw new ApiError(404, 'Brand tidak ditemukan');

  const input = createAccountSchema.parse(await req.json().catch(() => null));
  if (input.mode === 'live' && !input.accessToken) {
    throw new ApiError(400, 'Access token wajib diisi jika langsung memakai mode LIVE API');
  }

  const cleanHandle = input.handle.replace(/^@/, '');
  const platformAccountId = input.platformAccountId?.trim() || `${input.mode}-${slug}-${input.platform}-${cleanHandle}`;

  const [created] = await db
    .insert(schema.socialAccounts)
    .values({
      workspaceId: workspace.id,
      platform: input.platform,
      mode: input.mode,
      platformAccountId,
      handle: cleanHandle,
      displayName: input.displayName,
      status: 'active',
    })
    .returning();
  if (!created) throw new ApiError(500, 'Gagal menambahkan akun');

  if (input.accessToken) {
    const enc = encryptTokens({
      accessToken: input.accessToken,
      refreshToken: input.refreshToken || null,
    });
    await db.insert(schema.oauthTokens).values({
      accountId: created.id,
      ...enc,
      scopes: [],
      expiresAt: new Date(Date.now() + 60 * 86_400_000),
    });
  }

  await invalidateCache();
  const queue = getSyncQueue();
  if (queue) {
    await queue.add('sync-account', { accountId: created.id }, { jobId: `add-${created.id}-${Date.now()}` });
  } else {
    await syncAccount(created.id);
  }

  return json({ account: created }, { status: 201 });
});
