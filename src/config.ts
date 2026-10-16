import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

function int(name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  if (isProduction) throw new Error('JWT_SECRET is required when NODE_ENV=production');
  jwtSecret = randomBytes(32).toString('hex');
  console.warn('JWT_SECRET not set: using a random secret for this process');
} else if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

export const config = {
  isProduction,
  port: int('PORT', 3000),
  moviesDbPath: env.MOVIES_DB_PATH || 'db/movies.db',
  authDbPath: env.AUTH_DB_PATH || 'db/auth.db',
  redisUrl: env.REDIS_URL || undefined,
  cacheTtlSeconds: int('CACHE_TTL_SECONDS', 60),
  jwtSecret,
  jwtIssuer: env.JWT_ISSUER || 'movies-api',
  accessTokenTtlSeconds: int('ACCESS_TOKEN_TTL_SECONDS', 15 * 60),
  refreshTokenTtlSeconds: int('REFRESH_TOKEN_TTL_SECONDS', 30 * 24 * 60 * 60),
};
