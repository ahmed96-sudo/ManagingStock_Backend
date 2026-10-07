import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, resetDb, closePool, loginAs } from './helpers.js';

beforeEach(resetDb);
afterAll(closePool);

const api = '/api';

describe('roles', () => {
  it('requires login', async () => {
    await request(app).get(`${api}/products`).expect(401);
  });

  it('only admin manages users and company settings', async () => {
    const cashier = await loginAs('cashier');
    await cashier.get(`${api}/users`).expect(403);
    await cashier.put(`${api}/company`).send({ companyName: 'x', phoneNumber: '1', address: 'a' }).expect(403);
    const admin = await loginAs('admin');
    await admin.put(`${api}/company`).send({ companyName: 'Acme', phoneNumber: '123', address: 'Main st' }).expect(200);
    const company = await cashier.get(`${api}/company`).expect(200);
    expect(company.body.companyName).toBe('Acme');
  });

  it('keeps stock writes to stock/manager/admin and lets cashiers read', async () => {
    const stock = await loginAs('stock');
    const cashier = await loginAs('cashier');
    const finance = await loginAs('finance');
    const cat = await stock.post(`${api}/categories`).send({ name: 'Tools' }).expect(201);
    await cashier.post(`${api}/categories`).send({ name: 'No' }).expect(403);
    await finance.post(`${api}/categories`).send({ name: 'No' }).expect(403);
    await cashier.get(`${api}/categories`).expect(200);
    await cashier.get(`${api}/suppliers`).expect(403);
    expect(cat.body.name).toBe('Tools');
  });
});

describe('clients, suppliers, categories', () => {
  it('creates, searches, updates and deletes a client', async () => {
    const cashier = await loginAs('cashier');
    const c = await cashier.post(`${api}/clients`).send({ name: 'Alice Ltd', ice: 'ICE001' }).expect(201);
    await cashier.post(`${api}/clients`).send({ name: 'Other', ice: 'ICE001' }).expect(409); // unique ICE
    const found = await cashier.get(`${api}/clients?q=alice`).expect(200);
    expect(found.body).toHaveLength(1);
    expect((await cashier.get(`${api}/clients?q=ICE00`).expect(200)).body).toHaveLength(1);
    await cashier.patch(`${api}/clients/${c.body.id}`).send({ phone: '555' }).expect(200);
    const admin = await loginAs('admin');
    await admin.delete(`${api}/clients/${c.body.id}`).expect(204);
    await admin.get(`${api}/clients/${c.body.id}`).expect(404);
  });

  it('refuses to delete a category that still has products', async () => {
    const stock = await loginAs('stock');
    const cat = await stock.post(`${api}/categories`).send({ name: 'Tools' }).expect(201);
    await stock
      .post(`${api}/products`)
      .send({ barcode: 'B1', reference: 'R1', name: 'Hammer', purchasePrice: 5, sellingPrice: 8, categoryId: cat.body.id })
      .expect(201);
    await stock.delete(`${api}/categories/${cat.body.id}`).expect(409);
  });
});

describe('products', () => {
  async function setup() {
    const stock = await loginAs('stock');
    const cat = await stock.post(`${api}/categories`).send({ name: 'Tools' }).expect(201);
    const body = {
      barcode: 'B1',
      reference: 'REF-1',
      name: 'Hammer',
      purchasePrice: 5,
      sellingPrice: '8.50',
      quantity: 10,
      minQtyAlert: 3,
      categoryId: cat.body.id,
    };
    const p = await stock.post(`${api}/products`).send(body).expect(201);
    return { stock, product: p.body };
  }

  it('creates with opening stock + movement and finds it by barcode or reference', async () => {
    const { stock, product } = await setup();
    expect(product.quantity).toBe('10.000');
    expect(product.sellingPrice).toBe('8.50');
    expect((await stock.get(`${api}/products/lookup/B1`).expect(200)).body.id).toBe(product.id);
    expect((await stock.get(`${api}/products/lookup/REF-1`).expect(200)).body.id).toBe(product.id);
    await stock.get(`${api}/products/lookup/nope`).expect(404);
    const moves = await stock.get(`${api}/products/${product.id}/movements`).expect(200);
    expect(moves.body).toHaveLength(1);
    expect(moves.body[0].type).toBe('purchase');
    await stock.post(`${api}/products`).send({ ...product, id: undefined, categoryId: product.categoryId, purchasePrice: 1, sellingPrice: 2 }).expect(409); // duplicate barcode
  });

  it('restocks, records price history and clears nothing else', async () => {
    const { stock, product } = await setup();
    const r = await stock.post(`${api}/products/${product.id}/restock`).send({ quantity: 5, purchasePrice: 6 }).expect(200);
    expect(r.body.quantity).toBe('15.000');
    expect(r.body.purchasePrice).toBe('6.00');
    const moves = await stock.get(`${api}/products/${product.id}/movements`).expect(200);
    expect(moves.body[0].unitCost).toBe('6.00');
    await stock.post(`${api}/products/${product.id}/restock`).send({ quantity: 0 }).expect(400);
  });

  it('lists low-stock products', async () => {
    const { stock, product } = await setup();
    expect((await stock.get(`${api}/products?lowStock=true`).expect(200)).body).toHaveLength(0);
    await stock.patch(`${api}/products/${product.id}`).send({ minQtyAlert: 20 }).expect(200);
    expect((await stock.get(`${api}/products?lowStock=true`).expect(200)).body).toHaveLength(1);
  });
});
