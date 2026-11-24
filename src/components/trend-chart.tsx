'use client';

import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompact, formatFull, formatShortDate } from '@/lib/format';
import { BRAND_COLORS, FALLBACK_THEME, PLATFORM_META, PLATFORM_ORDER } from '@/lib/platforms';
import type { OverviewResponse } from '@/lib/types';

type Breakdown = 'total' | 'platform' | 'brand';

interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

export function TrendChart({ data, loading }: { data: OverviewResponse | undefined; loading: boolean }) {
  const [breakdown, setBreakdown] = useState<Breakdown>('total');

  const { rows, series } = useMemo(() => {
    if (!data) return { rows: [], series: [] as SeriesDef[] };
    if (breakdown === 'platform') {
      const present = PLATFORM_ORDER.filter((p) => data.series.some((s) => (s.platforms[p] ?? 0) > 0));
      return {
        rows: data.series.map((s) => ({ date: s.date, ...Object.fromEntries(present.map((p) => [p, s.platforms[p] ?? 0])) })),
        series: present.map((p) => ({ key: p, label: PLATFORM_META[p].label, color: PLATFORM_META[p].color })),
      };
    }
    if (breakdown === 'brand') {
      return {
        rows: data.series.map((s) => ({ date: s.date, ...Object.fromEntries(data.brands.map((b) => [b.slug, s.brands[b.slug] ?? 0])) })),
        series: data.brands.map((b) => ({
          key: b.slug,
          label: b.name,
          color: (BRAND_COLORS[b.slug] ?? FALLBACK_THEME).primary,
        })),
      };
    }
    return {
      rows: data.series.map((s) => ({ date: s.date, total: s.total })),
      series: [{ key: 'total', label: 'Total reach', color: 'var(--accent-b)' }] as SeriesDef[],
    };
  }, [data, breakdown]);

  const options: Array<{ key: Breakdown; label: string }> = [
    { key: 'total', label: 'Total' },
    { key: 'platform', label: 'By platform' },
    ...(data && data.brands.length > 1 ? [{ key: 'brand' as const, label: 'By brand' }] : []),
  ];

  return (
    <section className="glass rounded-2xl p-5" aria-labelledby="trend-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="trend-title" className="font-display text-base font-bold">
          Reach trend
        </h2>
        <div role="group" aria-label="Chart breakdown" className="inline-flex gap-0.5 rounded-lg border border-line p-0.5">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={breakdown === o.key}
              onClick={() => setBreakdown(o.key)}
              className={clsx(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                breakdown === o.key ? 'bg-white/12 text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-72">
        {loading || !data ? (
          <div className="skeleton h-full" aria-busy="true" aria-label="Loading chart" />
        ) : !data.hasData ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
            No metrics in this period for the selected filters.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fill: '#8b8b95', fontSize: 11, fontFamily: 'var(--font-jbmono)' }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis
                tickFormatter={formatCompact}
                tick={{ fill: '#8b8b95', fontSize: 11, fontFamily: 'var(--font-jbmono)' }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(255,255,255,0.2)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl">
                      <p className="mb-1 font-mono text-faint">{formatShortDate(String(label))}</p>
                      {payload.map((p) => (
                        <p key={String(p.dataKey)} className="flex items-center justify-between gap-6">
                          <span className="inline-flex items-center gap-1.5 text-muted">
                            <span className="size-1.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
                            {series.find((s) => s.key === p.dataKey)?.label ?? String(p.dataKey)}
                          </span>
                          <span className="tabular font-medium">{formatFull(Number(p.value))}</span>
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              {series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#fill-${s.key})`}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {breakdown !== 'total' && series.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
