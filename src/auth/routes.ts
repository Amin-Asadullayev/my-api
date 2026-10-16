import argon2 from 'argon2';
import { eq, lt } from 'drizzle-orm';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { authDb, refreshTokens, users } from '../../db/index.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { requireAuth } from './middleware.js';
import { hashRefreshToken, newRefreshToken, signAccessToken, type AuthUser } from './tokens.js';

export const authRouter = Router();

const registerSchema = z.strictObject({
  username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_.-]+$/, 'Only letters, digits, _ . -'),
  password: z.string().min(8).max(128),
});

authRouter.post('/auth/register', async (req, res) => {
  const { username, password } = registerSchema.parse(req.body);
  const passwordHash = await argon2.hash(password);
  try {
    const user = authDb
      .insert(users)
      .values({ username: username.toLowerCase(), passwordHash, createdAt: Math.floor(Date.now() / 1000) })
      .returning({ id: users.id, username: users.username })
      .get();
    res.status(201).json(user);
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
    if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new HttpError(409, 'username_taken', 'That username is already registered');
    }
    throw err;
  }
});

function oauthError(res: Response, status: number, error: string, description: string): void {
  res.status(status).set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json({ error, error_description: description });
}

async function issueTokens(res: Response, user: AuthUser): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  authDb.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now)).run();
  const refresh = newRefreshToken();
  authDb
    .insert(refreshTokens)
    .values({ tokenHash: refresh.hash, userId: user.id, expiresAt: now + config.refreshTokenTtlSeconds })
    .run();
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json({
    access_token: await signAccessToken(user),
    token_type: 'Bearer',
    expires_in: config.accessTokenTtlSeconds,
    refresh_token: refresh.token,
  });
}

const dummyHash = argon2.hash('not-a-real-password');

const tokenRequestSchema = z.object({
  grant_type: z.string(),
  username: z.string().optional(),
  password: z.string().optional(),
  refresh_token: z.string().optional(),
});

authRouter.post('/oauth/token', async (req, res) => {
  const parsed = tokenRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return oauthError(res, 400, 'invalid_request', 'grant_type is required');
  const body = parsed.data;

  if (body.grant_type === 'password') {
    if (!body.username || !body.password) {
      return oauthError(res, 400, 'invalid_request', 'username and password are required');
    }
    const user = authDb.select().from(users).where(eq(users.username, body.username.trim().toLowerCase())).get();
    const valid = await argon2.verify(user?.passwordHash ?? (await dummyHash), body.password);
    if (!user || !valid) return oauthError(res, 400, 'invalid_grant', 'Invalid username or password');
    return issueTokens(res, { id: user.id, username: user.username });
  }

  if (body.grant_type === 'refresh_token') {
    if (!body.refresh_token) return oauthError(res, 400, 'invalid_request', 'refresh_token is required');
    const used = authDb
      .delete(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(body.refresh_token)))
      .returning()
      .get();
    if (!used || used.expiresAt < Math.floor(Date.now() / 1000)) {
      return oauthError(res, 400, 'invalid_grant', 'The refresh token is invalid or has expired');
    }
    const user = authDb.select().from(users).where(eq(users.id, used.userId)).get();
    if (!user) return oauthError(res, 400, 'invalid_grant', 'The refresh token is invalid or has expired');
    return issueTokens(res, { id: user.id, username: user.username });
  }

  return oauthError(res, 400, 'unsupported_grant_type', 'Supported grant types: password, refresh_token');
});

authRouter.post('/oauth/revoke', (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : undefined;
  if (token) authDb.delete(refreshTokens).where(eq(refreshTokens.tokenHash, hashRefreshToken(token))).run();
  res.status(200).end();
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json(req.user);
});
