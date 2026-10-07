import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { resetDb, closePool, loginAs } from './helpers.js';
import { computeLine, computeTotals } from '../src/services/documents.js';

vi.mock('../src/services/mailer.js', () => ({ sendMail: vi.fn(async () => ({})) }));
const { sendMail } = await import('../src/services/mailer.js');

beforeEach(resetDb);
afterAll(closePool);

const api = '/api';
const year = new Date().getFullYear();

async function setup() {
  const admin = await loginAs('admin');
  const stock = await loginAs('stock');
  const cashier = await loginAs('cashier');
  const finance = await loginAs('finance');
  const cat = (await stock.post(`${api}/categories`).send({ name: 'Tools' })).body;
  const mk = async (barcode: string, quantity: number) =>
    (
      await stock
        .post(`${api}/products`)
        .send({ barcode, reference: `R-${barcode}`, name: `Item ${barcode}`, purchasePrice: 6, sellingPrice: 10, quotePrice: 12, quantity, minQtyAlert: 2, categoryId: cat.id })
        .expect(201)
    ).body;
  const p1 = await mk('A', 10);
  const p2 = await mk('B', 5);
  const client = (await cashier.post(`${api}/clients`).send({ name: 'Alice', ice: 'ICE1', email: 'alice@test.local' }).expect(201)).body;
  const noIce = (await cashier.post(`${api}/clients`).send({ name: 'Bob' }).expect(201)).body;
  const stockOf = async (id: number) => (await stock.get(`${api}/products/${id}`)).body.quantity as string;
  return { admin, stock, cashier, finance, p1, p2, client, noIce, stockOf };
}

describe('line maths', () => {
  it('applies discount first, then TVA, rounded to cents', () => {
    const l = computeLine({ quantity: '2', unitPrice: '10.00', discountPercent: '10', tvaRate: '20' });
    expect(l.lineSubtotal.toFixed(2)).toBe('18.00');
    expect(l.tvaAmount.toFixed(2)).toBe('3.60');
    expect(l.lineTotal.toFixed(2)).toBe('21.60');
  });
  it('supports per-line TVA rates and fractional quantities', () => {
    const t = computeTotals([
      { quantity: '1.5', unitPrice: '10.00', discountPercent: '0', tvaRate: '0' },
      { quantity: '1', unitPrice: '100.00', discountPercent: '0', tvaRate: '7.5' },
    ]);
    expect(t.subtotal.toFixed(2)).toBe('115.00');
    expect(t.tvaTotal.toFixed(2)).toBe('7.50');
    expect(t.total.toFixed(2)).toBe('122.50');
  });
});

