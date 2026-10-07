import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { resetDb, closePool, loginAs } from './helpers.js';

beforeEach(resetDb);
afterAll(closePool);

const api = '/api';
const day = new Date().toISOString().slice(0, 10);
const year = new Date().getFullYear();

async function setup() {
  const admin = await loginAs('admin');
  const stock = await loginAs('stock');
  const cashier = await loginAs('cashier');
  const finance = await loginAs('finance');
  const cat = (await stock.post(`${api}/categories`).send({ name: 'Tools' })).body;
  const product = (
    await stock
      .post(`${api}/products`)
      .send({ barcode: 'A', reference: 'R', name: 'Item', purchasePrice: 6, sellingPrice: 10, quantity: 100, categoryId: cat.id })
      .expect(201)
  ).body;
  const client = (await cashier.post(`${api}/clients`).send({ name: 'Alice', ice: 'ICE1' }).expect(201)).body;
  const supplier = (await stock.post(`${api}/suppliers`).send({ companyName: 'Supply Co', contactName: 'Sam', phone1: '1', activities: 'Hardware' }).expect(201)).body;
  return { admin, stock, cashier, finance, product, client, supplier };
}

describe('client credits and ledgers', () => {
  async function creditSale() {
    const s = await setup();
    const doc = (
      await s.cashier
        .post(`${api}/documents`)
        .send({ type: 'invoice', clientId: s.client.id, lines: [{ productId: s.product.id, quantity: 10, tvaRate: 0 }], payments: [{ method: 'cash', amount: 40 }] })
        .expect(201)
    ).body; // total 100, paid 40, credit 60
    return { s, doc, credit: doc.credits[0] };
  }

  it('lists credits with balances and searches by client name', async () => {
    const { s } = await creditSale();
    const list = await s.finance.get(`${api}/credits?party=client&name=ali&open=true`).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ partyName: 'Alice', amount: '60.00', paid: '0.00', balance: '60.00' });
    expect((await s.finance.get(`${api}/credits?name=zzz`)).body).toHaveLength(0);
    await s.cashier.get(`${api}/credits`).expect(403);
  });

  it('takes partial repayments, writes the ledger and refuses overpayment', async () => {
    const { s, credit } = await creditSale();
    const r1 = await s.finance.post(`${api}/credits/${credit.id}/payments`).send({ method: 'cheque', amount: 25, chequeNumber: 'CH9', bank: 'ACME' }).expect(201);
    expect(r1.body.balance).toBe('35.00');
    await s.finance.post(`${api}/credits/${credit.id}/payments`).send({ method: 'cash', amount: 36 }).expect(409);
    await s.finance.post(`${api}/credits/${credit.id}/payments`).send({ method: 'cheque', amount: 5 }).expect(400); // cheque number needed
    const detail = await s.finance.get(`${api}/credits/${credit.id}`).expect(200);
    expect(detail.body.payments).toHaveLength(1);

    const bank = await s.finance.get(`${api}/ledger?method=cheque&clientName=alice`).expect(200);
    expect(bank.body).toHaveLength(1);
    expect(bank.body[0]).toMatchObject({ amount: '25.00', chequeNumber: 'CH9', clientName: 'Alice' });
    const cash = await s.finance.get(`${api}/ledger?method=cash&from=${day}&to=${day}`).expect(200);
    expect(cash.body).toHaveLength(1); // the 40 paid with the sale
    expect((await s.finance.get(`${api}/ledger?method=cash&from=1999-01-01&to=1999-12-31`)).body).toHaveLength(0);
    await s.stock.get(`${api}/ledger`).expect(403);
  });
});

describe('supplier invoices', () => {
  it('records cash/cheque payments as money out and the rest as supplier credit, then repays', async () => {
    const s = await setup();
    const inv = await s.stock
      .post(`${api}/supplier-invoices`)
      .send({ supplierId: s.supplier.id, reference: 'SI-1', total: 500, payments: [{ method: 'cash', amount: 100 }, { method: 'cheque', amount: 150, chequeNumber: 'C1' }] })
      .expect(201);
    const detail = await s.stock.get(`${api}/supplier-invoices/${inv.body.id}`).expect(200);
    expect(detail.body.payments.map((p: { amount: string }) => p.amount).sort()).toEqual(['-100.00', '-150.00']);
    expect(detail.body.credits[0].amount).toBe('250.00');

    const credits = await s.finance.get(`${api}/credits?party=supplier`).expect(200);
    expect(credits.body[0]).toMatchObject({ partyName: 'Supply Co', balance: '250.00' });
    await s.finance.post(`${api}/credits/${credits.body[0].id}/payments`).send({ method: 'cash', amount: 250 }).expect(201);
    const cash = (await s.finance.get(`${api}/ledger?method=cash`)).body;
    expect(cash.map((p: { amount: string }) => p.amount).sort()).toEqual(['-100.00', '-250.00']);
    expect((await s.finance.get(`${api}/credits?open=true`)).body).toHaveLength(0);
    await s.stock.post(`${api}/supplier-invoices`).send({ supplierId: 999, reference: 'x', total: 1 }).expect(404);
  });
});

