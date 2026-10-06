import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { db } from '../../prisma/db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { idParams, roles } from '../lib/schemas.js';
import { compact } from '../lib/utils.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole()); // admin only

const strip = ({ passwordHash: _p, ...u }: { passwordHash: string }) => u;

const patchBody = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.enum(roles).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

usersRouter.get('/', async (_req, res) => {
  const users = await db.orm.public.Users.orderBy((u) => u.id.asc()).all();
  res.json(users.map(strip));
});

usersRouter.patch('/:id', validate({ params: idParams, body: patchBody }), async (req, res) => {
  const id = Number(req.params['id']);
  const { password, ...rest } = req.body as z.infer<typeof patchBody>;
  if (id === req.session.userId && (rest.isActive === false || (rest.role && rest.role !== 'admin'))) {
    throw new HttpError(400, 'You cannot deactivate or demote yourself');
  }
  const data = compact({ ...rest, passwordHash: password ? await argon2.hash(password) : undefined });
  const user = await db.orm.public.Users.where({ id }).update(data);
  if (!user) throw notFound('User');
  res.json(strip(user));
});