describe('creating documents', () => {
  it('creates an invoice with stock, payment, credit and sequential numbers', async () => {
    const s = await setup();
    const res = await s.cashier
      .post(`${api}/documents`)
      .send({
        type: 'invoice',
        clientId: s.client.id,
        lines: [{ productId: s.p1.id, quantity: 2, discountPercent: 10, tvaRate: 20 }],
        payments: [{ method: 'cash', amount: 10 }],
      })
      .expect(201);
    expect(res.body.number).toBe(`INV-${year}-0001`);
    expect(res.body.total).toBe('21.60');
    expect(res.body.lines[0].unitCost).toBe('6.00'); // cost snapshot -> profit is a query
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.credits[0]).toMatchObject({ amount: '11.60', balance: '11.60' });
    expect(await s.stockOf(s.p1.id)).toBe('8.000');

    const second = await s.cashier
      .post(`${api}/documents`)
      .send({ type: 'invoice', clientId: s.client.id, lines: [{ productId: s.p1.id, quantity: 1, tvaRate: 0 }], payments: [{ method: 'cheque', amount: 10, chequeNumber: 'CH1', bank: 'ACME' }] })
      .expect(201);
    expect(second.body.number).toBe(`INV-${year}-0002`);
    expect(second.body.credits).toHaveLength(0);
  });

  it('ignores prices sent by the client', async () => {
    const s = await setup();
    const res = await s.cashier
      .post(`${api}/documents`)
      .send({ type: 'uninvoiced', lines: [{ productId: s.p1.id, quantity: 1, unitPrice: 0.01, tvaRate: 0 }], payments: [{ method: 'cash', amount: 10 }] })
      .expect(201);
    expect(res.body.total).toBe('10.00');
  });

  it('requires a client with an ICE for invoices, and a client for credit', async () => {
    const s = await setup();
    const line = [{ productId: s.p1.id, quantity: 1, tvaRate: 0 }];
    await s.cashier.post(`${api}/documents`).send({ type: 'invoice', lines: line }).expect(400);
    await s.cashier.post(`${api}/documents`).send({ type: 'invoice', clientId: s.noIce.id, lines: line }).expect(400);
    await s.cashier.post(`${api}/documents`).send({ type: 'uninvoiced', lines: line }).expect(400); // unpaid, no client
    await s.cashier.post(`${api}/documents`).send({ type: 'uninvoiced', clientId: s.noIce.id, lines: line }).expect(201); // credit
    await s.cashier.post(`${api}/documents`).send({ type: 'invoice', clientId: s.client.id, lines: line, payments: [{ method: 'cash', amount: 50 }] }).expect(400); // overpaid
  });

  it('rolls everything back when one line lacks stock', async () => {
    const s = await setup();
    const res = await s.cashier
      .post(`${api}/documents`)
      .send({
        type: 'uninvoiced',
        clientId: s.client.id,
        lines: [
          { productId: s.p1.id, quantity: 3, tvaRate: 0 },
          { productId: s.p2.id, quantity: 99, tvaRate: 0 },
        ],
      })
      .expect(409);
    expect(res.body.error).toMatch(/Insufficient stock/);
    expect(await s.stockOf(s.p1.id)).toBe('10.000');
    expect((await s.admin.get(`${api}/documents`)).body).toHaveLength(0);
  });

  it('never oversells under concurrent requests', async () => {
    const s = await setup();
    const sale = () =>
      s.cashier.post(`${api}/documents`).send({ type: 'uninvoiced', clientId: s.client.id, lines: [{ productId: s.p1.id, quantity: 6, tvaRate: 0 }] });
    const results = await Promise.all([sale(), sale(), sale()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await s.stockOf(s.p1.id)).toBe('4.000');
  });

  it('creates a low-stock notification', async () => {
    const s = await setup();
    await s.cashier.post(`${api}/documents`).send({ type: 'uninvoiced', clientId: s.client.id, lines: [{ productId: s.p2.id, quantity: 4, tvaRate: 0 }] }).expect(201);
    const n = await s.stock.get(`${api}/notifications`).expect(200);
    expect(n.body[0].message).toMatch(/Low stock/);
  });

  it('keeps drafts away from stock and converts them to invoices', async () => {
    const s = await setup();
    const draft = (
      await s.cashier.post(`${api}/documents`).send({ type: 'draft', clientId: s.client.id, lines: [{ productId: s.p1.id, quantity: 3, tvaRate: 0 }] }).expect(201)
    ).body;
    expect(draft.number).toBe(`DRF-${year}-0001`);
    expect(draft.total).toBe('36.00'); // quote price
    expect(await s.stockOf(s.p1.id)).toBe('10.000');
    await s.cashier.post(`${api}/documents/${draft.id}/convert`).send({}).expect(403); // cashiers cannot convert
    const inv = await s.finance.post(`${api}/documents/${draft.id}/convert`).send({ payments: [{ method: 'cash', amount: 36 }] }).expect(200);
    expect(inv.body).toMatchObject({ type: 'invoice', number: `INV-${year}-0001` });
    expect(await s.stockOf(s.p1.id)).toBe('7.000');
    await s.finance.post(`${api}/documents/${draft.id}/convert`).send({}).expect(409); // already an invoice
  });

  it('converts a delivery note without touching stock again', async () => {
    const s = await setup();
    const bl = (
      await s.cashier.post(`${api}/documents`).send({ type: 'delivery_note', clientId: s.client.id, lines: [{ productId: s.p1.id, quantity: 2, tvaRate: 0 }] }).expect(201)
    ).body;
    expect(bl.number).toBe(`BL-${year}-0001`);
    expect(await s.stockOf(s.p1.id)).toBe('8.000');
    const inv = await s.finance.post(`${api}/documents/${bl.id}/convert`).send({}).expect(200);
    expect(inv.body.type).toBe('invoice');
    expect(inv.body.credits).toHaveLength(1);
    expect(await s.stockOf(s.p1.id)).toBe('8.000');
  });
});

