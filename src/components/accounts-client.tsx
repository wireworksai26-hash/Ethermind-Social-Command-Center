'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Building2, Link2, Plus, RefreshCw, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { apiGet, apiSend } from '@/lib/client/api';
import { useFilters } from '@/lib/client/filters';
import { formatDateTime, timeAgo } from '@/lib/format';
import { PLATFORM_META, PLATFORM_ORDER } from '@/lib/platforms';
import type { AccountRow, AccountsResponse, Platform, TokenHealth } from '@/lib/types';
import { KineticButton, KineticLink } from './kinetic-button';
import { ModeBadge, PlatformBadge } from './platform-badge';
import { useShell } from './shell-context';

const HEALTH: Record<TokenHealth, { label: string; className: string }> = {
  healthy: { label: 'Connected', className: 'text-emerald-300' },
  expiring_soon: { label: 'Expiring soon', className: 'text-amber-300' },
  needs_reauth: { label: 'Needs reconnect', className: 'text-rose-300' },
  not_applicable: { label: 'Mock sample', className: 'text-faint' },
};

const STATUS_LABEL: Record<AccountRow['status'], string> = {
  active: 'Active',
  expiring_soon: 'Expiring soon',
  disconnected: 'Disconnected',
  rate_limited: 'Rate limited',
};

const OAUTH_MESSAGES: Record<string, { tone: 'ok' | 'error'; text: string }> = {
  connected: { tone: 'ok', text: 'Akun Meta berhasil terhubung. Sinkronisasi data asli sedang berjalan.' },
  denied: { tone: 'error', text: 'Otorisasi Meta dibatalkan atau tidak dapat diverifikasi.' },
  not_configured: { tone: 'error', text: 'META_APP_ID dan META_APP_SECRET belum dipasang di server.' },
  error: { tone: 'error', text: 'Gagal menghubungkan akun Meta. Cek pengaturan Redirect URI dan coba lagi.' },
};

const THEME_PRESETS = [
  { label: 'Indigo Cobalt', primary: '#4F46E5', secondary: '#3B82F6' },
  { label: 'Emerald Cyan', primary: '#10B981', secondary: '#06B6D4' },
  { label: 'Amber Rose', primary: '#F59E0B', secondary: '#F43F5E' },
  { label: 'Violet Pink', primary: '#8B5CF6', secondary: '#EC4899' },
];

