import { Router } from 'express';
import argon2 from 'argon2';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../../prisma/db.js';
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';
import { roles } from '../lib/schemas.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfToken } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';

export const authRouter = Router();

// Call once at startup (and after logout) to get the token to send as X-CSRF-Token.
authRouter.get('/csrf', (req, res) => void res.json({ csrfToken: csrfToken(req) }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: { error: 'Too many attempts, try again later' },
});

const registerBody = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8),
  role: z.enum(roles).default('cashier'),
});

const loginBody = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1),
});

const publicUser = (u: { id: number; name: string; email: string; role: string; isActive: boolean }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
});

// TEMP: open registration (accepts any role) so the first admins can be created.
// When done: comment this block out and uncomment the admin-only block below.
authRouter.post('/register', limiter, validate({ body: registerBody }), async (req, res) => {
  const { name, email, password, role } = req.body as z.infer<typeof registerBody>;
  const user = await db.orm.public.Users.create({
    name,
    email,
    role,
    passwordHash: await argon2.hash(password),
  });
  res.status(201).json(publicUser(user));
});

// Admin-only registration (enable once the admins exist):
// import { requireRole } from '../middleware/auth.js';
// authRouter.post('/register', requireAuth, requireRole('admin'), validate({ body: registerBody }), async (req, res) => {
//   const { name, email, password, role } = req.body as z.infer<typeof registerBody>;
//   const user = await db.orm.public.Users.create({
//     name,
//     email,
//     role,
//     passwordHash: await argon2.hash(password),
//   });
//   res.status(201).json(publicUser(user));
// });

// Verified against when the email is unknown, so response time doesn't reveal which emails exist.
const dummyHash = await argon2.hash('not-a-real-password');

authRouter.post('/login', limiter, validate({ body: loginBody }), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginBody>;
  const user = await db.orm.public.Users.where({ email }).first();
  const ok = await argon2.verify(user?.passwordHash ?? dummyHash, password);
  if (!user || !ok || !user.isActive) throw new HttpError(401, 'Invalid email or password');

  // New session id on login (prevents session fixation).
  await new Promise<void>((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.userId = user.id;
  req.session.role = user.role;
  const token = csrfToken(req); // fresh token for the new session
  await new Promise<void>((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
  res.json({ ...publicUser(user), csrfToken: token });
});

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await db.orm.public.Users.where({ id: req.session.userId! }).first();
  if (!user || !user.isActive) throw new HttpError(401, 'Not authenticated');
  res.json({ ...publicUser(user), csrfToken: csrfToken(req) });
});
