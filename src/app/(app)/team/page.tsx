import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { TeamClient } from '@/components/team-client';
import { getUserFromHeaders } from '@/lib/api';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage() {
  const user = await getUserFromHeaders(await headers());
  if (!user?.isSuperAdmin) notFound();
  return <TeamClient />;
}
