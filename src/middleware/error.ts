import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
};

const pgCode = (err: unknown): string | undefined => {
  const e = err as { sqlState?: unknown; code?: unknown; cause?: unknown } | undefined;
  if (typeof e?.sqlState === 'string') return e.sqlState;
  if (typeof e?.code === 'string') return e.code;
  return e?.cause ? pgCode(e.cause) : undefined;
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) {
    return void res.status(400).json({ error: 'Validation failed', issues: err.issues });
  }
  const code = pgCode(err);
  if (code === '23505') return void res.status(409).json({ error: 'Already exists' });
  if (code === '23503' || code === '23001') return void res.status(409).json({ error: 'Referenced by other records' });
  if (code === '23514') return void res.status(409).json({ error: 'Value violates a database rule' });
  if (err?.type === 'entity.parse.failed') return void res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
