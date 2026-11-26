import { and, eq, like, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { PlatformType } from '@/db/schema';
import { encryptTokens } from './crypto';

export interface UpsertLiveAccountInput {
  workspaceId: string;
  platform: PlatformType;
  platformAccountId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes?: string[];
}

/**
 * Claims the workspace's seeded mock row for this platform when one exists (replacing mock history);
 * otherwise upserts the live account and stores encrypted OAuth tokens.
 */
export async function upsertLiveAccount(input: UpsertLiveAccountInput): Promise<string> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: schema.socialAccounts.id })
      .from(schema.socialAccounts)
      .where(
        and(
          eq(schema.socialAccounts.workspaceId, input.workspaceId),
          eq(schema.socialAccounts.platform, input.platform),
          eq(schema.socialAccounts.platformAccountId, input.platformAccountId),
        ),
      )
      .limit(1);

    let accountId = existing?.id;
    if (!accountId) {
      const [mockRow] = await tx
        .select({ id: schema.socialAccounts.id })
        .from(schema.socialAccounts)
        .where(
          and(
            eq(schema.socialAccounts.workspaceId, input.workspaceId),
            eq(schema.socialAccounts.platform, input.platform),
            eq(schema.socialAccounts.mode, 'mock'),
            like(schema.socialAccounts.platformAccountId, 'mock-%'),
          ),
        )
        .limit(1);
      if (mockRow) {
        accountId = mockRow.id;
        await tx.delete(schema.accountDailyMetrics).where(eq(schema.accountDailyMetrics.accountId, accountId));
        await tx.delete(schema.socialPosts).where(eq(schema.socialPosts.accountId, accountId));
      }
    }

    const fields = {
      mode: 'live' as const,
      platformAccountId: input.platformAccountId,
      handle: input.handle,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      status: 'active' as const,
    };
    if (accountId) {
      await tx.update(schema.socialAccounts).set(fields).where(eq(schema.socialAccounts.id, accountId));
    } else {
      const [created] = await tx
        .insert(schema.socialAccounts)
        .values({ workspaceId: input.workspaceId, platform: input.platform, ...fields })
        .returning({ id: schema.socialAccounts.id });
      if (!created) throw new Error('Failed to create account');
      accountId = created.id;
    }

    const enc = encryptTokens({ accessToken: input.accessToken, refreshToken: input.refreshToken });
    await tx
      .insert(schema.oauthTokens)
      .values({ accountId, ...enc, expiresAt: input.expiresAt, scopes: input.scopes ?? [] })
      .onConflictDoUpdate({
        target: schema.oauthTokens.accountId,
        set: { ...enc, expiresAt: input.expiresAt, scopes: input.scopes ?? [], updatedAt: sql`now()` },
      });
    return accountId;
  });
}
