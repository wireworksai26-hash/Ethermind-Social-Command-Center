import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { PLATFORMS } from '@/db/schema';
import { resolveRange } from './dates';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const filterSchema = z.object({
  workspace: z.string().min(1).max(50).default('all'),
  platform: z.enum(['all', ...PLATFORMS]).default('all'),
  range: z.enum(['7d', '30d', '90d', 'custom']).default('30d'),
  from: dateString.optional(),
  to: dateString.optional(),
});

export function parseFilters(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = filterSchema.parse(params);
  return {
    workspace: parsed.workspace,
    platform: parsed.platform,
    range: resolveRange(parsed.range, parsed.from, parsed.to),
  };
}

export const postsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  format: z.enum(['all', 'video', 'carousel', 'image', 'text']).default('all'),
  sort: z.enum(['engagement_rate', 'views_count', 'published_at']).default('engagement_rate'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export function parsePostsQuery(req: NextRequest) {
  return postsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}
