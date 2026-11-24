import { json, route } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = route(async () =>
  json({
    status: 'coming_soon',
    release: 'v1.1',
    channels: [
      { id: 'telegram', name: 'Telegram Bot Alert', status: 'coming_soon' },
      { id: 'whatsapp', name: 'WhatsApp Alert via Klozer Gateway', status: 'coming_soon' },
    ],
    triggers: [
      { id: 'token_expiring', name: 'OAuth token expiring or needs re-auth' },
      { id: 'viral_spike', name: 'Viral spike detected (over 2x account average)' },
    ],
  }),
);
