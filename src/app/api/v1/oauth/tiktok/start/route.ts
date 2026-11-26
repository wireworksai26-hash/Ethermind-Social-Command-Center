import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, route } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/access';
import { signState } from '@/lib/crypto';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const SCOPES = ['user.info.basic', 'user.info.stats', 'video.list'];

export const GET = route(async (req, user) => {
  requireSuperAdmin(user);
  const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, BETTER_AUTH_URL } = env();
  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
    throw new ApiError(503, 'TikTok app is not configured on the server');
  }

  const slug = req.nextUrl.searchParams.get('workspace') ?? '';
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, slug)).limit(1);
  if (!workspace) throw new ApiError(404, 'Workspace not found');

  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.searchParams.set('client_key', TIKTOK_CLIENT_KEY);
  url.searchParams.set('scope', SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', `${BETTER_AUTH_URL}/api/v1/oauth/tiktok/callback`);
  url.searchParams.set('state', signState({ workspace: workspace.slug, userId: user.id }));
  return NextResponse.redirect(url);
});
