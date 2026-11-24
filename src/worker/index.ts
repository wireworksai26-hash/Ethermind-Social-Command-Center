import { Worker } from 'bullmq';
import { SYNC_QUEUE, getSyncQueue, type SyncJobData, type SyncJobName } from '@/lib/queue';
import { createQueueConnection } from '@/lib/redis';
import { refreshExpiringTokens, syncAccount, syncAllAccounts } from '@/lib/sync';

const TWO_HOURS = 2 * 60 * 60 * 1000;
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const connection = createQueueConnection();
  const queue = getSyncQueue();
  if (!connection || !queue) {
    throw new Error('REDIS_URL is required to run the worker');
  }

  // Scheduler ids double as job names: sync-all = metrics-ingestion (2h), refresh-tokens = meta-token-refresher (12h).
  await queue.upsertJobScheduler('sync-all', { every: TWO_HOURS }, { name: 'sync-all' });
  await queue.upsertJobScheduler('refresh-tokens', { every: TWELVE_HOURS }, { name: 'refresh-tokens' });

  const worker = new Worker<SyncJobData, void, SyncJobName>(
    SYNC_QUEUE,
    async (job) => {
      switch (job.name) {
        case 'sync-account': {
          if (!job.data.accountId) throw new Error('sync-account requires accountId');
          const result = await syncAccount(job.data.accountId);
          if (result.status === 'failed') throw new Error(result.error ?? 'Sync failed');
          return;
        }
        case 'sync-all': {
          const results = await syncAllAccounts();
          console.log(`[worker] sync-all: ${results.filter((r) => r.status === 'success').length}/${results.length} ok`);
          return;
        }
        case 'refresh-tokens': {
          const count = await refreshExpiringTokens();
          console.log(`[worker] refresh-tokens: ${count} refreshed`);
          return;
        }
      }
    },
    { connection, concurrency: 2 },
  );

  worker.on('failed', (job, error) => console.error(`[worker] job ${job?.name} failed:`, error.message));
  worker.on('ready', () => console.log('[worker] ready'));

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, closing`);
    await worker.close();
    await queue.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
