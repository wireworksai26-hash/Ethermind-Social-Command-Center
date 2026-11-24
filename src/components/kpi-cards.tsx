'use client';

import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatCompact, formatPercent, formatSigned } from '@/lib/format';
import type { KpiValue, OverviewResponse } from '@/lib/types';

function Delta({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) {
    return <span className="font-mono text-[11px] text-faint">No prior data</span>;
  }
  const flat = Math.abs(deltaPct) < 0.05;
  const up = deltaPct > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 font-mono text-[11px] font-medium',
        flat ? 'text-faint' : up ? 'text-good' : 'text-bad',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {Math.abs(deltaPct).toFixed(1)}%
      <span className="sr-only">{flat ? 'unchanged' : up ? 'increase' : 'decrease'} versus previous period</span>
    </span>
  );
}

function Card({ label, value, kpi, hint }: { label: string; value: string; kpi: KpiValue; hint: string }) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-5">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, var(--accent-b), transparent)' }}
        aria-hidden="true"
      />
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className="tabular mt-3 font-display text-[34px] leading-none font-extrabold tracking-tight">{value}</p>
      <div className="mt-3 flex items-center gap-2">
        <Delta deltaPct={kpi.deltaPct} />
        <span className="text-xs text-faint">{hint}</span>
      </div>
    </div>
  );
}

export function KpiCards({ data, loading }: { data: OverviewResponse | undefined; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading KPIs">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-[132px]" />
        ))}
      </div>
    );
  }
  const { kpis } = data;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card label="Total reach / views" value={formatCompact(kpis.reach.value)} kpi={kpis.reach} hint={`prev ${formatCompact(kpis.reach.previous)}`} />
      <Card
        label="Weighted engagement rate"
        value={formatPercent(kpis.engagementRate.value)}
        kpi={kpis.engagementRate}
        hint={`prev ${formatPercent(kpis.engagementRate.previous)}`}
      />
      <Card
        label="Net follower growth"
        value={formatSigned(kpis.followerGrowth.value)}
        kpi={kpis.followerGrowth}
        hint={`prev ${formatSigned(kpis.followerGrowth.previous)}`}
      />
      <Card label="Published content" value={String(kpis.contentCount.value)} kpi={kpis.contentCount} hint={`prev ${kpis.contentCount.previous}`} />
    </div>
  );
}
