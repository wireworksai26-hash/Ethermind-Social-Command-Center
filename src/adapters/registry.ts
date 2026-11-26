import { MetaGraphLiveAdapter } from './meta-live';
import { DeterministicMockAdapter } from './mock';
import { TikTokLiveAdapter } from './tiktok-live';
import type { AdapterMode, ISocialPlatformAdapter, PlatformType } from './types';
import { XLiveAdapter } from './x-live';

const mock = new DeterministicMockAdapter();
const metaLive = new MetaGraphLiveAdapter();
const tiktokLive = new TikTokLiveAdapter();
const xLive = new XLiveAdapter();

const LIVE_ADAPTERS: Partial<Record<PlatformType, ISocialPlatformAdapter>> = {
  instagram: metaLive,
  facebook: metaLive,
  tiktok: tiktokLive,
  x: xLive,
};

/** Platforms that have a live adapter + OAuth implementation today. */
export const LIVE_CAPABLE: ReadonlySet<PlatformType> = new Set<PlatformType>(
  Object.keys(LIVE_ADAPTERS) as PlatformType[],
);

/**
 * Routes an account to its adapter. Moving an account from mock to live is a data change
 * (mode + OAuth tokens); no UI or caller code changes.
 */
export function getAdapter(account: { platform: PlatformType; mode: AdapterMode }): ISocialPlatformAdapter {
  if (account.mode === 'live') {
    const adapter = LIVE_ADAPTERS[account.platform];
    if (!adapter) {
      throw new Error(`No live adapter is available for ${account.platform} yet`);
    }
    return adapter;
  }
  return mock;
}
