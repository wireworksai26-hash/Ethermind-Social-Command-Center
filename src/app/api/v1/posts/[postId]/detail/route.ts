import { z } from 'zod';
import { ApiError, json, route } from '@/lib/api';
import { accessibleWorkspaces } from '@/lib/access';
import { getPostDetail } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ postId: string }> };

export const GET = route<Ctx>(async (_req, user, ctx) => {
  const { postId } = await ctx.params;
  const id = z.string().uuid().safeParse(postId);
  if (!id.success) throw new ApiError(400, 'Invalid post id');
  const workspaces = await accessibleWorkspaces(user);
  const detail = await getPostDetail(
    id.data,
    workspaces.map((w) => w.id),
  );
  if (!detail) throw new ApiError(404, 'Post not found');
  return json(detail);
});
