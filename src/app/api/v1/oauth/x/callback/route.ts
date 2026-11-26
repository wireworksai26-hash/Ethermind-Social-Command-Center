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
  if (req.nextUrl.searchParams.get('error') || !code || !state || state.userId !== user.id || !state.codeVerifier) {
    return redirectTo('/accounts?oauth=denied');
  }

  const { X_CLIENT_ID, X_CLIENT_SECRET, BETTER_AUTH_URL } = env();
  if (!X_CLIENT_ID || !X_CLIENT_SECRET) return redirectTo('/accounts?oauth=not_configured');

  try {
    const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, state.workspace)).limit(1);
    if (!workspace) return redirectTo('/accounts?oauth=error');

    const basic = Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${BETTER_AUTH_URL}/api/v1/oauth/x/callback`,
        code_verifier: state.codeVerifier,
      }),
    });
    const tokenBody = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !tokenBody.access_token) {
      throw new Error(tokenBody.error_description ?? `X token HTTP ${tokenRes.status}`);
    }

    const meRes = await fetch('https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url', {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
      cache: 'no-store',
    });
    const meBody = (await meRes.json()) as {
      data?: { id: string; name: string; username: string; profile_image_url?: string };
    };
    if (!meRes.ok || !meBody.data) throw new Error('Failed to load X user profile');
    const profile = meBody.data;

    const accountId = await upsertLiveAccount({
      workspaceId: workspace.id,
      platform: 'x',
      platformAccountId: profile.id,
      handle: profile.username,
      displayName: profile.name,
      avatarUrl: profile.profile_image_url ?? null,
      accessToken: tokenBody.access_token,
      refreshToken: tokenBody.refresh_token ?? null,
      expiresAt: tokenBody.expires_in ? new Date(Date.now() + tokenBody.expires_in * 1000) : null,
      scopes: tokenBody.scope ? tokenBody.scope.split(' ') : [],
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
    console.error('[oauth:x] callback failed', error);
    return redirectTo('/accounts?oauth=error');
  }
}
