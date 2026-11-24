'use client';

import clsx from 'clsx';
import { useFilters, type RangeKey } from '@/lib/client/filters';
import { PLATFORM_META, PLATFORM_ORDER } from '@/lib/platforms';
import type { PlatformFilter } from '@/lib/types';

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'custom', label: 'Custom' },
];

export function FilterBar() {
  const { filters, setFilters } = useFilters();
  const platforms: Array<{ key: PlatformFilter; label: string; color?: string }> = [
    { key: 'all', label: 'All' },
    ...PLATFORM_ORDER.map((p) => ({ key: p as PlatformFilter, label: PLATFORM_META[p].label, color: PLATFORM_META[p].color })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Date range" className="glass inline-flex gap-0.5 rounded-xl p-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={filters.range === r.key}
            onClick={() => {
              if (r.key === 'custom') {
                const to = new Date().toISOString().slice(0, 10);
                const from = new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10);
                setFilters({ range: 'custom', from: filters.from ?? from, to: filters.to ?? to });
              } else {
                setFilters({ range: r.key === '30d' ? undefined : r.key, from: undefined, to: undefined });
              }
            }}
            className={clsx(
              'rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition-colors',
              filters.range === r.key ? 'bg-white/12 text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {filters.range === 'custom' && (
        <div className="flex items-center gap-2 font-mono text-xs">
          <label className="sr-only" htmlFor="range-from">
            From
          </label>
          <input
            id="range-from"
            type="date"
            value={filters.from ?? ''}
            max={filters.to}
            onChange={(e) => setFilters({ from: e.target.value })}
            className="rounded-lg border border-line bg-white/[0.04] px-2 py-1.5 text-ink [color-scheme:dark]"
          />
          <span className="text-faint">to</span>
          <label className="sr-only" htmlFor="range-to">
            To
          </label>
          <input
            id="range-to"
            type="date"
            value={filters.to ?? ''}
            min={filters.from}
            onChange={(e) => setFilters({ to: e.target.value })}
            className="rounded-lg border border-line bg-white/[0.04] px-2 py-1.5 text-ink [color-scheme:dark]"
          />
        </div>
      )}

      <div role="group" aria-label="Platform" className="flex flex-wrap gap-1.5">
        {platforms.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={filters.platform === p.key}
            onClick={() => setFilters({ platform: p.key === 'all' ? undefined : p.key })}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
              filters.platform === p.key
                ? 'border-white/25 bg-white/10 text-ink'
                : 'border-line text-muted hover:text-ink',
            )}
          >
            {p.color && <span className="size-1.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />}
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
