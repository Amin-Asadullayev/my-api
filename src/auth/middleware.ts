import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors.js';
import { type AuthUser, verifyAccessToken } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Guards write routes: requires `Authorization: Bearer <access token>`. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '');
  if (!match) {
    res.set('WWW-Authenticate', 'Bearer');
    throw new HttpError(401, 'unauthorized', 'Missing bearer token');
  }
  try {
    req.user = await verifyAccessToken(match[1]!);
  } catch {
    res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
    throw new HttpError(401, 'invalid_token', 'The access token is invalid or has expired');
  }
  next();
}
