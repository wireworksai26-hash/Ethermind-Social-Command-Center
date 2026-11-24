import type { Metadata } from 'next';
import { AlertsClient } from '@/components/alerts-client';

export const metadata: Metadata = { title: 'Alerts' };

export default function AlertsPage() {
  return <AlertsClient />;
}
