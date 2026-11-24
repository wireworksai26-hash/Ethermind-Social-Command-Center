import type { PlatformType } from '@/db/schema';

export type { PlatformType };
export type AdapterMode = 'live' | 'mock';
export type MediaType = 'REEL' | 'CAROUSEL' | 'IMAGE' | 'VIDEO' | 'TEXT_THREAD' | 'TWEET';

export interface NormalizedAccountMetrics {
  date: string; // YYYY-MM-DD
  followersCount: number;
  followersDelta: number;
  totalReach: number;
  totalImpressions: number;
  profileViews: number;
  engagementRate: number;
}

export interface NormalizedPost {
  platformPostId: string;
  mediaType: MediaType;
  caption: string;
  permalink: string;
  thumbnailUrl: string | null;
  publishedAt: Date;
  viewsCount: number;
  reachCount: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  engagementRate: number;
  /** Cumulative views per hour for the first 48 hours, or null if the platform does not expose it. */
  hourlyVelocity: number[] | null;
}

/** Everything an adapter needs to know about an account; tokens are decrypted by the caller. */
export interface AccountRef {
  id: string;
  platform: PlatformType;
  platformAccountId: string;
  handle: string;
  workspaceSlug: string;
  accessToken: string | null;
  refreshToken: string | null;
}

export interface ISocialPlatformAdapter {
  readonly mode: AdapterMode;
  syncAccountDailyMetrics(account: AccountRef, daysBack: number): Promise<NormalizedAccountMetrics[]>;
  syncRecentPosts(account: AccountRef, limit: number): Promise<NormalizedPost[]>;
  refreshAccessToken?(account: AccountRef): Promise<{
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
  }>;
}

export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly kind: 'rate_limited' | 'auth' | 'unknown' = 'unknown',
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}
