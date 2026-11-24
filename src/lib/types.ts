import type { PlatformType } from '@/db/schema';

export type Platform = PlatformType;
export type PlatformFilter = Platform | 'all';

export interface KpiValue {
  value: number;
  previous: number;
  /** Percentage change vs the previous period; null when the previous value is zero. */
  deltaPct: number | null;
}

export interface SeriesPoint {
  date: string;
  total: number;
  platforms: Partial<Record<Platform, number>>;
  brands: Record<string, number>;
}

export interface OverviewResponse {
  range: { from: string; to: string };
  kpis: {
    reach: KpiValue;
    engagementRate: KpiValue;
    followerGrowth: KpiValue;
    contentCount: KpiValue;
  };
  series: SeriesPoint[];
  brands: Array<{ slug: string; name: string }>;
  hasData: boolean;
}

export interface PostRow {
  id: string;
  platform: Platform;
  mediaType: string;
  caption: string;
  permalink: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  viewsCount: number;
  reachCount: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  engagementRate: number;
  isViralSpike: boolean;
  accountHandle: string;
  workspaceSlug: string;
  workspaceName: string;
  mode: 'live' | 'mock';
}

export interface PostsResponse {
  items: PostRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PostDetailResponse extends PostRow {
  hourlyVelocity: number[] | null;
  accountDisplayName: string;
  accountAverageEngagementRate: number;
  accountAverageViews: number;
}

export type TokenHealth = 'healthy' | 'expiring_soon' | 'needs_reauth' | 'not_applicable';

export interface AccountRow {
  id: string;
  workspaceSlug: string;
  workspaceName: string;
  platform: Platform;
  mode: 'live' | 'mock';
  handle: string;
  displayName: string;
  status: 'active' | 'expiring_soon' | 'disconnected' | 'rate_limited';
  tokenHealth: TokenHealth;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  liveCapable: boolean;
}

export interface AccountsResponse {
  accounts: AccountRow[];
  canManage: boolean;
  canSync: boolean;
  metaConfigured: boolean;
}

export interface TeamResponse {
  workspaces: Array<{ id: string; name: string; slug: string }>;
  members: Array<{
    userId: string;
    name: string;
    email: string;
    isSuperAdmin: boolean;
    memberships: Array<{ workspaceId: string; workspaceSlug: string; role: string }>;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    workspaceIds: string[];
    createdAt: string;
    expiresAt: string;
    expired: boolean;
  }>;
}
