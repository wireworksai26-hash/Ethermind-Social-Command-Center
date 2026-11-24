'use client';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { apiGet } from '@/lib/client/api';
import { useFilters } from '@/lib/client/filters';
import type { OverviewResponse } from '@/lib/types';
import { FilterBar } from './filter-bar';
import { KineticLink } from './kinetic-button';
import { KpiCards } from './kpi-cards';
import { Leaderboard } from './leaderboard';
import { useShell } from './shell-context';
import { TrendChart } from './trend-chart';

export function OverviewClient() {
  const { apiQuery } = useFilters();
  const { canExport } = useShell();
  const overview = useQuery({
    queryKey: ['overview', apiQuery],
    queryFn: () => apiGet<OverviewResponse>(`/api/v1/analytics/overview?${apiQuery}`),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">Executive overview</h1>
          <p className="mt-1 text-sm text-muted">
            {overview.data
              ? `${overview.data.range.from} to ${overview.data.range.to}, compared with the previous period of equal length.`
              : 'Cross-platform performance for the selected brand and period.'}
          </p>
        </div>
        {canExport && (
          <KineticLink
            href={`/api/v1/export?type=overview&${apiQuery}`}
            download
            variant="ghost"
            icon={<Download className="size-4" aria-hidden="true" />}
            label="Export summary CSV"
          />
        )}
      </div>

      <FilterBar />

      {overview.isError ? (
        <div role="alert" className="glass rounded-2xl p-6">
          <p className="font-semibold">The overview could not be loaded.</p>
          <p className="mt-1 text-sm text-muted">{overview.error instanceof Error ? overview.error.message : 'Unknown error'}</p>
          <button type="button" onClick={() => void overview.refetch()} className="mt-3 text-sm font-semibold underline">
            Try again
          </button>
        </div>
      ) : (
        <>
          <KpiCards data={overview.data} loading={overview.isPending} />
          <TrendChart data={overview.data} loading={overview.isPending} />
        </>
      )}

      <Leaderboard />
    </div>
  );
}
