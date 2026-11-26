import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, route } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/access';
import { createPkcePair, signState } from '@/lib/crypto';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const SCOPES = ['tweet.read', 'users.read', 'offline.access'];

export const GET = route(async (req, user) => {
  requireSuperAdmin(user);
  const { X_CLIENT_ID, X_CLIENT_SECRET, BETTER_AUTH_URL } = env();
  if (!X_CLIENT_ID || !X_CLIENT_SECRET) {
    throw new ApiError(503, 'X app is not configured on the server');
  }

  const slug = req.nextUrl.searchParams.get('workspace') ?? '';
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, slug)).limit(1);
  if (!workspace) throw new ApiError(404, 'Workspace not found');

  const pkce = createPkcePair();
  const url = new URL('https://x.com/i/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', X_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${BETTER_AUTH_URL}/api/v1/oauth/x/callback`);
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('state', signState({ workspace: workspace.slug, userId: user.id, codeVerifier: pkce.verifier }));
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return NextResponse.redirect(url);
});
