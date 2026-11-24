import { MetaGraphLiveAdapter } from './meta-live';
import { DeterministicMockAdapter } from './mock';
import type { AdapterMode, ISocialPlatformAdapter, PlatformType } from './types';

const mock = new DeterministicMockAdapter();
const metaLive = new MetaGraphLiveAdapter();

/** Platforms that have a live adapter implementation today. */
export const LIVE_CAPABLE: ReadonlySet<PlatformType> = new Set<PlatformType>(['instagram', 'facebook']);

/**
 * Routes an account to its adapter. Moving an account from mock to live is a data change
 * (mode + OAuth tokens); no UI or caller code changes.
 */
export function getAdapter(account: { platform: PlatformType; mode: AdapterMode }): ISocialPlatformAdapter {
  if (account.mode === 'live') {
    if (!LIVE_CAPABLE.has(account.platform)) {
      throw new Error(`No live adapter is available for ${account.platform} yet`);
    }
    return metaLive;
  }
  return mock;
}
