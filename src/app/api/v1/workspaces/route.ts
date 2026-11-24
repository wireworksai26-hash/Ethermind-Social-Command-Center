import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ApiError, json, route } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/access';

export const dynamic = 'force-dynamic';

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Slug hanya boleh huruf kecil, angka, dan tanda hubung')
    .min(2)
    .max(50),
  websiteUrl: z.string().trim().url().optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#4F46E5'),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#06B6D4'),
});

export const POST = route(async (req, user) => {
  requireSuperAdmin(user);
  const input = createWorkspaceSchema.parse(await req.json().catch(() => null));

  const [existing] = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, input.slug))
    .limit(1);
  if (existing) throw new ApiError(409, `Brand dengan slug "${input.slug}" sudah ada`);

  const [created] = await db
    .insert(schema.workspaces)
    .values({
      name: input.name,
      slug: input.slug,
      websiteUrl: input.websiteUrl || null,
      shaderConfig: { primary: input.primaryColor, secondary: input.secondaryColor },
    })
    .returning();

  return json({ workspace: created }, { status: 201 });
});
