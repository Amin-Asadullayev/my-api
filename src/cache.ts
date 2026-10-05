import { Redis } from 'ioredis';
import { config } from './config.js';

export type CacheStatus = 'HIT' | 'MISS' | 'BYPASS';

const PREFIX = 'movies-api:';
const VERSION_KEY = `${PREFIX}movies:version`;

let redis: Redis | null = null;
let lastErrorLog = 0;

export function connectCache(): void {
  if (!config.redisUrl) {
    console.warn('REDIS_URL not set: caching disabled');
    return;
  }
  redis = new Redis(config.redisUrl, {
    
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
  });
  redis.on('error', (err) => {
    const now = Date.now();
    if (now - lastErrorLog > 30_000) {
      lastErrorLog = now;
      console.error(`Redis error (serving without cache): ${err.message}`);
    }
  });
}

export async function closeCache(): Promise<void> {
  if (redis) await redis.quit().catch(() => redis?.disconnect());
  redis = null;
}

/**
 * Read-through cache for movie reads. Keys embed a version number that every write bumps,
 * so a write invalidates all cached lists and items at once without scanning Redis;
 * stale versions simply expire through their TTL. Any Redis failure falls back to `load`.
 */
export async function cachedMovies<T>(
  key: string,
  load: () => T | Promise<T>,
): Promise<{ value: T; status: CacheStatus }> {
  if (!redis || config.cacheTtlSeconds === 0) return { value: await load(), status: 'BYPASS' };
  const client = redis;

  let fullKey: string;
  try {
    const version = (await client.get(VERSION_KEY)) ?? '0';
    fullKey = `${PREFIX}movies:v${version}:${key}`;
    const hit = await client.get(fullKey);
    if (hit !== null) return { value: JSON.parse(hit) as T, status: 'HIT' };
  } catch {
    return { value: await load(), status: 'BYPASS' };
  }

  const value = await load();
  await client.set(fullKey, JSON.stringify(value), 'EX', config.cacheTtlSeconds).catch(() => {});
  return { value, status: 'MISS' };
}

export async function invalidateMovies(): Promise<void> {
  if (!redis) return;
  await redis.incr(VERSION_KEY).catch(() => {});
}
