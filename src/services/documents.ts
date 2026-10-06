import { db } from '../../prisma/db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { D, Decimal, money, qty, rate, sum } from '../lib/money.js';
import { today } from '../lib/utils.js';
import { creditBalance, paidTotal, recordPayments, recordRemainderAsCredit } from './payments.js';
import type { PaymentIn } from './payments.js';
import { adjustStock } from './stock.js';
import type { Tx } from './stock.js';

export type DocType = 'invoice' | 'draft' | 'delivery_note' | 'uninvoiced' | 'credit_note';
export type SaleType = Exclude<DocType, 'credit_note'>;

const PREFIX: Record<DocType, string> = {
  invoice: 'INV',
  draft: 'DRF',
  delivery_note: 'BL',
  uninvoiced: 'UNV',
  credit_note: 'CN',
};

// Types that take goods out of stock (a draft is only a quote).
const moves = (t: DocType) => t === 'invoice' || t === 'delivery_note' || t === 'uninvoiced';

export type LineIn = { productId: number; quantity: string; discountPercent?: string | undefined; tvaRate?: string | undefined };
export type CreateIn = {
  type: SaleType;
  clientId?: number | undefined;
  documentDate?: string | undefined;
  note?: string | undefined;
  lines: LineIn[];
  payments?: PaymentIn[] | undefined;
};

type Line = {
  productId: number;
  description: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  discountPercent: string;
  tvaRate: string;
};

// Pure maths for one line: discount first, then TVA on the discounted amount, each rounded to cents.
export function computeLine(l: { quantity: string; unitPrice: string; discountPercent: string; tvaRate: string }) {
  const gross = D(l.quantity).times(l.unitPrice);
  const lineSubtotal = D(money(gross.times(D(100).minus(l.discountPercent)).div(100)));
  const tvaAmount = D(money(lineSubtotal.times(l.tvaRate).div(100)));
  return { gross, lineSubtotal, tvaAmount, lineTotal: lineSubtotal.plus(tvaAmount) };
}

export function computeTotals(lines: Parameters<typeof computeLine>[0][]) {
  const c = lines.map(computeLine);
  return {
    subtotal: sum(c.map((x) => x.lineSubtotal)),
    discountTotal: sum(c.map((x) => x.gross.minus(x.lineSubtotal))),
    tvaTotal: sum(c.map((x) => x.tvaAmount)),
    total: sum(c.map((x) => x.lineTotal)),
    lines: c,
  };
}

const yearOf = (date: string) => Number(date.slice(0, 4));

// Counter rows are created outside the transaction so a lost unique-race can't poison it.
async function ensureCounter(type: DocType, year: number) {
  if (await db.orm.public.DocumentCounters.where({ type, year }).first()) return;
  try {
    await db.orm.public.DocumentCounters.create({ type, year });
  } catch {
    // created concurrently by another request: fine
  }
}

async function nextNumber(tx: Tx, type: DocType, year: number) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const c = await tx.orm.public.DocumentCounters.where({ type, year }).first();
    if (!c) throw new HttpError(500, 'Document counter missing');
    const updated = await tx.orm.public.DocumentCounters.where({ id: c.id, lastSeq: c.lastSeq }).update({ lastSeq: c.lastSeq + 1 });
    if (updated) {
      const seq = c.lastSeq + 1;
      return { seq, number: `${PREFIX[type]}-${year}-${String(seq).padStart(4, '0')}` };
    }
  }
  throw new HttpError(409, 'Could not allocate a document number, please retry');
}

async function loadLines(input: LineIn[], type: DocType): Promise<Line[]> {
  if (!input.length) throw new HttpError(400, 'A document needs at least one line');
  const ids = [...new Set(input.map((l) => l.productId))];
  const products = await db.orm.public.Products.where((p) => p.id.in(ids)).all();
  const defaultTva = (await db.orm.public.CompanyInfo.first())?.defaultTvaRate ?? '0';
  return input.map((l) => {
    const p = products.find((x) => x.id === l.productId);
    if (!p) throw notFound(`Product ${l.productId}`);
    // Prices always come from the product, never from the client.
    const price = type === 'draft' && D(p.quotePrice).gt(0) ? p.quotePrice : p.sellingPrice;
    return {
      productId: p.id,
      description: p.name,
      quantity: l.quantity,
      unitPrice: price,
      unitCost: p.purchasePrice,
      discountPercent: l.discountPercent ?? '0',
      tvaRate: l.tvaRate ?? defaultTva,
    };
  });
}

