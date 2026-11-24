import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import type { ShellWorkspace } from '@/components/shell-context';
import { accessibleWorkspaces } from '@/lib/access';
import { getUserFromHeaders } from '@/lib/api';
import { BRAND_COLORS } from '@/lib/platforms';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromHeaders(await headers());
  if (!user) redirect('/login');

  const workspaces: ShellWorkspace[] = (await accessibleWorkspaces(user)).map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    role: w.role,
    primary: BRAND_COLORS[w.slug]?.primary ?? w.shaderConfig.primary,
    secondary: BRAND_COLORS[w.slug]?.secondary ?? w.shaderConfig.secondary,
  }));

  return (
    <Suspense fallback={null}>
      <AppShell workspaces={workspaces} user={{ name: user.name, email: user.email, isSuperAdmin: user.isSuperAdmin }}>
        {workspaces.length === 0 ? (
          <div className="glass mx-auto mt-16 max-w-lg rounded-2xl p-8 text-center">
            <h1 className="font-display text-lg font-bold">No workspace assigned yet</h1>
            <p className="mt-2 text-sm text-muted">Ask your Super Admin to give {user.email} access to a workspace.</p>
          </div>
        ) : (
          children
        )}
      </AppShell>
    </Suspense>
  );
}
