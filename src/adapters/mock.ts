import { addDays, diffDays, eachDate, toDateStr } from '@/lib/dates';
import type {
  AccountRef,
  ISocialPlatformAdapter,
  MediaType,
  NormalizedAccountMetrics,
  NormalizedPost,
  PlatformType,
} from './types';

function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(key: string): () => number {
  return mulberry32(xmur3(key));
}

interface PlatformProfile {
  followers: number;
  dailyGrowth: number;
  dailyReach: number;
  postsPerWeek: number;
  er: [number, number];
  viewsPerPost: number;
  reachRatio: number;
  saves: boolean;
  media: Array<[MediaType, number]>;
  profileUrl: (handle: string) => string;
}

const PROFILES: Record<PlatformType, PlatformProfile> = {
  instagram: {
    followers: 4200,
    dailyGrowth: 14,
    dailyReach: 3800,
    postsPerWeek: 4,
    er: [3.2, 5.8],
    viewsPerPost: 4200,
    reachRatio: 0.84,
    saves: true,
    media: [['REEL', 0.5], ['CAROUSEL', 0.3], ['IMAGE', 0.2]],
    profileUrl: (h) => `https://www.instagram.com/${h}/`,
  },
  facebook: {
    followers: 2100,
    dailyGrowth: 6,
    dailyReach: 1500,
    postsPerWeek: 3,
    er: [1.2, 2.6],
    viewsPerPost: 1800,
    reachRatio: 0.8,
    saves: true,
    media: [['VIDEO', 0.3], ['IMAGE', 0.5], ['REEL', 0.2]],
    profileUrl: (h) => `https://www.facebook.com/${h}`,
  },
  tiktok: {
    followers: 6800,
    dailyGrowth: 40,
    dailyReach: 9000,
    postsPerWeek: 5,
    er: [5, 9],
    viewsPerPost: 11000,
    reachRatio: 0.88,
    saves: true,
    media: [['VIDEO', 1]],
    profileUrl: (h) => `https://www.tiktok.com/@${h}`,
  },
  x: {
    followers: 1900,
    dailyGrowth: 5,
    dailyReach: 2600,
    postsPerWeek: 9,
    er: [1.5, 3.5],
    viewsPerPost: 2400,
    reachRatio: 1,
    saves: false,
    media: [['TWEET', 1]],
    profileUrl: (h) => `https://x.com/${h}`,
  },
  threads: {
    followers: 1300,
    dailyGrowth: 8,
    dailyReach: 1100,
    postsPerWeek: 6,
    er: [2.5, 5],
    viewsPerPost: 1500,
    reachRatio: 1,
    saves: false,
    media: [['TEXT_THREAD', 1]],
    profileUrl: (h) => `https://www.threads.net/@${h}`,
  },
};

const CAPTIONS: Record<string, string[]> = {
  ethermind: [
    'Behind the build: how MultiAgentCrisis routes an incident across five specialised agents.',
    'PactWarden case study: contract review cut from three days to forty minutes.',
    'DataMind turns a raw spreadsheet into a decision-ready brief.',
    'Memscroll AI remembers what you scrolled past so you do not have to.',
    'We design AI products people open twice. Here is the checklist we use.',
    'Why every AI engagement at Ethermind starts with a design sprint.',
    'Agent hand-offs fail in the seams. A short teardown of three we fixed this month.',
    'Prototype to production: what changed between our first and fourth agent pipeline.',
  ],
  klozer: [
    'Dynamic QRIS: every order gets its own QR, matched to payment automatically.',
    'Anti-Struk Palsu: how Klozer flags an edited payment proof in seconds.',
    'WhatsApp AI that answers your customers while you sleep.',
    'Free trial 14 hari, tanpa kartu kredit. Mulai dari nomor WhatsApp bisnismu.',
    'Dari chat ke pembayaran dalam satu percakapan.',
    'Pelanggan tanya stok jam 2 pagi? Biar Klozer yang jawab.',
    'Tiga tanda struk transfer palsu yang sering lolos dari mata manusia.',
    'Demo singkat: pesanan masuk, QRIS terbit, status lunas otomatis.',
  ],
  default: [
    'Weekly update from the team.',
    'A closer look at what we shipped this week.',
    'Notes from the studio.',
    'What we learned from our latest project.',
  ],
};

const EPOCH = '2025-01-01';

function pickWeighted<T>(items: Array<[T, number]>, r: number): T {
  let acc = 0;
  for (const [item, weight] of items) {
    acc += weight;
    if (r <= acc) return item;
  }
  return items[items.length - 1]![0];
}

function accountScale(account: AccountRef): number {
  return 0.7 + rngFor(`${account.id}:scale`)() * 0.7;
}

function syntheticPostId(account: AccountRef, day: string, index: number): string {
  return `mock_${account.id.slice(0, 8)}_${day}_${index}`;
}

