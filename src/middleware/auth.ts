import type { RequestHandler } from 'express';
import { HttpError } from '../lib/errors.js';
import type { RoleName } from '../lib/schemas.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session.userId) return next(new HttpError(401, 'Not authenticated'));
  next();
};

// Admin always passes; list the other roles allowed on the route.
export const requireRole = (...allowed: RoleName[]): RequestHandler => (req, _res, next) => {
  const { userId, role } = req.session;
  if (!userId || !role) return next(new HttpError(401, 'Not authenticated'));
  if (role !== 'admin' && !allowed.includes(role)) return next(new HttpError(403, 'Forbidden'));
  next();
};

export const currentUserId = (req: { session: { userId?: number } }) => req.session.userId!;
