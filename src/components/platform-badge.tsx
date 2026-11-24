import { PLATFORM_META } from '@/lib/platforms';
import type { Platform } from '@/lib/types';

export function PlatformBadge({ platform, showLabel = false }: { platform: Platform; showLabel?: boolean }) {
  const meta = PLATFORM_META[platform];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink"
      title={meta.label}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden="true" />
      {showLabel ? meta.label : meta.short}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: 'live' | 'mock' }) {
  return mode === 'live' ? (
    <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-emerald-300">
      LIVE API
    </span>
  ) : (
    <span className="rounded-md border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-amber-200">
      MOCK ADAPTER
    </span>
  );
}