/**
 * Seeded generator. Output depends only on account id and calendar date, so history is stable
 * across refreshes and grows by one realistic day every sync cycle.
 */
export class DeterministicMockAdapter implements ISocialPlatformAdapter {
  readonly mode = 'mock' as const;

  async syncAccountDailyMetrics(account: AccountRef, daysBack: number): Promise<NormalizedAccountMetrics[]> {
    const profile = PROFILES[account.platform];
    const scale = accountScale(account);
    const today = toDateStr(new Date());
    const totalDays = diffDays(EPOCH, today);

    let followers = Math.round(profile.followers * scale);
    const byDate = new Map<string, { followers: number; delta: number }>();
    for (let i = 0; i <= totalDays; i++) {
      const date = addDays(EPOCH, i);
      const delta = Math.round(profile.dailyGrowth * scale * (0.2 + 1.6 * rngFor(`${account.id}:${date}:g`)()));
      followers += delta;
      byDate.set(date, { followers, delta });
    }

    return eachDate(addDays(today, -(daysBack - 1)), today).map((date) => {
      const r = rngFor(`${account.id}:${date}:m`);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const weekdayFactor = weekday === 0 || weekday === 6 ? 0.78 : 1.05;
      const totalReach = Math.round(profile.dailyReach * scale * weekdayFactor * (0.7 + r() * 0.6));
      const f = byDate.get(date) ?? { followers, delta: 0 };
      return {
        date,
        followersCount: f.followers,
        followersDelta: f.delta,
        totalReach,
        totalImpressions: Math.round(totalReach * (1.2 + r() * 0.4)),
        profileViews: Math.round(totalReach * (0.04 + r() * 0.04)),
        engagementRate: Number((profile.er[0] + r() * (profile.er[1] - profile.er[0])).toFixed(3)),
      };
    });
  }

  async syncRecentPosts(account: AccountRef, limit: number): Promise<NormalizedPost[]> {
    const profile = PROFILES[account.platform];
    const scale = accountScale(account);
    const now = Date.now();
    const today = toDateStr(new Date());
    const captions = CAPTIONS[account.workspaceSlug] ?? CAPTIONS.default!;
    const posts: NormalizedPost[] = [];

    for (let back = 0; back < 120 && posts.length < limit; back++) {
      const day = addDays(today, -back);
      const dayRng = rngFor(`${account.id}:${day}:sched`);
      const perDay = profile.postsPerWeek / 7;
      const count = Math.floor(perDay) + (dayRng() < perDay - Math.floor(perDay) ? 1 : 0);

      for (let i = 0; i < count && posts.length < limit; i++) {
        const r = rngFor(`${account.id}:${day}:${i}:post`);
        const publishedAt = new Date(`${day}T00:00:00Z`);
        publishedAt.setUTCHours(2 + Math.floor(r() * 12), Math.floor(r() * 60));
        if (publishedAt.getTime() > now) continue;

        const ageHours = (now - publishedAt.getTime()) / 3_600_000;
        const maturity = 1 - Math.exp(-ageHours / 18);
        let finalViews = profile.viewsPerPost * scale * (0.45 + r() * 1.1);
        const spike = r() < 0.07;
        if (spike) finalViews *= 2.8 + r() * 2.4;

        const views = Math.round(finalViews * maturity);
        const reach = Math.round(views * (profile.reachRatio - r() * 0.06));
        const erTarget = (profile.er[0] + r() * (profile.er[1] - profile.er[0])) * (spike ? 1.25 : 1);
        const interactions = Math.round((reach * erTarget) / 100);
        const saveShare = profile.saves ? 0.07 : 0;
        const shareShare = 0.12;
        const commentShare = 0.08;
        const likes = Math.round(interactions * (1 - saveShare - shareShare - commentShare));
        const comments = Math.round(interactions * commentShare);
        const shares = Math.round(interactions * shareShare);
        const saves = Math.round(interactions * saveShare);

        const velocityHours = Math.min(48, Math.floor(ageHours));
        const velocity: number[] = [];
        for (let h = 1; h <= velocityHours; h++) {
          velocity.push(Math.round(finalViews * (1 - Math.exp(-h / 18))));
        }

        const id = syntheticPostId(account, day, i);
        posts.push({
          platformPostId: id,
          mediaType: pickWeighted(profile.media, r()),
          caption: captions[Math.floor(r() * captions.length)]!,
          permalink: `${profile.profileUrl(account.handle)}#${id}`,
          thumbnailUrl: null,
          publishedAt,
          viewsCount: views,
          reachCount: reach,
          likesCount: likes,
          commentsCount: comments,
          sharesCount: shares,
          savesCount: saves,
          engagementRate: reach > 0 ? Number((((likes + comments + shares + saves) / reach) * 100).toFixed(3)) : 0,
          hourlyVelocity: velocity,
        });
      }
    }
    return posts;
  }
}
