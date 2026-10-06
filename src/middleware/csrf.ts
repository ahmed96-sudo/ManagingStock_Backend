import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';

// Synchronizer token: random value kept in the session, echoed by the frontend in X-CSRF-Token.
export const csrfToken = (req: Request) => (req.session.csrf ??= randomBytes(32).toString('hex'));

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const allowedOrigin = new URL(env.FRONTEND_URL).origin;

export const csrfProtect: RequestHandler = (req, _res, next) => {
  if (SAFE.has(req.method)) return next();

  // Browsers always send Origin on cross-site unsafe requests; reject anything not from our frontend.
  const origin = req.get('origin');
  if (origin && origin !== allowedOrigin) return next(new HttpError(403, 'Origin not allowed'));

  const sent = Buffer.from(req.get('x-csrf-token') ?? '');
  const expected = Buffer.from(req.session.csrf ?? '');
  if (!expected.length || sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
    return next(new HttpError(403, 'Invalid CSRF token'));
  }
  next();
};
