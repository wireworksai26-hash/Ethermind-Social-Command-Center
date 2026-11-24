'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Flame, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiGet } from '@/lib/client/api';
import { formatCompact, formatDateTime, formatFull, formatPercent } from '@/lib/format';
import { MEDIA_LABEL, PLATFORM_META } from '@/lib/platforms';
import { PANEL_STAGGER, PLASMA_PANEL_SPRING, VIEWPORT_RECEDE_TRANSITION } from '@/lib/motion';
import type { PostDetailResponse } from '@/lib/types';
import { KineticLink } from './kinetic-button';
import { ModeBadge, PlatformBadge } from './platform-badge';
import { useShell } from './shell-context';

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const } },
};

export function postDetailKey(id: string) {
  return ['post-detail', id] as const;
}

export function PostPanel() {
  const { openPostId, closePost } = useShell();

  return (
    <Dialog.Root open={openPostId !== null} onOpenChange={(open) => !open && closePost()}>
      <AnimatePresence>
        {openPostId && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 backdrop-blur-[6px]"
                style={{ backgroundColor: 'rgba(4, 5, 8, 0.55)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={VIEWPORT_RECEDE_TRANSITION}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.aside
                className="glass fixed top-3 right-3 bottom-3 z-50 flex w-[min(580px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[20px]"
                style={{ willChange: 'transform, opacity' }}
                initial={{ x: '106%', opacity: 0.6 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '106%', opacity: 0 }}
                transition={PLASMA_PANEL_SPRING}
              >
                <PanelBody postId={openPostId} />
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function PanelBody({ postId }: { postId: string }) {
  const { closePost } = useShell();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: postDetailKey(postId),
    queryFn: () => apiGet<PostDetailResponse>(`/api/v1/posts/${postId}/detail`),
  });

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <Dialog.Title className="font-display text-base font-bold">Post analytics</Dialog.Title>
        <Dialog.Close
          aria-label="Close panel"
          className="inline-flex size-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:text-ink"
        >
          <X className="size-4" />
        </Dialog.Close>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {isPending && <PanelSkeleton />}
        {isError && (
          <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm">
            <p className="font-medium text-rose-200">Could not load this post.</p>
            <p className="mt-1 text-muted">{error instanceof Error ? error.message : 'Unknown error'}</p>
            <button type="button" onClick={() => void refetch()} className="mt-3 text-sm font-semibold underline">
              Try again
            </button>
          </div>
        )}
        {data && (
          <motion.div
            variants={{ hidden: {}, show: { transition: PANEL_STAGGER } }}
            initial="hidden"
            animate="show"
            className="space-y-5"
          >
            <PostSummary post={data} />
          </motion.div>
        )}
      </div>
    </>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading post">
      <div className="skeleton h-40" />
      <div className="skeleton h-5 w-3/4" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-16" />
        ))}
      </div>
      <div className="skeleton h-40" />
    </div>
  );
}