async function insertLines(tx: Tx, documentId: number, lines: Line[]) {
  for (const l of lines) {
    const c = computeLine(l);
    await tx.orm.public.DocumentLines.create({
      documentId,
      productId: l.productId,
      description: l.description,
      quantity: qty(l.quantity),
      unitPrice: money(l.unitPrice),
      unitCost: money(l.unitCost),
      discountPercent: rate(l.discountPercent),
      tvaRate: rate(l.tvaRate),
      lineSubtotal: money(c.lineSubtotal),
      tvaAmount: money(c.tvaAmount),
      lineTotal: money(c.lineTotal),
    });
  }
}

async function takeStock(tx: Tx, lines: Line[], userId: number, documentId: number) {
  // Merge repeated products so the availability check sees the full quantity.
  const byProduct = new Map<number, Line[]>();
  for (const l of lines) byProduct.set(l.productId, [...(byProduct.get(l.productId) ?? []), l]);
  for (const [productId, ls] of byProduct) {
    const first = ls[0]!;
    await adjustStock(tx, productId, sum(ls.map((l) => l.quantity)).negated(), {
      type: 'sale',
      userId,
      documentId,
      unitCost: first.unitCost,
      unitPrice: first.unitPrice,
    });
  }
}

async function requireInvoiceClient(clientId: number | undefined) {
  const client = clientId ? await db.orm.public.Clients.where({ id: clientId }).first() : null;
  if (!client) throw new HttpError(400, 'An invoice needs a client');
  if (!client.ice) throw new HttpError(400, 'The client must have an ICE number to be invoiced');
}

export async function createDocument(userId: number, input: CreateIn) {
  const { type } = input;
  const payments = input.payments ?? [];
  if (type === 'draft' && payments.length) throw new HttpError(400, 'A draft cannot have payments');
  if (type === 'invoice') await requireInvoiceClient(input.clientId);
  if (input.clientId && !(await db.orm.public.Clients.where({ id: input.clientId }).first())) throw notFound('Client');

  const lines = await loadLines(input.lines, type);
  const totals = computeTotals(lines);
  const documentDate = input.documentDate ?? today();
  const year = yearOf(documentDate);
  await ensureCounter(type, year);

  const id = await db.transaction(async (tx) => {
    const { seq, number } = await nextNumber(tx, type, year);
    const doc = await tx.orm.public.Documents.create({
      type,
      year,
      seq,
      number,
      userId,
      documentDate,
      subtotal: money(totals.subtotal),
      discountTotal: money(totals.discountTotal),
      tvaTotal: money(totals.tvaTotal),
      total: money(totals.total),
      ...(input.clientId && { clientId: input.clientId }),
      ...(input.note && { note: input.note }),
    });
    await insertLines(tx, doc.id, lines);
    if (moves(type)) {
      await takeStock(tx, lines, userId, doc.id);
      const owner = { userId, documentId: doc.id, clientId: input.clientId };
      await recordPayments(tx, payments, owner);
      await recordRemainderAsCredit(tx, totals.total, paidTotal(payments), owner);
    }
    return doc.id;
  });
  return getDocument(id);
}

export async function getDocument(id: number) {
  const doc = await db.orm.public.Documents.where({ id }).first();
  if (!doc) throw notFound('Document');
  const [lines, payments, credits, client] = await Promise.all([
    db.orm.public.DocumentLines.where({ documentId: id }).orderBy((l) => l.id.asc()).all(),
    db.orm.public.Payments.where({ documentId: id }).orderBy((p) => p.id.asc()).all(),
    db.orm.public.Credits.where({ documentId: id }).all(),
    doc.clientId ? db.orm.public.Clients.where({ id: doc.clientId }).first() : null,
  ]);
  const creditInfo = await Promise.all(
    credits.map(async (c) => {
      const b = await creditBalance(c.id);
      return { ...c, paid: money(b!.paid), balance: money(b!.balance) };
    }),
  );
  return { ...doc, client, lines, payments, credits: creditInfo };
}

