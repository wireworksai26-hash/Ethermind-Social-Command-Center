'use client';

import { useQuery } from '@tanstack/react-query';
import { BellRing, Send, MessageCircle } from 'lucide-react';
import { apiGet } from '@/lib/client/api';

interface AlertsConfig {
  status: string;
  release: string;
  channels: Array<{ id: string; name: string; status: string }>;
  triggers: Array<{ id: string; name: string }>;
}

const ICONS: Record<string, typeof Send> = { telegram: Send, whatsapp: MessageCircle };

export function AlertsClient() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['alerts-config'],
    queryFn: () => apiGet<AlertsConfig>('/api/v1/integrations/alerts'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">Automated alerts</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Notifications for expiring tokens and viral posts are planned for {data?.release ?? 'v1.1'}. Nothing is sent externally in this release.
        </p>
      </div>

      {isError ? (
        <p role="alert" className="glass rounded-2xl p-6 text-sm">
          Alert settings could not be loaded.
        </p>
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <div className="skeleton h-36" />
          <div className="skeleton h-36" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.channels.map((c) => {
              const Icon = ICONS[c.id] ?? BellRing;
              return (
                <div key={c.id} className="glass rounded-2xl p-5">
                  <div className="flex items-start justify-between">
                    <span className="inline-flex size-10 items-center justify-center rounded-xl border border-line bg-white/[0.04]">
                      <Icon className="size-5 text-muted" aria-hidden="true" />
                    </span>
                    <span className="rounded-md border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-amber-200">
                      COMING SOON
                    </span>
                  </div>
                  <h2 className="mt-4 font-display text-base font-bold">{c.name}</h2>
                  <p className="mt-1 text-sm text-muted">Connect once available. Existing data collection is not affected.</p>
                </div>
              );
            })}
          </div>
          <section className="glass rounded-2xl p-5" aria-label="Planned triggers">
            <h2 className="font-display text-sm font-bold">Planned triggers</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {data.triggers.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-faint" aria-hidden="true" />
                  {t.name}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
