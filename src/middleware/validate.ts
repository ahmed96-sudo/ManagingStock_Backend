import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType };

// Parses and replaces req.body / req.query / req.params; ZodError is mapped to 400 by the error handler.
export const validate = (s: Schemas): RequestHandler => (req, _res, next) => {
  if (s.body) req.body = s.body.parse(req.body);
  if (s.params) Object.assign(req.params, s.params.parse(req.params));
  if (s.query) Object.defineProperty(req, 'query', { value: s.query.parse(req.query), writable: true });
  next();
};
