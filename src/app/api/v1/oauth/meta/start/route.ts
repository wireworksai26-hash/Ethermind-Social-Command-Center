import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, route } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/access';
import { signState } from '@/lib/crypto';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'read_insights',
  'instagram_basic',
  'instagram_manage_insights',
  'business_management',
];

export const GET = route(async (req, user) => {
  requireSuperAdmin(user);
  const { META_APP_ID, META_GRAPH_VERSION, BETTER_AUTH_URL } = env();
  if (!META_APP_ID || !env().META_APP_SECRET) throw new ApiError(503, 'Meta app is not configured on the server');

  const slug = req.nextUrl.searchParams.get('workspace') ?? '';
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, slug)).limit(1);
  if (!workspace) throw new ApiError(404, 'Workspace not found');

  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', META_APP_ID);
  url.searchParams.set('redirect_uri', `${BETTER_AUTH_URL}/api/v1/oauth/meta/callback`);
  url.searchParams.set('state', signState({ workspace: workspace.slug, userId: user.id }));
  url.searchParams.set('scope', SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  return NextResponse.redirect(url);
});
