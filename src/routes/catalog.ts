// Categories, suppliers, client groups and clients: plain CRUD.
import { Router } from 'express';
import { z } from 'zod';
import { or } from '@prisma/orm-postgres/orm-client';
import { db } from '../../prisma/db.js';
import { notFound } from '../lib/errors.js';
import { id, idParams } from '../lib/schemas.js';
import { compact, like } from '../lib/utils.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const text = z.string().trim().min(1);
const optText = z.string().trim().nullish().transform((v) => v ?? undefined);
const search = z.object({ q: z.string().trim().optional() });

// ---- categories (read: everyone, write: admin/manager/stock) ----
export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);
const categoryBody = z.object({ name: text });

categoriesRouter.get('/', async (_req, res) => {
  res.json(await db.orm.public.Categories.orderBy((c) => c.name.asc()).all());
});
categoriesRouter.post('/', requireRole('manager', 'stock'), validate({ body: categoryBody }), async (req, res) => {
  res.status(201).json(await db.orm.public.Categories.create(req.body));
});
categoriesRouter.patch('/:id', requireRole('manager', 'stock'), validate({ params: idParams, body: categoryBody }), async (req, res) => {
  const row = await db.orm.public.Categories.where({ id: Number(req.params['id']) }).update(req.body);
  if (!row) throw notFound('Category');
  res.json(row);
});
categoriesRouter.delete('/:id', requireRole('manager', 'stock'), validate({ params: idParams }), async (req, res) => {
  const row = await db.orm.public.Categories.where({ id: Number(req.params['id']) }).delete();
  if (!row) throw notFound('Category');
  res.status(204).end();
});

// ---- suppliers (admin/manager/finance/stock) ----
export const suppliersRouter = Router();
suppliersRouter.use(requireAuth, requireRole('manager', 'finance', 'stock'));
const supplierBody = z.object({
  companyName: text,
  contactName: text,
  phone1: text,
  phone2: optText,
  fax: optText,
  address: optText,
  activities: optText,
});

suppliersRouter.get('/', validate({ query: search.extend({ activity: z.string().trim().optional() }) }), async (req, res) => {
  const { q, activity } = req.query as { q?: string; activity?: string };
  let query = db.orm.public.Suppliers.orderBy((s) => s.companyName.asc());
  if (q) query = query.where((s) => s.companyName.ilike(like(q)));
  if (activity) query = query.where((s) => s.activities.ilike(like(activity)));
  res.json(await query.all());
});
suppliersRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const row = await db.orm.public.Suppliers.where({ id: Number(req.params['id']) }).first();
  if (!row) throw notFound('Supplier');
  res.json(row);
});
suppliersRouter.post('/', validate({ body: supplierBody }), async (req, res) => {
  res.status(201).json(await db.orm.public.Suppliers.create(compact(req.body) as z.infer<typeof supplierBody>));
});
suppliersRouter.patch('/:id', validate({ params: idParams, body: supplierBody.partial() }), async (req, res) => {
  const row = await db.orm.public.Suppliers.where({ id: Number(req.params['id']) }).update(compact(req.body));
  if (!row) throw notFound('Supplier');
  res.json(row);
});
suppliersRouter.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const row = await db.orm.public.Suppliers.where({ id: Number(req.params['id']) }).delete();
  if (!row) throw notFound('Supplier');
  res.status(204).end();
});

// ---- client groups + clients (read: everyone, write: admin/manager/finance/cashier) ----
export const clientGroupsRouter = Router();
clientGroupsRouter.use(requireAuth);
const groupBody = z.object({ name: text });

clientGroupsRouter.get('/', async (_req, res) => {
  res.json(await db.orm.public.ClientGroups.orderBy((g) => g.name.asc()).all());
});
clientGroupsRouter.post('/', requireRole('manager', 'finance', 'cashier'), validate({ body: groupBody }), async (req, res) => {
  res.status(201).json(await db.orm.public.ClientGroups.create(req.body));
});
clientGroupsRouter.patch('/:id', requireRole('manager', 'finance', 'cashier'), validate({ params: idParams, body: groupBody }), async (req, res) => {
  const row = await db.orm.public.ClientGroups.where({ id: Number(req.params['id']) }).update(req.body);
  if (!row) throw notFound('Group');
  res.json(row);
});
clientGroupsRouter.delete('/:id', requireRole('manager', 'finance'), validate({ params: idParams }), async (req, res) => {
  const row = await db.orm.public.ClientGroups.where({ id: Number(req.params['id']) }).delete();
  if (!row) throw notFound('Group');
  res.status(204).end();
});

export const clientsRouter = Router();
clientsRouter.use(requireAuth);
const clientBody = z.object({
  name: text,
  phone: optText,
  email: optText,
  ice: optText,
  address: optText,
  groupId: id.nullish().transform((v) => v ?? undefined),
});
const writers = requireRole('manager', 'finance', 'cashier');

clientsRouter.get('/', validate({ query: search.extend({ groupId: id.optional() }) }), async (req, res) => {
  const { q, groupId } = req.query as { q?: string; groupId?: number };
  let query = db.orm.public.Clients.orderBy((c) => c.name.asc());
  if (q) query = query.where((c) => or(c.name.ilike(like(q)), c.ice.ilike(like(q))));
  if (groupId) query = query.where({ groupId });
  res.json(await query.all());
});
clientsRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const row = await db.orm.public.Clients.where({ id: Number(req.params['id']) }).first();
  if (!row) throw notFound('Client');
  res.json(row);
});
clientsRouter.post('/', writers, validate({ body: clientBody }), async (req, res) => {
  res.status(201).json(await db.orm.public.Clients.create(compact(req.body) as z.infer<typeof clientBody> & { name: string }));
});
clientsRouter.patch('/:id', writers, validate({ params: idParams, body: clientBody.partial() }), async (req, res) => {
  const row = await db.orm.public.Clients.where({ id: Number(req.params['id']) }).update(compact(req.body));
  if (!row) throw notFound('Client');
  res.json(row);
});
clientsRouter.delete('/:id', requireRole('manager', 'finance'), validate({ params: idParams }), async (req, res) => {
  const row = await db.orm.public.Clients.where({ id: Number(req.params['id']) }).delete();
  if (!row) throw notFound('Client');
  res.status(204).end();
});