describe('searching, pdf and email', () => {
  it('filters by client name, type and date', async () => {
    const s = await setup();
    const line = [{ productId: s.p1.id, quantity: 1, tvaRate: 0 }];
    await s.cashier.post(`${api}/documents`).send({ type: 'invoice', clientId: s.client.id, lines: line, payments: [{ method: 'cash', amount: 10 }] }).expect(201);
    await s.cashier.post(`${api}/documents`).send({ type: 'uninvoiced', clientId: s.noIce.id, lines: line }).expect(201);
    const byName = await s.cashier.get(`${api}/documents?clientName=ali`).expect(200);
    expect(byName.body).toHaveLength(1);
    expect(byName.body[0].clientName).toBe('Alice');
    expect((await s.cashier.get(`${api}/documents?type=uninvoiced`)).body).toHaveLength(1);
    const day = new Date().toISOString().slice(0, 10);
    expect((await s.cashier.get(`${api}/documents?date=${day}`)).body).toHaveLength(2);
    expect((await s.cashier.get(`${api}/documents?date=1999-01-01`)).body).toHaveLength(0);
    await s.stock.get(`${api}/documents`).expect(403);
  });

  it('renders a PDF and emails it', async () => {
    const s = await setup();
    await s.admin.put(`${api}/company`).send({ companyName: 'Acme', phoneNumber: '1', address: 'Main st' }).expect(200);
    const doc = (await s.cashier.post(`${api}/documents`).send({ type: 'invoice', clientId: s.client.id, lines: [{ productId: s.p1.id, quantity: 1, tvaRate: 0 }] }).expect(201)).body;
    const pdf = await s.cashier.get(`${api}/documents/${doc.id}/pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    await s.cashier.post(`${api}/documents/${doc.id}/email`).send({}).expect(200);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice@test.local' }));
    await s.cashier.post(`${api}/documents/${doc.id}/email`).send({ to: 'not-an-email' }).expect(400);
  });
});

describe('returns and deletion', () => {
  async function sold() {
    const s = await setup();
    const inv = (
      await s.cashier.post(`${api}/documents`).send({ type: 'invoice', clientId: s.client.id, lines: [{ productId: s.p1.id, quantity: 5, tvaRate: 0 }], payments: [{ method: 'cash', amount: 20 }] }).expect(201)
    ).body; // total 50, paid 20, credit 30
    return { s, inv };
  }

  it('returns goods against the client credit first, restocking', async () => {
    const { s, inv } = await sold();
    const cn = await s.finance.post(`${api}/returns`).send({ relatedDocumentId: inv.id, lines: [{ productId: s.p1.id, quantity: 2 }], refundMethod: 'credit' }).expect(201);
    expect(cn.body).toMatchObject({ type: 'credit_note', number: `CN-${year}-0001`, total: '20.00' });
    expect(await s.stockOf(s.p1.id)).toBe('7.000');
    const after = await s.finance.get(`${api}/documents/${inv.id}`).expect(200);
    expect(after.body.credits[0].balance).toBe('10.00'); // 30 - 20
    expect(cn.body.payments).toHaveLength(0); // all absorbed by the credit, no cash out
  });

  it('refunds the part credit cannot absorb in cash (negative ledger row)', async () => {
    const { s, inv } = await sold();
    const cn = await s.finance.post(`${api}/returns`).send({ relatedDocumentId: inv.id, lines: [{ productId: s.p1.id, quantity: 5 }], refundMethod: 'credit' }).expect(201);
    expect(cn.body.payments).toHaveLength(1);
    expect(cn.body.payments[0]).toMatchObject({ method: 'cash', amount: '-20.00' }); // 50 - 30 credit
  });

  it('refuses to return more than was sold', async () => {
    const { s, inv } = await sold();
    await s.finance.post(`${api}/returns`).send({ relatedDocumentId: inv.id, lines: [{ productId: s.p1.id, quantity: 4 }], refundMethod: 'cash' }).expect(201);
    const over = await s.finance.post(`${api}/returns`).send({ relatedDocumentId: inv.id, lines: [{ productId: s.p1.id, quantity: 2 }], refundMethod: 'cash' }).expect(409);
    expect(over.body.error).toMatch(/Only 1/);
    await s.finance.post(`${api}/returns`).send({ relatedDocumentId: inv.id, lines: [{ productId: s.p2.id, quantity: 1 }], refundMethod: 'cash' }).expect(400);
    await s.cashier.post(`${api}/returns`).send({ relatedDocumentId: inv.id, lines: [{ productId: s.p1.id, quantity: 1 }], refundMethod: 'cash' }).expect(403);
  });

  it('deleting a sale restocks and removes its payments and credits; documents with returns are protected', async () => {
    const { s, inv } = await sold();
    expect(await s.stockOf(s.p1.id)).toBe('5.000');
    await s.cashier.delete(`${api}/documents/${inv.id}`).expect(403);
    await s.finance.delete(`${api}/documents/${inv.id}`).expect(204);
    expect(await s.stockOf(s.p1.id)).toBe('10.000');
    expect((await s.finance.get(`${api}/ledger?method=cash`)).body).toHaveLength(0);

    const inv2 = (await s.cashier.post(`${api}/documents`).send({ type: 'uninvoiced', clientId: s.client.id, lines: [{ productId: s.p1.id, quantity: 1, tvaRate: 0 }] }).expect(201)).body;
    await s.finance.post(`${api}/returns`).send({ relatedDocumentId: inv2.id, lines: [{ productId: s.p1.id, quantity: 1 }], refundMethod: 'cash' }).expect(201);
    await s.finance.delete(`${api}/documents/${inv2.id}`).expect(409);
  });
});
