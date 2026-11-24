import type { Metadata } from 'next';
import { AccountsClient } from '@/components/accounts-client';

export const metadata: Metadata = { title: 'Accounts' };

export default function AccountsPage() {
  return <AccountsClient />;
}
