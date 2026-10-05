import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config.js';

const key = new TextEncoder().encode(config.jwtSecret);

export interface AuthUser {
  id: number;
  username: string;
}

export async function signAccessToken(user: AuthUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuer(config.jwtIssuer)
    .setIssuedAt(now)
    .setExpirationTime(now + config.accessTokenTtlSeconds)
    .sign(key);
}


export async function verifyAccessToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], issuer: config.jwtIssuer });
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || typeof payload.username !== 'string') throw new Error('bad claims');
  return { id, username: payload.username };
}


export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