export type ListFilter = {
  type?: DocType | undefined;
  clientName?: string | undefined;
  clientId?: number | undefined;
  date?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit: number;
  offset: number;
};

export async function listDocuments(f: ListFilter, like: (s: string) => string) {
  let query = db.orm.public.Documents.orderBy([(d) => d.documentDate.desc(), (d) => d.id.desc()]);
  if (f.type) query = query.where({ type: f.type });
  if (f.clientId) query = query.where({ clientId: f.clientId });
  if (f.date) query = query.where({ documentDate: f.date });
  if (f.from) query = query.where((d) => d.documentDate.gte(f.from!));
  if (f.to) query = query.where((d) => d.documentDate.lte(f.to!));
  if (f.clientName) {
    const name = f.clientName;
    const clients = await db.orm.public.Clients.where((c) => c.name.ilike(like(name))).all();
    if (!clients.length) return [];
    query = query.where((d) => d.clientId.in(clients.map((c) => c.id)));
  }
  const docs = await query.offset(f.offset).limit(f.limit).all();
  const ids = [...new Set(docs.map((d) => d.clientId).filter((x): x is number => x !== null))];
  const clients = ids.length ? await db.orm.public.Clients.where((c) => c.id.in(ids)).all() : [];
  return docs.map((d) => ({ ...d, clientName: clients.find((c) => c.id === d.clientId)?.name ?? null }));
}

// draft / delivery note / un-invoiced sale -> invoice, in place, with a new INV number.
export async function convertToInvoice(userId: number, id: number, payments: PaymentIn[] = []) {
  const doc = await db.orm.public.Documents.where({ id }).first();
  if (!doc) throw notFound('Document');
  if (doc.type === 'invoice' || doc.type === 'credit_note') throw new HttpError(409, `A ${doc.type.replace('_', ' ')} cannot be converted`);
  if (doc.type !== 'draft' && payments.length) throw new HttpError(400, 'Payments were already recorded on this document');
  await requireInvoiceClient(doc.clientId ?? undefined);

  const date = doc.type === 'draft' ? today() : doc.documentDate;
  const year = yearOf(date);
  await ensureCounter('invoice', year);

  await db.transaction(async (tx) => {
    const { seq, number } = await nextNumber(tx, 'invoice', year);
    await tx.orm.public.Documents.where({ id }).update({ type: 'invoice', year, seq, number, documentDate: date });
    if (doc.type === 'draft') {
      const lines = await tx.orm.public.DocumentLines.where({ documentId: id }).all();
      await takeStock(
        tx,
        lines.map((l) => ({ ...l, discountPercent: l.discountPercent, tvaRate: l.tvaRate })),
        userId,
        id,
      );
      const owner = { userId, documentId: id, clientId: doc.clientId ?? undefined };
      await recordPayments(tx, payments, owner);
      await recordRemainderAsCredit(tx, doc.total, paidTotal(payments), owner);
    }
  });
  return getDocument(id);
}

export async function deleteDocument(userId: number, id: number) {
  const doc = await db.orm.public.Documents.where({ id }).first();
  if (!doc) throw notFound('Document');
  if (doc.type === 'credit_note') throw new HttpError(409, 'Credit notes cannot be deleted');
  if (await db.orm.public.Documents.where({ relatedDocumentId: id }).first()) {
    throw new HttpError(409, 'This document has returns and cannot be deleted');
  }
  await db.transaction(async (tx) => {
    if (moves(doc.type)) {
      const lines = await tx.orm.public.DocumentLines.where({ documentId: id }).all();
      for (const l of lines) await adjustStock(tx, l.productId, l.quantity, { type: 'adjust', userId, documentId: id });
    }
    await tx.orm.public.Payments.where({ documentId: id }).delete();
    await tx.orm.public.Credits.where({ documentId: id }).delete();
    await tx.orm.public.Documents.where({ id }).delete();
  });
}

export type ReturnIn = {
  relatedDocumentId: number;
  lines: { productId: number; quantity: string }[];
  refundMethod: 'cash' | 'cheque' | 'credit';
  chequeNumber?: string | undefined;
  bank?: string | undefined;
  note?: string | undefined;
};

