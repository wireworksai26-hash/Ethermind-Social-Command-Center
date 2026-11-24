'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { PLATFORM_ORDER } from '@/lib/platforms';
import type { PlatformFilter } from '@/lib/types';

export type RangeKey = '7d' | '30d' | '90d' | 'custom';
const RANGES: RangeKey[] = ['7d', '30d', '90d', 'custom'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface Filters {
  ws: string;
  platform: PlatformFilter;
  range: RangeKey;
  from: string | undefined;
  to: string | undefined;
}

export function useFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawRange = params.get('range') ?? '30d';
  const rawPlatform = params.get('platform') ?? 'all';
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;

  const filters: Filters = useMemo(() => {
    const range = (RANGES as string[]).includes(rawRange) ? (rawRange as RangeKey) : '30d';
    const validCustom = from && to && DATE_RE.test(from) && DATE_RE.test(to) && from <= to;
    return {
      ws: params.get('ws') ?? 'all',
      platform: (PLATFORM_ORDER as string[]).includes(rawPlatform) ? (rawPlatform as PlatformFilter) : 'all',
      range: range === 'custom' && !validCustom ? '30d' : range,
      from: validCustom ? from : undefined,
      to: validCustom ? to : undefined,
    };
  }, [params, rawRange, rawPlatform, from, to]);

  /** Query string understood by `/api/v1/analytics/*` and `/api/v1/export`. */
  const apiQuery = useMemo(() => {
    const q = new URLSearchParams({ workspace: filters.ws, platform: filters.platform, range: filters.range });
    if (filters.range === 'custom' && filters.from && filters.to) {
      q.set('from', filters.from);
      q.set('to', filters.to);
    }
    return q.toString();
  }, [filters]);

  const setFilters = useCallback(
    (patch: Partial<Record<'ws' | 'platform' | 'range' | 'from' | 'to', string | undefined>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '') next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return { filters, apiQuery, setFilters };
}
