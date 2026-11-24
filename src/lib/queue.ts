import { Queue } from 'bullmq';
import { createQueueConnection } from './redis';

export const SYNC_QUEUE = 'ethermind-sync';

export type SyncJobName = 'sync-account' | 'sync-all' | 'refresh-tokens';

export interface SyncJobData {
  accountId?: string;
}

const globalForQueue = globalThis as unknown as { __syncQueue?: Queue<SyncJobData, void, SyncJobName> | null };

export function getSyncQueue(): Queue<SyncJobData, void, SyncJobName> | null {
  if (globalForQueue.__syncQueue !== undefined) return globalForQueue.__syncQueue;
  const connection = createQueueConnection();
  globalForQueue.__syncQueue = connection
    ? new Queue<SyncJobData, void, SyncJobName>(SYNC_QUEUE, {
        connection,
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 200, attempts: 2, backoff: { type: 'exponential', delay: 30_000 } },
      })
    : null;
  return globalForQueue.__syncQueue;
}
