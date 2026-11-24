import { eq, like } from 'drizzle-orm';
import { db, schema } from './index';
import { auth } from '@/lib/auth';
import { invalidateCache } from '@/lib/redis';

interface WorkspaceSeed {
  name: string;
  slug: string;
  websiteUrl: string;
  shader: schema.ShaderConfig;
}

const WORKSPACES: WorkspaceSeed[] = [
  {
    name: 'Ethermind',
    slug: 'ethermind',
    websiteUrl: 'https://ethermind.agency',
    shader: { primary: '#4F46E5', secondary: '#3B82F6' },
  },
  {
    name: 'Klozer',
    slug: 'klozer',
    websiteUrl: 'https://klozer.my.id',
    shader: { primary: '#10B981', secondary: '#06B6D4' },
  },
];

async function seedWorkspaces(): Promise<void> {
  for (const w of WORKSPACES) {
    await db
      .insert(schema.workspaces)
      .values({ name: w.name, slug: w.slug, websiteUrl: w.websiteUrl, shaderConfig: w.shader })
      .onConflictDoUpdate({
        target: schema.workspaces.slug,
        set: { name: w.name, websiteUrl: w.websiteUrl, shaderConfig: w.shader },
      });
  }
}

async function clearSeededMockAccounts(): Promise<void> {
  const deleted = await db
    .delete(schema.socialAccounts)
    .where(like(schema.socialAccounts.platformAccountId, 'mock-%'))
    .returning({ id: schema.socialAccounts.id });
  if (deleted.length > 0) {
    await invalidateCache();
    console.log(`Removed ${deleted.length} dummy mock account(s)`);
  }
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
  await seedWorkspaces();
  await clearSeededMockAccounts();
  await seedSuperAdmin();
  console.log('Seed complete');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
