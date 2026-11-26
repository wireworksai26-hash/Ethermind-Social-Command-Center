import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getUserFromHeaders } from '@/lib/api';
import { verifyState } from '@/lib/crypto';
import { env } from '@/lib/env';
import { upsertLiveAccount } from '@/lib/oauth-account';
import { getSyncQueue } from '@/lib/queue';
import { invalidateCache } from '@/lib/redis';
import { syncAccount } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function redirectTo(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, env().BETTER_AUTH_URL));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getUserFromHeaders(req.headers);
  if (!user?.isSuperAdmin) return redirectTo('/login');

  const code = req.nextUrl.searchParams.get('code');
  const state = verifyState(req.nextUrl.searchParams.get('state') ?? '');
  if (req.nextUrl.searchParams.get('error') || !code || !state || state.userId !== user.id) {
    return redirectTo('/accounts?oauth=denied');
  }

  const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, BETTER_AUTH_URL } = env();
  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) return redirectTo('/accounts?oauth=not_configured');

  try {
    const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, state.workspace)).limit(1);
    if (!workspace) return redirectTo('/accounts?oauth=error');

    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${BETTER_AUTH_URL}/api/v1/oauth/tiktok/callback`,
      }),
    });
    const tokenBody = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      open_id?: string;
      scope?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !tokenBody.access_token || !tokenBody.open_id) {
      throw new Error(tokenBody.error_description ?? `TikTok token HTTP ${tokenRes.status}`);
    }

    const userRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,username',
      { headers: { Authorization: `Bearer ${tokenBody.access_token}` }, cache: 'no-store' },
    );
    const userBody = (await userRes.json()) as {
      data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string; username?: string } };
    };
    const profile = userBody.data?.user;
    const handle = profile?.username || profile?.display_name?.toLowerCase().replace(/\s+/g, '') || tokenBody.open_id;

    const accountId = await upsertLiveAccount({
      workspaceId: workspace.id,
      platform: 'tiktok',
      platformAccountId: tokenBody.open_id,
      handle,
      displayName: profile?.display_name ?? handle,
      avatarUrl: profile?.avatar_url ?? null,
      accessToken: tokenBody.access_token,
      refreshToken: tokenBody.refresh_token ?? null,
      expiresAt: tokenBody.expires_in ? new Date(Date.now() + tokenBody.expires_in * 1000) : null,
      scopes: tokenBody.scope ? tokenBody.scope.split(',') : [],
    });
    await invalidateCache();

    const queue = getSyncQueue();
    if (queue) {
      await queue.add('sync-account', { accountId });
    } else {
      await syncAccount(accountId);
    }
    return redirectTo(`/accounts?ws=${workspace.slug}&oauth=connected&count=1`);
  } catch (error) {
    console.error('[oauth:tiktok] callback failed', error);
    return redirectTo('/accounts?oauth=error');
  }
}