// Credit note against an invoice / delivery note / un-invoiced sale: restocks and refunds.
export async function createReturn(userId: number, input: ReturnIn) {
  const related = await db.orm.public.Documents.where({ id: input.relatedDocumentId }).first();
  if (!related) throw notFound('Document');
  if (!moves(related.type)) throw new HttpError(409, 'Returns can only be made against a sale');
  if (input.refundMethod === 'credit' && !related.clientId) throw new HttpError(400, 'Crediting needs a client');

  const soldLines = await db.orm.public.DocumentLines.where({ documentId: related.id }).all();
  const previous = await db.orm.public.Documents.where({ relatedDocumentId: related.id, type: 'credit_note' }).all();
  const returnedLines = previous.length
    ? await db.orm.public.DocumentLines.where((l) => l.documentId.in(previous.map((p) => p.id))).all()
    : [];

  // One credit-note line per requested product, priced like the original sale line.
  const merged = new Map<number, string>();
  for (const l of input.lines) merged.set(l.productId, sum([merged.get(l.productId) ?? 0, l.quantity]).toString());
  const lines: Line[] = [];
  for (const [productId, quantity] of merged) {
    const sold = soldLines.filter((l) => l.productId === productId);
    if (!sold.length) throw new HttpError(400, `Product ${productId} is not on the original document`);
    const left = sum(sold.map((l) => l.quantity)).minus(sum(returnedLines.filter((l) => l.productId === productId).map((l) => l.quantity)));
    if (D(quantity).gt(left)) throw new HttpError(409, `Only ${left.toString()} of "${sold[0]!.description}" can still be returned`);
    const s = sold[0]!;
    lines.push({ productId, description: s.description, quantity, unitPrice: s.unitPrice, unitCost: s.unitCost, discountPercent: s.discountPercent, tvaRate: s.tvaRate });
  }

  const totals = computeTotals(lines);
  const date = today();
  const year = yearOf(date);
  await ensureCounter('credit_note', year);

  const id = await db.transaction(async (tx) => {
    const { seq, number } = await nextNumber(tx, 'credit_note', year);
    const note = await tx.orm.public.Documents.create({
      type: 'credit_note',
      year,
      seq,
      number,
      userId,
      documentDate: date,
      relatedDocumentId: related.id,
      subtotal: money(totals.subtotal),
      discountTotal: money(totals.discountTotal),
      tvaTotal: money(totals.tvaTotal),
      total: money(totals.total),
      ...(related.clientId && { clientId: related.clientId }),
      ...(input.note && { note: input.note }),
    });
    await insertLines(tx, note.id, lines);
    for (const l of lines) {
      await adjustStock(tx, l.productId, l.quantity, { type: 'return', userId, documentId: note.id, unitCost: l.unitCost, unitPrice: l.unitPrice });
    }

    let toRefund = totals.total;
    if (input.refundMethod === 'credit' && related.clientId) {
      // Reduce what the client still owes: this document's credits first, then the oldest others.
      const credits = (await tx.orm.public.Credits.where({ clientId: related.clientId }).orderBy((c) => c.id.asc()).all()).sort(
        (a, b) => Number(b.documentId === related.id) - Number(a.documentId === related.id),
      );
      for (const c of credits) {
        if (toRefund.lte(0)) break;
        const b = await creditBalance(c.id, tx);
        if (!b || b.balance.lte(0)) continue;
        const take = Decimal.min(b.balance, toRefund);
        await tx.orm.public.CreditPayments.create({ creditId: c.id, amount: money(take) });
        toRefund = toRefund.minus(take);
      }
    }
    // Cash/cheque refund, or whatever the client's credit could not absorb.
    if (toRefund.gt(0)) {
      const method = input.refundMethod === 'cheque' ? 'cheque' : 'cash';
      const p: PaymentIn = { method, amount: toRefund.toString(), chequeNumber: input.chequeNumber, bank: input.bank };
      await recordPayments(tx, [p], { userId, documentId: note.id, clientId: related.clientId ?? undefined }, -1);
    }
    return note.id;
  });
  return getDocument(id);
}
