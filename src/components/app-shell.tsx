'use client';

import clsx from 'clsx';
import { LogOut, Pause, Play } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useFilters } from '@/lib/client/filters';
import { VIEWPORT_RECEDE_TRANSITION } from '@/lib/motion';
import { FALLBACK_THEME } from '@/lib/platforms';
import { PostPanel } from './post-panel';
import { ShaderBackground } from './shader-background';
import { ShellContext, type ShellWorkspace } from './shell-context';

interface Props {
  workspaces: ShellWorkspace[];
  user: { name: string; email: string; isSuperAdmin: boolean };
  children: React.ReactNode;
}

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/alerts', label: 'Alerts' },
];

const SHADER_KEY = 'ethermind:shader-paused';

export function AppShell({ workspaces, user, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { filters, setFilters } = useFilters();
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [shaderPaused, setShaderPaused] = useState(false);

  useEffect(() => {
    setShaderPaused(window.localStorage.getItem(SHADER_KEY) === '1');
  }, []);

  const toggleShader = () => {
    setShaderPaused((prev) => {
      window.localStorage.setItem(SHADER_KEY, prev ? '0' : '1');
      return !prev;
    });
  };

  const openPost = useCallback((id: string) => setOpenPostId(id), []);
  const closePost = useCallback(() => setOpenPostId(null), []);

  const theme = useMemo(() => {
    const active = workspaces.find((w) => w.slug === filters.ws);
    return active ?? { primary: FALLBACK_THEME.primary, secondary: FALLBACK_THEME.secondary };
  }, [workspaces, filters.ws]);

  const canExport = workspaces.some((w) => w.role === 'super_admin' || w.role === 'brand_manager');
  const panelOpen = openPostId !== null;
  const nav = user.isSuperAdmin ? [...NAV, { href: '/team', label: 'Team' }] : NAV;

  const signOut = async () => {
    await authClient.signOut();
    router.replace('/login');
    router.refresh();
  };

  const hrefWithScope = (href: string) => {
    const qs = new URLSearchParams();
    if (filters.ws !== 'all') qs.set('ws', filters.ws);
    const s = qs.toString();
    return s ? `${href}?${s}` : href;
  };

  return (
    <ShellContext.Provider value={{ workspaces, user, canExport, openPostId, openPost, closePost }}>
      <ShaderBackground colorA={theme.primary} colorB={theme.secondary} paused={shaderPaused || panelOpen} />
      <motion.div
        className="min-h-dvh origin-top overflow-x-clip"
        style={{
          '--accent-a': theme.primary,
          '--accent-b': theme.secondary,
          willChange: 'transform, opacity',
        } as React.CSSProperties}
        animate={panelOpen ? { scale: 0.985, opacity: 0.72, borderRadius: 20 } : { scale: 1, opacity: 1, borderRadius: 0 }}
        transition={VIEWPORT_RECEDE_TRANSITION}
        inert={panelOpen}
      >
        <header className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-5 pb-3 sm:px-6">
          <Link href={hrefWithScope('/')} className="flex items-baseline gap-2.5">
            <span className="font-display text-[17px] font-extrabold tracking-tight text-ink">Ethermind</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Command Center</span>
          </Link>

          <nav aria-label="Primary" className="order-3 flex w-full gap-1 sm:order-none sm:w-auto">
            {nav.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={hrefWithScope(item.href)}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    active ? 'bg-white/10 text-ink' : 'text-muted hover:bg-white/[0.04] hover:text-ink',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleShader}
              aria-pressed={shaderPaused}
              title={shaderPaused ? 'Resume 3D background animation' : 'Pause 3D background animation'}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white/[0.03] px-2.5 font-mono text-[11px] text-muted transition-colors hover:bg-white/[0.07] hover:text-ink"
            >
              {shaderPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              <span className="hidden md:inline">{shaderPaused ? '3D BG: Paused' : '3D BG: On'}</span>
            </button>
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-medium leading-tight text-ink">{user.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-faint">
                {user.isSuperAdmin ? 'Super Admin' : 'Team'}
              </p>
            </div>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-white/[0.03] text-muted transition-colors hover:bg-white/[0.07] hover:text-ink"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6">
          <WorkspaceSwitcher
            items={[{ slug: 'all', name: 'All Brands' }, ...workspaces.map((w) => ({ slug: w.slug, name: w.name }))]}
            active={filters.ws}
            onChange={(slug) => setFilters({ ws: slug === 'all' ? undefined : slug })}
          />
        </div>

        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-20 sm:px-6"
        >
          {children}
        </motion.main>
      </motion.div>
      <PostPanel />
    </ShellContext.Provider>
  );
}

function WorkspaceSwitcher({
  items,
  active,
  onChange,
}: {
  items: Array<{ slug: string; name: string }>;
  active: string;
  onChange: (slug: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Workspace" className="glass inline-flex max-w-full gap-1 overflow-x-auto rounded-xl p-1">
      {items.map((item) => {
        const selected = active === item.slug;
        return (
          <button
            key={item.slug}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(item.slug)}
            className={clsx(
              'relative whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors',
              selected ? 'text-white' : 'text-muted hover:text-ink',
            )}
          >
            {selected && (
              <motion.span
                layoutId="workspace-pill"
                className="absolute inset-0 rounded-lg"
                style={{ background: 'linear-gradient(180deg, var(--accent-a), color-mix(in oklab, var(--accent-a) 70%, black))' }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{item.name}</span>
          </button>
        );
      })}
    </div>
  );
}