describe('expenses', () => {
  it('adds, filters by date and deletes', async () => {
    const s = await setup();
    const e = await s.finance.post(`${api}/expenses`).send({ description: 'Rent', amount: '1200.50' }).expect(201);
    await s.finance.post(`${api}/expenses`).send({ description: 'Old', amount: 5, expenseDate: '2020-01-01' }).expect(201);
    expect((await s.finance.get(`${api}/expenses?date=${day}`)).body).toHaveLength(1);
    expect((await s.finance.get(`${api}/expenses`)).body).toHaveLength(2);
    await s.cashier.get(`${api}/expenses`).expect(403);
    await s.finance.delete(`${api}/expenses/${e.body.id}`).expect(204);
    await s.finance.delete(`${api}/expenses/${e.body.id}`).expect(404);
  });
});

describe('dashboard', () => {
  it('computes sales, units and profit from line cost snapshots, net of returns and expenses', async () => {
    const s = await setup();
    const inv = (
      await s.cashier
        .post(`${api}/documents`)
        .send({ type: 'invoice', clientId: s.client.id, lines: [{ productId: s.product.id, quantity: 10, tvaRate: 20 }], payments: [{ method: 'cash', amount: 120 }] })
        .expect(201)
    ).body; // revenue 100, cost 60, profit 40, total 120 with TVA
    await s.finance.post(`${api}/returns`).send({ relatedDocumentId: inv.id, lines: [{ productId: s.product.id, quantity: 2 }], refundMethod: 'cash' }).expect(201); // -20 sales, -8 profit
    await s.finance.post(`${api}/expenses`).send({ description: 'Rent', amount: 10 }).expect(201);
    // a later cost change must not rewrite past profit
    await s.stock.patch(`${api}/products/${s.product.id}`).send({ purchasePrice: 9 }).expect(200);

    const sum = await s.finance.get(`${api}/dashboard/summary`).expect(200);
    expect(sum.body).toMatchObject({ totalSales: '80.00', unitsSold: '8.000', grossProfit: '32.00', expenses: '10.00', netProfit: '22.00' });
    const chart = await s.finance.get(`${api}/dashboard/chart?year=${year}`).expect(200);
    expect(chart.body).toHaveLength(12);
    const m = chart.body.find((r: { month: string }) => r.month === day.slice(0, 7));
    expect(m).toMatchObject({ sales: '80.00', profit: '32.00' });
    await s.cashier.get(`${api}/dashboard/summary`).expect(403);
  });
});

describe('notifications', () => {
  it('marks notifications read', async () => {
    const s = await setup();
    await s.stock.patch(`${api}/products/${s.product.id}`).send({ minQtyAlert: 200 }).expect(200);
    await s.cashier.post(`${api}/documents`).send({ type: 'uninvoiced', clientId: s.client.id, lines: [{ productId: s.product.id, quantity: 1, tvaRate: 0 }] }).expect(201);
    const list = (await s.stock.get(`${api}/notifications`).expect(200)).body;
    expect(list).toHaveLength(1);
    await s.stock.patch(`${api}/notifications/${list[0].id}/read`).expect(200);
    expect((await s.stock.get(`${api}/notifications`)).body).toHaveLength(0);
    expect((await s.stock.get(`${api}/notifications?all=true`)).body).toHaveLength(1);
  });
});

describe('uploads', () => {
  it('stores a product image and a company logo, rejecting non-images', async () => {
    const s = await setup();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const img = await s.stock.post(`${api}/products/${s.product.id}/image`).attach('image', png, { filename: 'a.png', contentType: 'image/png' }).expect(200);
    expect(img.body.imagePath).toMatch(/\.png$/);
    await s.stock.post(`${api}/products/${s.product.id}/image`).attach('image', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' }).expect(400);
    await s.admin.post(`${api}/company/logo`).attach('image', png, { filename: 'l.png', contentType: 'image/png' }).expect(409); // no company yet
    await s.admin.put(`${api}/company`).send({ companyName: 'Acme', phoneNumber: '1', address: 'x' }).expect(200);
    const logo = await s.admin.post(`${api}/company/logo`).attach('image', png, { filename: 'l.png', contentType: 'image/png' }).expect(200);
    const file = await s.cashier.get(`${api}/files/${logo.body.logoPath}`).expect(200);
    expect(file.headers['content-type']).toMatch(/image\/png/);
  });
});
