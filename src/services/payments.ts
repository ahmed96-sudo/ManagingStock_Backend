import { db } from '../../prisma/db.js';
import { HttpError } from '../lib/errors.js';
import { D, money, sum } from '../lib/money.js';
import type { Dec } from '../lib/money.js';
import type { Tx } from './stock.js';

export type PaymentIn = {
  method: 'cash' | 'cheque';
  amount: string;
  chequeNumber?: string | undefined;
  bank?: string | undefined;
};

type Owner = {
  userId: number;
  clientId?: number | undefined;
  supplierId?: number | undefined;
  documentId?: number | undefined;
  supplierInvoiceId?: number | undefined;
};

const links = (o: Owner) => ({
  ...(o.clientId !== undefined && { clientId: o.clientId }),
  ...(o.supplierId !== undefined && { supplierId: o.supplierId }),
  ...(o.documentId !== undefined && { documentId: o.documentId }),
  ...(o.supplierInvoiceId !== undefined && { supplierInvoiceId: o.supplierInvoiceId }),
});

export const paidTotal = (payments: PaymentIn[]) => sum(payments.map((p) => p.amount));

// Writes one ledger row per payment. `direction` +1 = money in (sales), -1 = money out (purchases, refunds).
export async function recordPayments(tx: Tx, payments: PaymentIn[], o: Owner, direction: 1 | -1 = 1) {
  for (const p of payments) {
    if (p.method === 'cheque' && !p.chequeNumber) throw new HttpError(400, 'Cheque payments need a chequeNumber');
    await tx.orm.public.Payments.create({
      method: p.method,
      amount: money(D(p.amount).times(direction)),
      userId: o.userId,
      ...(p.chequeNumber && { chequeNumber: p.chequeNumber }),
      ...(p.bank && { bank: p.bank }),
      ...links(o),
    });
  }
}

// Whatever is not paid becomes a credit (money owed by the client / to the supplier).
export async function recordRemainderAsCredit(tx: Tx, total: Dec, paid: Dec, o: Owner) {
  const remainder = D(total).minus(paid);
  if (remainder.isNegative()) throw new HttpError(400, 'Payments exceed the total');
  if (remainder.isZero()) return null;
  if (o.clientId === undefined && o.supplierId === undefined) {
    throw new HttpError(400, 'A client is required when the total is not fully paid (credit)');
  }
  return tx.orm.public.Credits.create({ amount: money(remainder), ...links(o) });
}

export async function creditBalance(creditId: number, tx: Pick<Tx, 'orm'> | typeof db = db) {
  const credit = await tx.orm.public.Credits.where({ id: creditId }).first();
  if (!credit) return null;
  const paid = await tx.orm.public.CreditPayments.where({ creditId }).all();
  const paidSum = sum(paid.map((p) => p.amount));
  return { credit, paid: paidSum, balance: D(credit.amount).minus(paidSum) };
}
