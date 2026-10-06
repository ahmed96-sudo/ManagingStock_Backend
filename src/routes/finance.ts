// Ledgers (cash / bank), client + supplier credits, supplier invoices and expenses.
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../prisma/db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { D, money, sum } from '../lib/money.js';
import { id, idParams, isoDate, positive } from '../lib/schemas.js';
import { like, today } from '../lib/utils.js';
import { currentUserId, requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { creditBalance, paidTotal, recordPayments, recordRemainderAsCredit } from '../services/payments.js';
import { paymentBody } from './documents.js';

const finance = [requireAuth, requireRole('manager', 'finance')] as const;

// ---------------- ledger ----------------
export const ledgerRouter = Router();
ledgerRouter.use(...finance);

const ledgerQuery = z.object({
  method: z.enum(['cash', 'cheque']).optional(),
  clientName: z.string().trim().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

// Cash = method cash, bank statement = method cheque. Amounts are signed (negative = money out).
ledgerRouter.get('/', validate({ query: ledgerQuery }), async (req, res) => {
  const { method, clientName, from, to, limit } = req.query as unknown as z.infer<typeof ledgerQuery>;
  let query = db.orm.public.Payments.orderBy((p) => p.id.desc());
  if (method) query = query.where({ method });
  if (clientName) {
    const clients = await db.orm.public.Clients.where((c) => c.name.ilike(like(clientName))).all();
    if (!clients.length) return void res.json([]);
    query = query.where((p) => p.clientId.in(clients.map((c) => c.id)));
  }
  // ponytail: date range filtered in JS after the query; move into SQL if the ledger gets large.
  const rows = (await query.limit(5000).all()).filter((p) => (!from || p.createdAt.slice(0, 10) >= from) && (!to || p.createdAt.slice(0, 10) <= to));
  const page = rows.slice(0, limit);
  const clientIds = [...new Set(page.map((p) => p.clientId).filter((x): x is number => x !== null))];
  const supplierIds = [...new Set(page.map((p) => p.supplierId).filter((x): x is number => x !== null))];
  const clients = clientIds.length ? await db.orm.public.Clients.where((c) => c.id.in(clientIds)).all() : [];
  const suppliers = supplierIds.length ? await db.orm.public.Suppliers.where((s) => s.id.in(supplierIds)).all() : [];
  res.json(
    page.map((p) => ({
      ...p,
      clientName: clients.find((c) => c.id === p.clientId)?.name ?? null,
      supplierName: suppliers.find((s) => s.id === p.supplierId)?.companyName ?? null,
    })),
  );
});

// ---------------- credits ----------------
export const creditsRouter = Router();
creditsRouter.use(...finance);

const creditsQuery = z.object({
  party: z.enum(['client', 'supplier']).optional(),
  name: z.string().trim().optional(),
  open: z.enum(['true']).optional(),
});

creditsRouter.get('/', validate({ query: creditsQuery }), async (req, res) => {
  const { party, name, open } = req.query as unknown as z.infer<typeof creditsQuery>;
  let credits = await db.orm.public.Credits.orderBy((c) => c.id.desc()).all();
  if (party === 'client') credits = credits.filter((c) => c.clientId !== null);
  if (party === 'supplier') credits = credits.filter((c) => c.supplierId !== null);
  const [clients, suppliers, payments] = await Promise.all([
    db.orm.public.Clients.all(),
    db.orm.public.Suppliers.all(),
    db.orm.public.CreditPayments.all(),
  ]);
  const rows = credits.map((c) => {
    const paid = sum(payments.filter((p) => p.creditId === c.id).map((p) => p.amount));
    return {
      ...c,
      partyName: c.clientId ? clients.find((x) => x.id === c.clientId)?.name : suppliers.find((x) => x.id === c.supplierId)?.companyName,
      paid: money(paid),
      balance: money(D(c.amount).minus(paid)),
    };
  });
  res.json(
    rows
      .filter((r) => !name || r.partyName?.toLowerCase().includes(name.toLowerCase()))
      .filter((r) => !open || D(r.balance).gt(0)),
  );
});

creditsRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const b = await creditBalance(Number(req.params['id']));
  if (!b) throw notFound('Credit');
  const payments = await db.orm.public.CreditPayments.where({ creditId: b.credit.id }).orderBy((p) => p.id.asc()).all();
  res.json({ ...b.credit, paid: money(b.paid), balance: money(b.balance), payments });
});

// A repayment: reduces the balance and writes the ledger row (money in from a client, out to a supplier).
creditsRouter.post('/:id/payments', validate({ params: idParams, body: paymentBody }), async (req, res) => {
  const creditId = Number(req.params['id']);
  const body = req.body as z.infer<typeof paymentBody>;
  const userId = currentUserId(req);
  const updated = await db.transaction(async (tx) => {
    const b = await creditBalance(creditId, tx);
    if (!b) throw notFound('Credit');
    if (D(body.amount).gt(b.balance)) throw new HttpError(409, `Amount exceeds the remaining balance (${money(b.balance)})`);
    await tx.orm.public.CreditPayments.create({ creditId, amount: money(body.amount), method: body.method });
    const c = b.credit;
    await recordPayments(
      tx,
      [body],
      {
        userId,
        ...(c.clientId !== null && { clientId: c.clientId }),
        ...(c.supplierId !== null && { supplierId: c.supplierId }),
        ...(c.documentId !== null && { documentId: c.documentId }),
        ...(c.supplierInvoiceId !== null && { supplierInvoiceId: c.supplierInvoiceId }),
      },
      c.supplierId !== null ? -1 : 1,
    );
    return creditBalance(creditId, tx);
  });
  res.status(201).json({ ...updated!.credit, paid: money(updated!.paid), balance: money(updated!.balance) });
});

// ---------------- supplier invoices ----------------
export const supplierInvoicesRouter = Router();
supplierInvoicesRouter.use(requireAuth, requireRole('manager', 'finance', 'stock'));

const supplierInvoiceBody = z.object({
  supplierId: id,
  reference: z.string().trim().min(1),
  invoiceDate: isoDate.optional(),
  total: positive,
  // cash / cheque parts paid now; the rest becomes a credit owed to the supplier
  payments: z.array(paymentBody).default([]),
});

supplierInvoicesRouter.post('/', validate({ body: supplierInvoiceBody }), async (req, res) => {
  const b = req.body as z.infer<typeof supplierInvoiceBody>;
  const userId = currentUserId(req);
  if (!(await db.orm.public.Suppliers.where({ id: b.supplierId }).first())) throw notFound('Supplier');
  const invoice = await db.transaction(async (tx) => {
    const inv = await tx.orm.public.SupplierInvoices.create({
      supplierId: b.supplierId,
      reference: b.reference,
      invoiceDate: b.invoiceDate ?? today(),
      total: money(b.total),
    });
    const owner = { userId, supplierId: b.supplierId, supplierInvoiceId: inv.id };
    await recordPayments(tx, b.payments, owner, -1);
    await recordRemainderAsCredit(tx, b.total, paidTotal(b.payments), owner);
    return inv;
  });
  res.status(201).json(invoice);
});

supplierInvoicesRouter.get('/', validate({ query: z.object({ supplierId: id.optional(), from: isoDate.optional(), to: isoDate.optional() }) }), async (req, res) => {
  const { supplierId, from, to } = req.query as { supplierId?: number; from?: string; to?: string };
  let query = db.orm.public.SupplierInvoices.orderBy((i) => i.id.desc());
  if (supplierId) query = query.where({ supplierId });
  if (from) query = query.where((i) => i.invoiceDate.gte(from));
  if (to) query = query.where((i) => i.invoiceDate.lte(to));
  res.json(await query.all());
});

supplierInvoicesRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const invoiceId = Number(req.params['id']);
  const inv = await db.orm.public.SupplierInvoices.where({ id: invoiceId }).first();
  if (!inv) throw notFound('Supplier invoice');
  const [payments, credits] = await Promise.all([
    db.orm.public.Payments.where({ supplierInvoiceId: invoiceId }).all(),
    db.orm.public.Credits.where({ supplierInvoiceId: invoiceId }).all(),
  ]);
  res.json({ ...inv, payments, credits });
});

