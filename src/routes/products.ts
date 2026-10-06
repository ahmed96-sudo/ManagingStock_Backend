import { Router } from 'express';
import { z } from 'zod';
import { or } from '@prisma/orm-postgres/orm-client';
import { db } from '../../prisma/db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { money, qty, D } from '../lib/money.js';
import { decimal, id, idParams, positive } from '../lib/schemas.js';
import { compact, like } from '../lib/utils.js';
import { currentUserId, requireAuth, requireRole } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { adjustStock } from '../services/stock.js';

export const productsRouter = Router();
productsRouter.use(requireAuth);
const writers = requireRole('manager', 'stock');

const text = z.string().trim().min(1);
const optText = z.string().trim().nullish().transform((v) => v ?? undefined);
const units = ['kg', 'm', 'unit'] as const;

const createBody = z.object({
  barcode: text,
  reference: text,
  name: text,
  description: optText,
  unit: z.enum(units).default('unit'),
  packaging: optText,
  quantity: decimal.default('0'), // opening stock
  minQtyAlert: decimal.default('0'),
  quotePrice: decimal.default('0'),
  purchasePrice: decimal,
  sellingPrice: decimal,
  categoryId: id,
  supplierId: id.nullish().transform((v) => v ?? undefined),
});
const patchBody = createBody.omit({ quantity: true }).partial();

const listQuery = z.object({
  q: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  categoryId: id.optional(),
  lowStock: z.enum(['true']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const prices = (b: { quotePrice?: string; purchasePrice?: string; sellingPrice?: string; minQtyAlert?: string }) => ({
  ...(b.quotePrice !== undefined && { quotePrice: money(b.quotePrice) }),
  ...(b.purchasePrice !== undefined && { purchasePrice: money(b.purchasePrice) }),
  ...(b.sellingPrice !== undefined && { sellingPrice: money(b.sellingPrice) }),
  ...(b.minQtyAlert !== undefined && { minQtyAlert: qty(b.minQtyAlert) }),
});

productsRouter.get('/', validate({ query: listQuery }), async (req, res) => {
  const { q, barcode, categoryId, lowStock, limit, offset } = req.query as unknown as z.infer<typeof listQuery>;
  let query = db.orm.public.Products.orderBy((p) => p.name.asc());
  if (q) query = query.where((p) => or(p.name.ilike(like(q)), p.barcode.ilike(like(q)), p.reference.ilike(like(q))));
  if (barcode) query = query.where({ barcode });
  if (categoryId) query = query.where({ categoryId });
  let rows = await query.offset(offset).limit(limit).all();
  // quantity <= minQtyAlert compares two columns; done here (small tables).
  if (lowStock) rows = rows.filter((p) => D(p.quantity).lte(p.minQtyAlert));
  res.json(rows);
});

// Barcode OR reference lookup used by the POS screen.
productsRouter.get('/lookup/:code', async (req, res) => {
  const code = String(req.params['code']);
  const p = await db.orm.public.Products.where((p) => or(p.barcode.eq(code), p.reference.eq(code))).first();
  if (!p) throw notFound('Product');
  res.json(p);
});

productsRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const p = await db.orm.public.Products.where({ id: Number(req.params['id']) }).first();
  if (!p) throw notFound('Product');
  res.json(p);
});

productsRouter.post('/', writers, validate({ body: createBody }), async (req, res) => {
  const b = req.body as z.infer<typeof createBody>;
  const userId = currentUserId(req);
  const product = await db.transaction(async (tx) => {
    const created = await tx.orm.public.Products.create({
      barcode: b.barcode,
      reference: b.reference,
      name: b.name,
      unit: b.unit,
      categoryId: b.categoryId,
      quantity: qty(0),
      minQtyAlert: qty(b.minQtyAlert),
      quotePrice: money(b.quotePrice),
      purchasePrice: money(b.purchasePrice),
      sellingPrice: money(b.sellingPrice),
      ...compact({ description: b.description, packaging: b.packaging, supplierId: b.supplierId }),
    });
    if (D(b.quantity).gt(0)) {
      return adjustStock(tx, created.id, b.quantity, { type: 'purchase', userId });
    }
    return created;
  });
  res.status(201).json(product);
});

productsRouter.patch('/:id', writers, validate({ params: idParams, body: patchBody }), async (req, res) => {
  const { quotePrice, purchasePrice, sellingPrice, minQtyAlert, ...rest } = req.body as z.infer<typeof patchBody>;
  const p = await db.orm.public.Products.where({ id: Number(req.params['id']) }).update({
    ...compact(rest),
    ...prices({ quotePrice, purchasePrice, sellingPrice, minQtyAlert } as never),
    updatedAt: new Date().toISOString(),
  });
  if (!p) throw notFound('Product');
  res.json(p);
});

// Adds stock; the movement keeps the purchase price history. New prices are optional.
const restockBody = z.object({
  quantity: positive,
  purchasePrice: decimal.optional(),
  sellingPrice: decimal.optional(),
  quotePrice: decimal.optional(),
});
productsRouter.post('/:id/restock', writers, validate({ params: idParams, body: restockBody }), async (req, res) => {
  const productId = Number(req.params['id']);
  const b = req.body as z.infer<typeof restockBody>;
  const userId = currentUserId(req);
  const product = await db.transaction(async (tx) => {
    const current = await tx.orm.public.Products.where({ id: productId }).first();
    if (!current) throw notFound('Product');
    const priceChange = prices(b);
    if (Object.keys(priceChange).length) await tx.orm.public.Products.where({ id: productId }).update(priceChange);
    return adjustStock(tx, productId, b.quantity, {
      type: 'purchase',
      userId,
      unitCost: b.purchasePrice ?? current.purchasePrice,
      unitPrice: b.sellingPrice ?? current.sellingPrice,
    });
  });
  res.json(product);
});

productsRouter.get('/:id/movements', validate({ params: idParams }), async (req, res) => {
  res.json(
    await db.orm.public.StockMovements.where({ productId: Number(req.params['id']) })
      .orderBy((m) => m.id.desc())
      .limit(200)
      .all(),
  );
});

productsRouter.post('/:id/image', writers, imageUpload, async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Send the image in the "image" field');
  const p = await db.orm.public.Products.where({ id: Number(req.params['id']) }).update({ imagePath: req.file.filename });
  if (!p) throw notFound('Product');
  res.json(p);
});

productsRouter.delete('/:id', writers, validate({ params: idParams }), async (req, res) => {
  const p = await db.orm.public.Products.where({ id: Number(req.params['id']) }).delete();
  if (!p) throw notFound('Product');
  res.status(204).end();
});
