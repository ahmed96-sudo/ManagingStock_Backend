import { db } from '../../prisma/db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { D, money, qty } from '../lib/money.js';
import type { Dec } from '../lib/money.js';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type Movement = {
  type: 'purchase' | 'sale' | 'return' | 'adjust';
  userId: number;
  documentId?: number;
  unitCost?: Dec;
  unitPrice?: Dec;
};

// Changes a product's stock by `delta` (negative = out) and records the movement.
// Compare-and-swap on the current quantity: if another transaction changed the row meanwhile,
// the UPDATE matches nothing and we re-read, so concurrent sales can never oversell.
export async function adjustStock(tx: Tx, productId: number, delta: Dec, m: Movement) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const p = await tx.orm.public.Products.where({ id: productId }).first();
    if (!p) throw notFound(`Product ${productId}`);
    const next = D(p.quantity).plus(delta);
    if (next.isNegative()) {
      throw new HttpError(409, `Insufficient stock for "${p.name}" (available ${D(p.quantity).toString()})`);
    }
    const updated = await tx.orm.public.Products.where({ id: productId, quantity: p.quantity }).update({
      quantity: qty(next),
      updatedAt: new Date().toISOString(),
    });
    if (!updated) continue;

    await tx.orm.public.StockMovements.create({
      productId,
      type: m.type,
      quantity: qty(delta),
      unitCost: money(m.unitCost ?? p.purchasePrice),
      unitPrice: money(m.unitPrice ?? p.sellingPrice),
      userId: m.userId,
      ...(m.documentId !== undefined && { documentId: m.documentId }),
    });

    if (next.lte(p.minQtyAlert)) {
      const open = await tx.orm.public.Notifications.where({ productId, type: 'low_stock', isRead: false }).first();
      if (!open) {
        await tx.orm.public.Notifications.create({
          type: 'low_stock',
          productId,
          message: `Low stock: "${p.name}" has ${next.toString()} left (alert at ${D(p.minQtyAlert).toString()})`,
        });
      }
    }
    return updated;
  }
  throw new HttpError(409, 'Stock changed concurrently, please retry');
}
