'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Download, Flame, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiGet } from '@/lib/client/api';
import { useFilters } from '@/lib/client/filters';
import { formatCompact, formatDate, formatPercent } from '@/lib/format';
import { MEDIA_LABEL } from '@/lib/platforms';
import type { PostDetailResponse, PostsResponse } from '@/lib/types';
import { KineticLink } from './kinetic-button';
import { ModeBadge, PlatformBadge } from './platform-badge';
import { postDetailKey } from './post-panel';
import { useShell } from './shell-context';

const PAGE_SIZE = 15;

const FORMATS = [
  { key: 'all', label: 'All formats' },
  { key: 'video', label: 'Reels / Video' },
  { key: 'carousel', label: 'Carousel' },
  { key: 'image', label: 'Image' },
  { key: 'text', label: 'Text / Thread' },
] as const;

const SORTS = [
  { key: 'engagement_rate', label: 'Engagement rate' },
  { key: 'views_count', label: 'Views' },
  { key: 'published_at', label: 'Newest' },
] as const;

type FormatKey = (typeof FORMATS)[number]['key'];
type SortKey = (typeof SORTS)[number]['key'];

export function Leaderboard() {
  const { apiQuery } = useFilters();
  const { openPost, canExport } = useShell();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [format, setFormat] = useState<FormatKey>('all');
  const [sort, setSort] = useState<SortKey>('engagement_rate');
  const [page, setPage] = useState(1);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Any change to the scope or controls restarts pagination.
  useEffect(() => setPage(1), [apiQuery, debounced, format, sort]);

  const postsQuery = new URLSearchParams({ format, sort, page: String(page), pageSize: String(PAGE_SIZE) });
  if (debounced) postsQuery.set('q', debounced);
  const queryString = `${apiQuery}&${postsQuery.toString()}`;

  const { data, isPending, isError, error, isPlaceholderData, refetch } = useQuery({
    queryKey: ['posts', queryString],
    queryFn: () => apiGet<PostsResponse>(`/api/v1/analytics/posts?${queryString}`),
    placeholderData: keepPreviousData,
  });

  const exportParams = new URLSearchParams(apiQuery);
  exportParams.set('type', 'posts');
  exportParams.set('format', format);
  exportParams.set('sort', sort);
  if (debounced) exportParams.set('q', debounced);

  const prefetch = (id: string) => {
    hoverTimer.current = setTimeout(() => {
      void queryClient.prefetchQuery({
        queryKey: postDetailKey(id),
        queryFn: () => apiGet<PostDetailResponse>(`/api/v1/posts/${id}/detail`),
      });
    }, 120);
  };
  const cancelPrefetch = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="glass rounded-2xl" aria-labelledby="leaderboard-title">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-5">
        <h2 id="leaderboard-title" className="mr-auto font-display text-base font-bold">
          Content leaderboard
        </h2>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
          <label htmlFor="post-search" className="sr-only">
            Search captions
          </label>
          <input
            id="post-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search captions"
            className="w-48 rounded-lg border border-line bg-white/[0.04] py-1.5 pr-3 pl-8 text-sm placeholder:text-faint"
          />
        </div>
        <label className="sr-only" htmlFor="post-format">
          Format
        </label>
        <select
          id="post-format"
          value={format}
          onChange={(e) => setFormat(e.target.value as FormatKey)}
          className="rounded-lg border border-line bg-[#101117] px-2.5 py-1.5 text-sm"
        >
          {FORMATS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="post-sort">
          Sort by
        </label>
        <select
          id="post-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-line bg-[#101117] px-2.5 py-1.5 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              Sort: {s.label}
            </option>
          ))}
        </select>
        {canExport && (
          <KineticLink
            href={`/api/v1/export?${exportParams.toString()}`}
            download
            icon={<Download className="size-4" aria-hidden="true" />}
            label="Export CSV"
          />
        )}
      </div>

      {isError ? (
        <div role="alert" className="p-6 text-sm">
          <p className="font-semibold">Posts could not be loaded.</p>
          <p className="mt-1 text-muted">{error instanceof Error ? error.message : 'Unknown error'}</p>
          <button type="button" onClick={() => void refetch()} className="mt-3 font-semibold underline">
            Try again
          </button>
        </div>
      ) : isPending ? (
        <div className="space-y-2 p-5" aria-busy="true" aria-label="Loading posts">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-14" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted">No posts match these filters in the selected period.</p>
      ) : (
        <>
          <div className={clsx('overflow-x-auto transition-opacity', isPlaceholderData && 'opacity-60')}>
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                  <th className="px-5 py-3 font-semibold">Post</th>
                  <th className="px-3 py-3 font-semibold">Published</th>
                  <th className="px-3 py-3 text-right font-semibold">Views</th>
                  <th className="px-3 py-3 text-right font-semibold">Interactions</th>
                  <th className="px-5 py-3 text-right font-semibold">ER</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((post) => (
                  <tr
                    key={post.id}
                    onClick={() => openPost(post.id)}
                    onMouseEnter={() => prefetch(post.id)}
                    onMouseLeave={cancelPrefetch}
                    className="cursor-pointer border-t border-line transition-colors hover:bg-white/[0.04]"
                  >
                    <td className="max-w-[440px] px-5 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPost(post.id);
                        }}
                        onFocus={() => prefetch(post.id)}
                        onBlur={cancelPrefetch}
                        className="block w-full text-left"
                      >
                        <span className="line-clamp-1 font-medium">{post.caption || 'No caption'}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <PlatformBadge platform={post.platform} />
                          <span className="font-mono text-[11px] text-faint">
                            {post.workspaceName} · {MEDIA_LABEL[post.mediaType] ?? post.mediaType}
                          </span>
                          <ModeBadge mode={post.mode} />
                          {post.isViralSpike && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-orange-400/40 bg-orange-400/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-orange-300">
                              <Flame className="size-3" aria-hidden="true" /> VIRAL
                            </span>
                          )}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted">{formatDate(post.publishedAt)}</td>
                    <td className="tabular px-3 py-3 text-right font-medium">{formatCompact(post.viewsCount)}</td>
                    <td className="tabular px-3 py-3 text-right text-muted">
                      {formatCompact(post.likesCount + post.commentsCount + post.sharesCount + post.savesCount)}
                    </td>
                    <td className="tabular px-5 py-3 text-right font-semibold">{formatPercent(post.engagementRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-muted">
            <span className="font-mono">
              {(data.page - 1) * data.pageSize + 1}-{Math.min(data.page * data.pageSize, data.total)} of {data.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
                className="inline-flex size-8 items-center justify-center rounded-lg border border-line disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="px-2 font-mono">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="inline-flex size-8 items-center justify-center rounded-lg border border-line disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
