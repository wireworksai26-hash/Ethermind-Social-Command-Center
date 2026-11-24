import IORedis from 'ioredis';

const globalForRedis = globalThis as unknown as {
  __cacheRedis?: IORedis | null;
};

function baseOptions() {
  return {
    // Railway private networking resolves over IPv6; family 0 lets the OS pick either stack.
    family: 0,
    enableReadyCheck: true,
  } as const;
}

/** Client for caching: fails fast so a Redis outage degrades to uncached queries. */
export function getCacheRedis(): IORedis | null {
  if (globalForRedis.__cacheRedis !== undefined) return globalForRedis.__cacheRedis;
  const url = process.env.REDIS_URL;
  if (!url) {
    globalForRedis.__cacheRedis = null;
    return null;
  }
  const client = new IORedis(url, {
    ...baseOptions(),
    maxRetriesPerRequest: 1,
    commandTimeout: 1500,
  });
  client.on('error', (error) => console.warn('[redis:cache]', error.message));
  globalForRedis.__cacheRedis = client;
  return client;
}

/** BullMQ requires `maxRetriesPerRequest: null`, so it gets its own connection. */
export function createQueueConnection(): IORedis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = new IORedis(url, { ...baseOptions(), maxRetriesPerRequest: null });
  client.on('error', (error) => console.warn('[redis:queue]', error.message));
  return client;
}

const VERSION_KEY = 'cache:version';

export async function getOrSetCache<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
  const redis = getCacheRedis();
  if (!redis) return producer();
  try {
    const version = (await redis.get(VERSION_KEY)) ?? '0';
    const fullKey = `cache:v${version}:${key}`;
    const hit = await redis.get(fullKey);
    if (hit) return JSON.parse(hit) as T;
    const value = await producer();
    await redis.set(fullKey, JSON.stringify(value), 'EX', ttlSeconds);
    return value;
  } catch (error) {
    console.warn('[cache] falling back to uncached query:', (error as Error).message);
    return producer();
  }
}

/** Invalidates every cached aggregate at once by bumping the version prefix. */
export async function invalidateCache(): Promise<void> {
  const redis = getCacheRedis();
  if (!redis) return;
  try {
    await redis.incr(VERSION_KEY);
  } catch (error) {
    console.warn('[cache] invalidate failed:', (error as Error).message);
  }
}