function PostSummary({ post }: { post: PostDetailResponse }) {
  const meta = PLATFORM_META[post.platform];
  const interactions = post.likesCount + post.commentsCount + post.sharesCount + post.savesCount;
  const erDelta = post.accountAverageEngagementRate > 0 ? post.engagementRate / post.accountAverageEngagementRate : null;
  const velocity = (post.hourlyVelocity ?? []).map((cumulative, i, arr) => ({
    hour: i + 1,
    gained: cumulative - (arr[i - 1] ?? 0),
    cumulative,
  }));

  const metrics: Array<{ label: string; value: string }> = [
    { label: 'Views', value: formatFull(post.viewsCount) },
    { label: 'Reach', value: formatFull(post.reachCount) },
    { label: 'Engagement', value: formatFull(interactions) },
    { label: 'Likes', value: formatFull(post.likesCount) },
    { label: 'Comments', value: formatFull(post.commentsCount) },
    { label: post.platform === 'x' || post.platform === 'threads' ? 'Reposts' : 'Shares', value: formatFull(post.sharesCount) },
  ];
  if (post.platform !== 'x' && post.platform !== 'threads') metrics.push({ label: 'Saves', value: formatFull(post.savesCount) });

  return (
    <>
      <motion.div variants={item} className="relative overflow-hidden rounded-2xl border border-line">
        {post.thumbnailUrl ? (
          // Remote Meta CDN URLs; not optimizable through next/image without a loader allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.thumbnailUrl} alt="" className="h-52 w-full object-cover" loading="lazy" />
        ) : (
          <div
            className="flex h-44 items-end p-4"
            style={{ background: `linear-gradient(135deg, ${meta.color}33, rgba(255,255,255,0.02) 70%)` }}
          >
            <span className="font-display text-4xl font-extrabold tracking-tight" style={{ color: meta.color }}>
              {meta.label}
            </span>
          </div>
        )}
      </motion.div>

      <motion.div variants={item} className="flex flex-wrap items-center gap-2">
        <PlatformBadge platform={post.platform} showLabel />
        <span className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted">
          {MEDIA_LABEL[post.mediaType] ?? post.mediaType}
        </span>
        <ModeBadge mode={post.mode} />
        {post.isViralSpike && (
          <span className="inline-flex items-center gap-1 rounded-md border border-orange-400/40 bg-orange-400/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-orange-300">
            <Flame className="size-3" aria-hidden="true" /> VIRAL SPIKE
          </span>
        )}
      </motion.div>

      <motion.div variants={item}>
        <p className="text-[15px] leading-relaxed">{post.caption || <span className="text-faint">No caption</span>}</p>
        <p className="mt-2 font-mono text-[11px] text-faint">
          {post.workspaceName} · @{post.accountHandle} · {formatDateTime(post.publishedAt)}
        </p>
      </motion.div>

      <motion.dl variants={item} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border border-line bg-white/[0.03] p-3">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-faint">{m.label}</dt>
            <dd className="tabular mt-1 font-display text-xl font-bold">{m.value}</dd>
          </div>
        ))}
      </motion.dl>

      <motion.div variants={item} className="rounded-xl border border-line bg-white/[0.03] p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-faint">Engagement rate</p>
          <p className="tabular font-display text-2xl font-bold">{formatPercent(post.engagementRate)}</p>
        </div>
        <p className="mt-1 text-sm text-muted">
          Account average {formatPercent(post.accountAverageEngagementRate)} · avg views {formatCompact(post.accountAverageViews)}
          {erDelta !== null && (
            <span className="ml-1 font-mono text-xs text-ink">({erDelta.toFixed(1)}x)</span>
          )}
        </p>
      </motion.div>

      <motion.div variants={item}>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">Velocity, first 48 hours</p>
        {velocity.length > 1 ? (
          <div className="h-44 rounded-xl border border-line bg-white/[0.03] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={velocity} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="velocityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-b)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--accent-b)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fill: '#8b8b95', fontSize: 10 }} tickLine={false} axisLine={false} unit="h" />
                <YAxis tick={{ fill: '#8b8b95', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatCompact} width={44} />
                <Tooltip
                  cursor={{ stroke: 'rgba(255,255,255,0.2)' }}
                  contentStyle={{
                    background: 'rgba(16,17,23,0.92)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  labelFormatter={(h) => `Hour ${String(h)}`}
                  formatter={(value) => [formatFull(Number(value)), 'Views gained']}
                />
                <Area type="monotone" dataKey="gained" stroke="var(--accent-b)" strokeWidth={2} fill="url(#velocityFill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
            {post.hourlyVelocity === null
              ? 'This platform does not expose hourly view data through its API.'
              : 'Not enough hours of data yet. Check back after the post is a few hours old.'}
          </p>
        )}
      </motion.div>

      <motion.div variants={item}>
        <KineticLink
          href={post.permalink}
          target="_blank"
          rel="noopener noreferrer"
          variant="primary"
          icon={<ExternalLink className="size-4" aria-hidden="true" />}
          label={post.mode === 'mock' ? 'Open profile (sample data)' : 'Open original post'}
        />
      </motion.div>
    </>
  );
}
