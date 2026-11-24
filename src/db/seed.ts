import { eq } from 'drizzle-orm';
import { db, schema } from './index';
import { auth } from '@/lib/auth';
import { syncAccount } from '@/lib/sync';
import type { PlatformType } from './schema';

interface WorkspaceSeed {
  name: string;
  slug: string;
  websiteUrl: string;
  shader: schema.ShaderConfig;
  handles: Record<PlatformType, { handle: string; displayName: string }>;
}

const WORKSPACES: WorkspaceSeed[] = [
  {
    name: 'Ethermind',
    slug: 'ethermind',
    websiteUrl: 'https://ethermind.agency',
    shader: { primary: '#4F46E5', secondary: '#3B82F6' },
    handles: {
      instagram: { handle: 'ethermind.agency', displayName: 'Ethermind Agency' },
      facebook: { handle: 'ethermind.agency', displayName: 'Ethermind Agency' },
      tiktok: { handle: 'ethermind.agency', displayName: 'Ethermind Agency' },
      x: { handle: 'ethermind_agency', displayName: 'Ethermind Agency' },
      threads: { handle: 'ethermind.agency', displayName: 'Ethermind Agency' },
    },
  },
  {
    name: 'Klozer',
    slug: 'klozer',
    websiteUrl: 'https://klozer.my.id',
    shader: { primary: '#10B981', secondary: '#06B6D4' },
    handles: {
      instagram: { handle: 'klozer.id', displayName: 'Klozer' },
      facebook: { handle: 'klozer.id', displayName: 'Klozer' },
      tiktok: { handle: 'klozer.id', displayName: 'Klozer' },
      x: { handle: 'klozer_id', displayName: 'Klozer' },
      threads: { handle: 'klozer.id', displayName: 'Klozer' },
    },
  },
];

const PLATFORM_LIST: PlatformType[] = ['instagram', 'facebook', 'tiktok', 'x', 'threads'];

async function seedWorkspaces(): Promise<string[]> {
  const newAccountIds: string[] = [];
  for (const w of WORKSPACES) {
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ name: w.name, slug: w.slug, websiteUrl: w.websiteUrl, shaderConfig: w.shader })
      .onConflictDoUpdate({
        target: schema.workspaces.slug,
        set: { name: w.name, websiteUrl: w.websiteUrl, shaderConfig: w.shader },
      })
      .returning();
    if (!workspace) throw new Error(`Failed to upsert workspace ${w.slug}`);

    for (const platform of PLATFORM_LIST) {
      const meta = w.handles[platform];
      const inserted = await db
        .insert(schema.socialAccounts)
        .values({
          workspaceId: workspace.id,
          platform,
          mode: 'mock',
          platformAccountId: `mock-${w.slug}-${platform}`,
          handle: meta.handle,
          displayName: meta.displayName,
        })
        .onConflictDoNothing()
        .returning({ id: schema.socialAccounts.id });
      if (inserted[0]) newAccountIds.push(inserted[0].id);
    }
  }
  return newAccountIds;
}

async function seedSuperAdmin(): Promise<void> {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  if (!email) {
    console.log('SEED_SUPER_ADMIN_EMAIL not set; skipping Super Admin');
    return;
  }

  const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  if (existing) {
    if (!existing.isSuperAdmin) {
      await db.update(schema.user).set({ isSuperAdmin: true }).where(eq(schema.user.id, existing.id));
    }
    console.log(`Super Admin ${email} already registered`);
    return;
  }
  if (!password) {
    console.log(`Super Admin ${email} not created yet. Claim it at /accept-invite with that email.`);
    return;
  }
  await auth.api.signUpEmail({ body: { email, password, name: 'Super Admin' } });
  console.log(`Super Admin ${email} created`);
}

async function main(): Promise<void> {
  const newAccounts = await seedWorkspaces();
  await seedSuperAdmin();

  // Populate history only for freshly created accounts; later refreshes belong to the worker.
  for (const id of newAccounts) {
    const result = await syncAccount(id);
    console.log(`Initial sync ${id}: ${result.status} (${result.recordsUpserted} records)`);
  }
  console.log('Seed complete');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
