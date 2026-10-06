import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../prisma/db.js';
import { notFound } from '../lib/errors.js';
import { D, money, sum } from '../lib/money.js';
import { idParams, isoDate } from '../lib/schemas.js';
import { today } from '../lib/utils.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireRole('manager', 'finance'));

const SALES = ['invoice', 'delivery_note', 'uninvoiced'];

// Documents (with lines) of the sale types + credit notes inside [from, to].
async function salesBetween(from: string, to: string) {
  const docs = (await db.orm.public.Documents.where((d) => d.documentDate.gte(from)).where((d) => d.documentDate.lte(to)).all()).filter(
    (d) => SALES.includes(d.type) || d.type === 'credit_note',
  );
  const lines = docs.length ? await db.orm.public.DocumentLines.where((l) => l.documentId.in(docs.map((d) => d.id))).all() : [];
  return docs.map((d) => {
    const ls = lines.filter((l) => l.documentId === d.id);
    const sign = d.type === 'credit_note' ? -1 : 1;
    return {
      date: d.documentDate,
      sales: D(d.subtotal).times(sign), // revenue without TVA
      profit: sum(ls.map((l) => D(l.lineSubtotal).minus(D(l.quantity).times(l.unitCost)))).times(sign),
      units: sum(ls.map((l) => l.quantity)).times(sign),
    };
  });
}

const rangeQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });

// KPIs for the dashboard cards; defaults to the current month.
dashboardRouter.get('/summary', validate({ query: rangeQuery }), async (req, res) => {
  const q = req.query as { from?: string; to?: string };
  const from = q.from ?? `${today().slice(0, 8)}01`;
  const to = q.to ?? today();
  const rows = await salesBetween(from, to);
  const expenses = (await db.orm.public.Expenses.where((e) => e.expenseDate.gte(from)).where((e) => e.expenseDate.lte(to)).all()).map((e) => e.amount);
  const profit = sum(rows.map((r) => r.profit));
  res.json({
    from,
    to,
    totalSales: money(sum(rows.map((r) => r.sales))),
    unitsSold: sum(rows.map((r) => r.units)).toFixed(3),
    grossProfit: money(profit),
    expenses: money(sum(expenses)),
    netProfit: money(profit.minus(sum(expenses))),
  });
});

// Month-by-month profit and sales for the chart.
dashboardRouter.get('/chart', validate({ query: z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() }) }), async (req, res) => {
  const year = (req.query as { year?: number }).year ?? Number(today().slice(0, 4));
  const rows = await salesBetween(`${year}-01-01`, `${year}-12-31`);
  res.json(
    Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, '0');
      const inMonth = rows.filter((r) => r.date.slice(5, 7) === month);
      return { month: `${year}-${month}`, sales: money(sum(inMonth.map((r) => r.sales))), profit: money(sum(inMonth.map((r) => r.profit))) };
    }),
  );
});

// ---------------- notifications (low stock) ----------------
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth, requireRole('manager', 'stock', 'finance'));

notificationsRouter.get('/', validate({ query: z.object({ all: z.enum(['true']).optional() }) }), async (req, res) => {
  let query = db.orm.public.Notifications.orderBy((n) => n.id.desc());
  if (!(req.query as { all?: string }).all) query = query.where({ isRead: false });
  res.json(await query.limit(100).all());
});

notificationsRouter.patch('/:id/read', validate({ params: idParams }), async (req, res) => {
  const row = await db.orm.public.Notifications.where({ id: Number(req.params['id']) }).update({ isRead: true });
  if (!row) throw notFound('Notification');
  res.json(row);
});

notificationsRouter.post('/read-all', async (_req, res) => {
  await db.orm.public.Notifications.where({ isRead: false }).updateAll({ isRead: true });
  res.json({ ok: true });
});
