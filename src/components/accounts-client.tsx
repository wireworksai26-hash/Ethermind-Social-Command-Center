'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Link2, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { apiGet, apiSend } from '@/lib/client/api';
import { useFilters } from '@/lib/client/filters';
import { formatDateTime, timeAgo } from '@/lib/format';
import { PLATFORM_META } from '@/lib/platforms';
import type { AccountRow, AccountsResponse, TokenHealth } from '@/lib/types';
import { KineticButton, KineticLink } from './kinetic-button';
import { ModeBadge, PlatformBadge } from './platform-badge';

const HEALTH: Record<TokenHealth, { label: string; className: string }> = {
  healthy: { label: 'Healthy', className: 'text-emerald-300' },
  expiring_soon: { label: 'Expiring soon', className: 'text-amber-300' },
  needs_reauth: { label: 'Needs re-auth', className: 'text-rose-300' },
  not_applicable: { label: 'No token (mock)', className: 'text-faint' },
};

const STATUS_LABEL: Record<AccountRow['status'], string> = {
  active: 'Active',
  expiring_soon: 'Expiring soon',
  disconnected: 'Disconnected',
  rate_limited: 'Rate limited',
};

const OAUTH_MESSAGES: Record<string, { tone: 'ok' | 'error'; text: string }> = {
  connected: { tone: 'ok', text: 'Meta accounts connected. The first live sync is running.' },
  denied: { tone: 'error', text: 'The Meta authorization was cancelled or could not be verified.' },
  not_configured: { tone: 'error', text: 'META_APP_ID and META_APP_SECRET are not set on the server.' },
  error: { tone: 'error', text: 'Connecting Meta failed. Check the server logs and try again.' },
};

export function AccountsClient() {
  const { filters } = useFilters();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const slug = filters.ws;

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['accounts', slug],
    queryFn: () => apiGet<AccountsResponse>(`/api/v1/workspaces/${slug}/accounts`),
  });

  const sync = useMutation({
    mutationFn: (accountId?: string) =>
      apiSend<{ queued: number; mode: 'queue' | 'inline' }>(`/api/v1/workspaces/${slug}/sync`, 'POST', accountId ? { accountId } : {}),
    onSuccess: (result) => {
      const delay = result.mode === 'queue' ? 4000 : 0;
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['accounts'] });
        void queryClient.invalidateQueries({ queryKey: ['overview'] });
        void queryClient.invalidateQueries({ queryKey: ['posts'] });
      }, delay);
    },
  });

  const oauth = params.get('oauth');
  const banner = oauth ? OAUTH_MESSAGES[oauth] : undefined;

  const grouped = new Map<string, AccountRow[]>();
  for (const a of data?.accounts ?? []) {
    grouped.set(a.workspaceName, [...(grouped.get(a.workspaceName) ?? []), a]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">Accounts and data sources</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Live accounts read from the official API. Mock accounts use a seeded sample feed until the platform developer app is approved.
          </p>
        </div>
        {data?.canSync && (
          <KineticButton
            variant="primary"
            label={sync.isPending ? 'Syncing...' : 'Sync data'}
            icon={<RefreshCw className={clsx('size-4', sync.isPending && 'animate-spin')} aria-hidden="true" />}
            disabled={sync.isPending}
            onClick={() => sync.mutate(undefined)}
          />
        )}
      </div>

      {banner && (
        <p
          role="status"
          className={clsx(
            'rounded-xl border px-4 py-3 text-sm',
            banner.tone === 'ok' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/30 bg-rose-400/10 text-rose-200',
          )}
        >
          {banner.text}
        </p>
      )}
      {sync.isError && (
        <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {sync.error instanceof Error ? sync.error.message : 'Sync failed'}
        </p>
      )}
      {sync.isSuccess && (
        <p role="status" className="rounded-xl border border-line bg-white/[0.04] px-4 py-3 text-sm text-muted">
          Sync started for {sync.data.queued} account{sync.data.queued === 1 ? '' : 's'}. Status refreshes shortly.
        </p>
      )}

      {isError ? (
        <div role="alert" className="glass rounded-2xl p-6 text-sm">
          <p className="font-semibold">Accounts could not be loaded.</p>
          <p className="mt-1 text-muted">{error instanceof Error ? error.message : 'Unknown error'}</p>
          <button type="button" onClick={() => void refetch()} className="mt-3 font-semibold underline">
            Try again
          </button>
        </div>
      ) : isPending ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      ) : data.accounts.length === 0 ? (
        <p className="glass rounded-2xl p-10 text-center text-sm text-muted">No accounts are linked to this workspace yet.</p>
      ) : (
        [...grouped.entries()].map(([workspaceName, accounts]) => (
          <section key={workspaceName} className="glass overflow-hidden rounded-2xl" aria-label={`${workspaceName} accounts`}>
            <h2 className="border-b border-line px-5 py-3 font-display text-sm font-bold">{workspaceName}</h2>
            <ul>
              {accounts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4 first:border-t-0">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlatformBadge platform={a.platform} showLabel />
                      <ModeBadge mode={a.mode} />
                    </div>
                    <p className="mt-1.5 text-sm font-medium">
                      {a.displayName} <span className="font-mono text-xs text-faint">@{a.handle}</span>
                    </p>
                  </div>

                  <dl className="grid grid-cols-3 gap-x-6 text-xs">
                    <div>
                      <dt className="text-faint">Status</dt>
                      <dd className="mt-0.5 font-medium">{STATUS_LABEL[a.status]}</dd>
                    </div>
                    <div>
                      <dt className="text-faint">Token</dt>
                      <dd className={clsx('mt-0.5 font-medium', HEALTH[a.tokenHealth].className)}>{HEALTH[a.tokenHealth].label}</dd>
                    </div>
                    <div>
                      <dt className="text-faint">Last synced</dt>
                      <dd className="mt-0.5 font-mono" title={a.lastSyncedAt ? formatDateTime(a.lastSyncedAt) : undefined}>
                        {timeAgo(a.lastSyncedAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex items-center gap-2">
                    {data.canSync && (
                      <KineticButton label="Sync" disabled={sync.isPending} onClick={() => sync.mutate(a.id)} />
                    )}
                    {data.canManage &&
                      (a.liveCapable ? (
                        data.metaConfigured ? (
                          <KineticLink
                            href={`/api/v1/oauth/meta/start?workspace=${a.workspaceSlug}`}
                            icon={<Link2 className="size-4" aria-hidden="true" />}
                            label={a.mode === 'live' ? 'Reconnect' : 'Connect Meta'}
                          />
                        ) : (
                          <span className="text-xs text-faint">Meta app not configured</span>
                        )
                      ) : (
                        <span className="text-xs text-faint">{PLATFORM_META[a.platform].label} app pending approval</span>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
