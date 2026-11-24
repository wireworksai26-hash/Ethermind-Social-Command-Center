import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, like, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getUserFromHeaders } from '@/lib/api';
import { encryptTokens, verifyState } from '@/lib/crypto';
import { env } from '@/lib/env';
import { invalidateCache } from '@/lib/redis';
import { getSyncQueue } from '@/lib/queue';
import { syncAccount } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface GraphPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${env().META_GRAPH_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: 'no-store' });
  const body = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `Graph API HTTP ${res.status}`);
  return body;
}

function redirectTo(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, env().BETTER_AUTH_URL));
}

interface UpsertInput {
  workspaceId: string;
  platform: 'instagram' | 'facebook';
  platformAccountId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
}

/**
 * Claims the workspace's seeded mock row for this platform when one exists (so history from the mock
 * adapter is replaced, not mixed with live data); otherwise inserts a new live account.
 */
async function upsertLiveAccount(input: UpsertInput): Promise<string> {
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
      .values({ accountId, ...enc, expiresAt: input.expiresAt, scopes: [] })
      .onConflictDoUpdate({
        target: schema.oauthTokens.accountId,
        set: { ...enc, expiresAt: input.expiresAt, updatedAt: sql`now()` },
      });
    return accountId;
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getUserFromHeaders(req.headers);
  if (!user?.isSuperAdmin) return redirectTo('/login');

  const code = req.nextUrl.searchParams.get('code');
  const state = verifyState(req.nextUrl.searchParams.get('state') ?? '');
  if (req.nextUrl.searchParams.get('error') || !code || !state || state.userId !== user.id) {
    return redirectTo('/accounts?oauth=denied');
  }

  const { META_APP_ID, META_APP_SECRET, BETTER_AUTH_URL } = env();
  if (!META_APP_ID || !META_APP_SECRET) return redirectTo('/accounts?oauth=not_configured');

  try {
    const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, state.workspace)).limit(1);
    if (!workspace) return redirectTo('/accounts?oauth=error');

    const short = await graphGet<{ access_token: string }>('oauth/access_token', {
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      redirect_uri: `${BETTER_AUTH_URL}/api/v1/oauth/meta/callback`,
      code,
    });
    const long = await graphGet<{ access_token: string; expires_in?: number }>('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      fb_exchange_token: short.access_token,
    });
    const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null;

    const pages = await graphGet<{ data: GraphPage[] }>('me/accounts', {
      access_token: long.access_token,
      fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}',
    });

    const accountIds: string[] = [];
    for (const page of pages.data) {
      accountIds.push(
        await upsertLiveAccount({
          workspaceId: workspace.id,
          platform: 'facebook',
          platformAccountId: page.id,
          handle: page.name,
          displayName: page.name,
          avatarUrl: null,
          accessToken: page.access_token,
          refreshToken: long.access_token,
          expiresAt,
        }),
      );
      const ig = page.instagram_business_account;
      if (ig) {
        accountIds.push(
          await upsertLiveAccount({
            workspaceId: workspace.id,
            platform: 'instagram',
            platformAccountId: ig.id,
            handle: ig.username ?? ig.id,
            displayName: ig.name ?? ig.username ?? page.name,
            avatarUrl: ig.profile_picture_url ?? null,
            accessToken: page.access_token,
            refreshToken: long.access_token,
            expiresAt,
          }),
        );
      }
    }
    await invalidateCache();

    const queue = getSyncQueue();
    if (queue) {
      await Promise.all(accountIds.map((id) => queue.add('sync-account', { accountId: id })));
    } else {
      for (const id of accountIds) await syncAccount(id);
    }
    return redirectTo(`/accounts?ws=${workspace.slug}&oauth=connected&count=${accountIds.length}`);
  } catch (error) {
    console.error('[oauth:meta] callback failed', error);
    return redirectTo('/accounts?oauth=error');
  }
}