export function AccountsClient() {
  const { filters } = useFilters();
  const { workspaces } = useShell();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const router = useRouter();
  const slug = filters.ws;

  const [newBrandOpen, setNewBrandOpen] = useState(false);
  const [addAccountSlug, setAddAccountSlug] = useState<string | null>(null);

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

  const grouped = new Map<string, { slug: string; accounts: AccountRow[] }>();
  for (const a of data?.accounts ?? []) {
    const cur = grouped.get(a.workspaceName);
    if (cur) cur.accounts.push(a);
    else grouped.set(a.workspaceName, { slug: a.workspaceSlug, accounts: [a] });
  }

  const activeBrandSlug = slug !== 'all' ? slug : workspaces[0]?.slug;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-[28px]">
            Accounts and data sources
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Hubungkan akun media sosial langsung dengan login akun resmi (OAuth 1-klik) per brand, tanpa perlu salin token manual.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.canManage && (
            <>
              <KineticButton
                variant="ghost"
                label="Add Brand"
                icon={<Building2 className="size-4" aria-hidden="true" />}
                onClick={() => setNewBrandOpen(true)}
              />
              {activeBrandSlug && data.metaConfigured && (
                <KineticLink
                  href={`/api/v1/oauth/meta/start?workspace=${activeBrandSlug}`}
                  variant="primary"
                  icon={<Link2 className="size-4" aria-hidden="true" />}
                  label="Connect Meta (FB & IG)"
                />
              )}
              {workspaces.length > 0 && (
                <KineticButton
                  variant="ghost"
                  label="Add Account"
                  icon={<Plus className="size-4" aria-hidden="true" />}
                  onClick={() => setAddAccountSlug(activeBrandSlug ?? null)}
                />
              )}
            </>
          )}
          {data?.canSync && (
            <KineticButton
              variant={data.metaConfigured ? 'ghost' : 'primary'}
              label={sync.isPending ? 'Syncing...' : 'Sync data'}
              icon={<RefreshCw className={clsx('size-4', sync.isPending && 'animate-spin')} aria-hidden="true" />}
              disabled={sync.isPending}
              onClick={() => sync.mutate(undefined)}
            />
          )}
        </div>
      </div>

      {data?.canManage && !data.metaConfigured && (
        <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          Login 1-klik Meta belum aktif karena <code>META_APP_ID</code> dan <code>META_APP_SECRET</code> belum terpasang di server Railway.
        </div>
      )}

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
        <div className="glass rounded-2xl p-10 text-center">
          <p className="text-sm text-muted">Belum ada akun media sosial terhubung di brand ini.</p>
          {data.canManage && activeBrandSlug && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {data.metaConfigured && (
                <KineticLink
                  href={`/api/v1/oauth/meta/start?workspace=${activeBrandSlug}`}
                  variant="primary"
                  icon={<Link2 className="size-4" aria-hidden="true" />}
                  label="Connect Meta (FB & IG)"
                />
              )}
              <KineticButton
                variant="ghost"
                label="Add Sample Account"
                icon={<Plus className="size-4" aria-hidden="true" />}
                onClick={() => setAddAccountSlug(activeBrandSlug)}
              />
            </div>
          )}
        </div>
      ) : (
        [...grouped.entries()].map(([workspaceName, group]) => (
          <section key={workspaceName} className="glass overflow-hidden rounded-2xl" aria-label={`${workspaceName} accounts`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <h2 className="font-display text-sm font-bold text-ink">{workspaceName}</h2>
              {data.canManage && (
                <div className="flex items-center gap-2">
                  {data.metaConfigured && (
                    <a
                      href={`/api/v1/oauth/meta/start?workspace=${group.slug}`}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-400/20"
                    >
                      <Link2 className="size-3.5" aria-hidden="true" />
                      Connect FB / IG
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setAddAccountSlug(group.slug)}
                    className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Add account
                  </button>
                </div>
              )}
            </div>
            <ul>
              {group.accounts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-4 first:border-t-0">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlatformBadge platform={a.platform} showLabel />
                      <ModeBadge mode={a.mode} />
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-ink">
                      {a.displayName} <span className="font-mono text-xs text-faint">@{a.handle}</span>
                    </p>
                  </div>

                  <dl className="grid grid-cols-3 gap-x-6 text-xs">
                    <div>
                      <dt className="text-faint">Status</dt>
                      <dd className="mt-0.5 font-medium text-ink">{STATUS_LABEL[a.status]}</dd>
                    </div>
                    <div>
                      <dt className="text-faint">Connection</dt>
                      <dd className={clsx('mt-0.5 font-medium', HEALTH[a.tokenHealth].className)}>{HEALTH[a.tokenHealth].label}</dd>
                    </div>
                    <div>
                      <dt className="text-faint">Last synced</dt>
                      <dd className="mt-0.5 font-mono text-ink" title={a.lastSyncedAt ? formatDateTime(a.lastSyncedAt) : undefined}>
                        {timeAgo(a.lastSyncedAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-2">
                    {data.canSync && (
                      <KineticButton label="Sync" disabled={sync.isPending} onClick={() => sync.mutate(a.id)} />
                    )}
                    {data.canManage &&
                      (a.liveCapable ? (
                        data.metaConfigured ? (
                          <KineticLink
                            href={`/api/v1/oauth/meta/start?workspace=${a.workspaceSlug}`}
                            icon={<Link2 className="size-4" aria-hidden="true" />}
                            label={a.mode === 'live' && a.status === 'active' ? 'Reconnect' : 'Login Meta'}
                          />
                        ) : (
                          <span className="text-xs text-faint">Meta OAuth not configured</span>
                        )
                      ) : (
                        <span className="text-xs text-faint">{PLATFORM_META[a.platform].label} OAuth pending app review</span>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <NewBrandModal
        open={newBrandOpen}
        onClose={() => setNewBrandOpen(false)}
        onCreated={(createdSlug) => {
          setNewBrandOpen(false);
          router.replace(`/accounts?ws=${createdSlug}`);
          router.refresh();
        }}
      />

      <AddAccountModal
        workspaceSlug={addAccountSlug}
        workspaces={workspaces}
        onClose={() => setAddAccountSlug(null)}
        onCreated={() => {
          setAddAccountSlug(null);
          void queryClient.invalidateQueries({ queryKey: ['accounts'] });
          void queryClient.invalidateQueries({ queryKey: ['overview'] });
          void queryClient.invalidateQueries({ queryKey: ['posts'] });
        }}
      />
    </div>
  );
}

function ModalShell({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed top-1/2 left-1/2 z-50 w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-lg font-bold text-ink">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted">{description}</Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="inline-flex size-8 items-center justify-center rounded-lg border border-line text-muted hover:text-ink"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="mt-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NewBrandModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [preset, setPreset] = useState(0);

  const mutation = useMutation({
    mutationFn: () =>
      apiSend<{ workspace: { slug: string } }>('/api/v1/workspaces', 'POST', {
        name,
        slug,
        websiteUrl,
        primaryColor: THEME_PRESETS[preset]!.primary,
        secondaryColor: THEME_PRESETS[preset]!.secondary,
      }),
    onSuccess: (res) => {
      setName('');
      setSlug('');
      setWebsiteUrl('');
      onCreated(res.workspace.slug);
    },
  });

  const handleNameChange = (val: string) => {
    setName(val);
    setSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50),
    );
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Add new brand"
      description="Brand baru akan muncul di Workspace Switcher dan bisa dihubungkan ke akun sosmednya sendiri."
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-4"
      >
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-faint">Brand Name</label>
          <input
            required
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Wireworks Studio"
            className="mt-1.5 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-sm text-ink"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-faint">Slug (URL ID)</label>
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="wireworks-studio"
            className="mt-1.5 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 font-mono text-sm text-ink"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-faint">Website URL (opsional)</label>
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
            className="mt-1.5 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-sm text-ink"
          />
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-faint">Theme Accent</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {THEME_PRESETS.map((p, idx) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPreset(idx)}
                className={clsx(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium',
                  preset === idx ? 'border-white/30 bg-white/10 text-ink' : 'border-line text-muted hover:text-ink',
                )}
              >
                <span className="size-3 rounded-full" style={{ background: `linear-gradient(135deg, ${p.primary}, ${p.secondary})` }} />
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {mutation.isError && (
          <p role="alert" className="text-xs text-rose-300">
            {mutation.error instanceof Error ? mutation.error.message : 'Gagal membuat brand'}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <KineticButton label="Cancel" onClick={onClose} />
          <KineticButton type="submit" variant="primary" label={mutation.isPending ? 'Creating...' : 'Create Brand'} disabled={mutation.isPending} />
        </div>
      </form>
    </ModalShell>
  );
}

function AddAccountModal({
  workspaceSlug,
  workspaces,
  onClose,
  onCreated,
}: {
  workspaceSlug: string | null;
  workspaces: Array<{ slug: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [targetSlug, setTargetSlug] = useState(workspaceSlug ?? workspaces[0]?.slug ?? '');
  const [platform, setPlatform] = useState<Platform>('tiktok');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');

  const effectiveSlug = workspaceSlug && workspaces.some((w) => w.slug === targetSlug) ? targetSlug : (workspaceSlug ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      apiSend(`/api/v1/workspaces/${effectiveSlug}/accounts`, 'POST', {
        platform,
        handle,
        displayName: displayName || handle,
        mode: 'mock',
      }),
    onSuccess: () => {
      setHandle('');
      setDisplayName('');
      onCreated();
    },
  });

  return (
    <ModalShell
      open={workspaceSlug !== null}
      onClose={onClose}
      title="Add social account (sandbox)"
      description="Untuk Facebook & Instagram gunakan tombol Connect Meta (login 1-klik). Form ini untuk akun sandbox TikTok, X, atau Threads."
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-faint">Brand</label>
            <select
              value={effectiveSlug}
              onChange={(e) => setTargetSlug(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-line bg-[#101117] px-3 py-2 text-sm text-ink"
            >
              {workspaces.map((w) => (
                <option key={w.slug} value={w.slug}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-faint">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="mt-1.5 w-full rounded-lg border border-line bg-[#101117] px-3 py-2 text-sm text-ink"
            >
              {PLATFORM_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_META[p].label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-faint">Handle</label>
            <input
              required
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@brand.id"
              className="mt-1.5 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-sm text-ink"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-faint">Display Name</label>
            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Brand Official"
              className="mt-1.5 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-sm text-ink"
            />
          </div>
        </div>
        {mutation.isError && (
          <p role="alert" className="text-xs text-rose-300">
            {mutation.error instanceof Error ? mutation.error.message : 'Gagal menambah akun'}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <KineticButton label="Cancel" onClick={onClose} />
          <KineticButton type="submit" variant="primary" label={mutation.isPending ? 'Adding...' : 'Add Account'} disabled={mutation.isPending} />
        </div>
      </form>
    </ModalShell>
  );
}
