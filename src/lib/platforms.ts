import type { Platform } from './types';

export const PLATFORM_META: Record<Platform, { label: string; short: string; color: string }> = {
  instagram: { label: 'Instagram', short: 'IG', color: '#E1306C' },
  facebook: { label: 'Facebook', short: 'FB', color: '#1877F2' },
  tiktok: { label: 'TikTok', short: 'TT', color: '#00F2FE' },
  x: { label: 'X', short: 'X', color: '#E4E4E7' },
  threads: { label: 'Threads', short: 'TH', color: '#A855F7' },
};

export const PLATFORM_ORDER: Platform[] = ['instagram', 'facebook', 'tiktok', 'x', 'threads'];

export const BRAND_COLORS: Record<string, { primary: string; secondary: string }> = {
  ethermind: { primary: '#4F46E5', secondary: '#3B82F6' },
  klozer: { primary: '#10B981', secondary: '#06B6D4' },
};

export const FALLBACK_THEME = { primary: '#4F46E5', secondary: '#10B981' };

export const MEDIA_LABEL: Record<string, string> = {
  REEL: 'Reel',
  VIDEO: 'Video',
  CAROUSEL: 'Carousel',
  IMAGE: 'Image',
  TEXT_THREAD: 'Thread',
  TWEET: 'Post',
};
