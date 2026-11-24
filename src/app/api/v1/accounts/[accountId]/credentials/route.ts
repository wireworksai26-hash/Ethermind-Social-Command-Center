import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, json, route } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/access';
import { encryptTokens } from '@/lib/crypto';
import { invalidateCache } from '@/lib/redis';
import { getSyncQueue } from '@/lib/queue';
import { syncAccount } from '@/lib/sync';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ accountId: string }> };

const credentialsSchema = z.object({
  mode: z.enum(['live', 'mock']),
  platformAccountId: z.string().trim().min(1).max(120).optional(),
  accessToken: z.string().trim().min(1).optional(),
  refreshToken: z.string().trim().optional(),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
  triggerSync: z.boolean().default(true),
});

export const PATCH = route<Ctx>(async (req, user, ctx) => {
  requireSuperAdmin(user);
  const accountId = z.string().uuid().parse((await ctx.params).accountId);
  const input = credentialsSchema.parse(await req.json().catch(() => null));

  const [account] = await db
    .select()
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.id, accountId))
    .limit(1);
  if (!account) throw new ApiError(404, 'Akun tidak ditemukan');

  if (input.mode === 'live' && !input.accessToken) {
    const [existingToken] = await db
      .select({ accountId: schema.oauthTokens.accountId })
      .from(schema.oauthTokens)
      .where(eq(schema.oauthTokens.accountId, accountId))
      .limit(1);
    if (!existingToken) {
      throw new ApiError(400, 'Access token wajib diisi untuk mengaktifkan mode LIVE API');
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.socialAccounts)
      .set({
        mode: input.mode,
        platformAccountId: input.platformAccountId || account.platformAccountId,
        status: 'active',
      })
      .where(eq(schema.socialAccounts.id, accountId));

    if (input.accessToken) {
      const enc = encryptTokens({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken || null,
      });
      const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null;
      await tx
        .insert(schema.oauthTokens)
        .values({
          accountId,
          ...enc,
          scopes: [],
          expiresAt,
        })
        .onConflictDoUpdate({
          target: schema.oauthTokens.accountId,
          set: {
            ...enc,
            expiresAt,
            updatedAt: new Date(),
          },
        });
    }
  });

  await invalidateCache();

  if (input.triggerSync) {
    const queue = getSyncQueue();
    if (queue) {
      await queue.add('sync-account', { accountId }, { jobId: `cred-${accountId}-${Date.now()}` });
    } else {
      await syncAccount(accountId);
    }
  }

  return json({ ok: true });
});