// ---------------- expenses ----------------
export const expensesRouter = Router();
expensesRouter.use(...finance);

const expenseBody = z.object({ description: z.string().trim().min(1), amount: positive, expenseDate: isoDate.optional() });

expensesRouter.post('/', validate({ body: expenseBody }), async (req, res) => {
  const b = req.body as z.infer<typeof expenseBody>;
  res.status(201).json(
    await db.orm.public.Expenses.create({
      description: b.description,
      amount: money(b.amount),
      expenseDate: b.expenseDate ?? today(),
      userId: currentUserId(req),
    }),
  );
});

expensesRouter.get('/', validate({ query: z.object({ date: isoDate.optional(), from: isoDate.optional(), to: isoDate.optional() }) }), async (req, res) => {
  const { date, from, to } = req.query as { date?: string; from?: string; to?: string };
  let query = db.orm.public.Expenses.orderBy((e) => e.expenseDate.desc());
  if (date) query = query.where({ expenseDate: date });
  if (from) query = query.where((e) => e.expenseDate.gte(from));
  if (to) query = query.where((e) => e.expenseDate.lte(to));
  res.json(await query.all());
});

expensesRouter.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const row = await db.orm.public.Expenses.where({ id: Number(req.params['id']) }).delete();
  if (!row) throw notFound('Expense');
  res.status(204).end();
});
