import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, resetDb, closePool, loginAs, csrfAgent } from './helpers.js';

beforeEach(resetDb);
afterAll(closePool);

const api = '/api/v1';
const body = { name: 'x', email: 'x@test.local', password: 'password123' };

describe('csrf', () => {
  it('rejects unsafe requests without a token, with a wrong token, but lets GET through', async () => {
    const agent = request.agent(app);
    await agent.get(`${api}/auth/csrf`).expect(200);
    await agent.post(`${api}/auth/register`).send(body).expect(403); // no header
    await agent.post(`${api}/auth/register`).set('X-CSRF-Token', 'nope').send(body).expect(403);
    await agent.get(`${api}/categories`).expect(401); // GET is not CSRF-checked (here it only needs a login)
    await request(app).post(`${api}/auth/register`).set('X-CSRF-Token', 'x').send(body).expect(403); // no session at all
  });

  it('accepts the token from /auth/csrf', async () => {
    const { agent } = await csrfAgent();
    await agent.post(`${api}/auth/register`).send(body).expect(201);
  });

  it('protects every unsafe verb even for a logged-in session', async () => {
    await loginAs('admin');
    const agent = request.agent(app);
    const t0 = (await agent.get(`${api}/auth/csrf`)).body.csrfToken;
    const login = await agent.post(`${api}/auth/login`).set('X-CSRF-Token', t0).send({ email: 'admin@test.local', password: 'password123' }).expect(200);
    const token = login.body.csrfToken;
    const cat = (await agent.post(`${api}/categories`).set('X-CSRF-Token', token).send({ name: 'Tools' }).expect(201)).body;

    // logged in (cookie present) but no token header
    await agent.delete(`${api}/categories/${cat.id}`).expect(403);
    await agent.put(`${api}/company`).send({}).expect(403);
    await agent.patch(`${api}/categories/${cat.id}`).send({ name: 'y' }).expect(403);
    await agent.post(`${api}/auth/logout`).expect(403);
    await agent.get(`${api}/auth/me`).expect(200); // still logged in, nothing was changed
    await agent.delete(`${api}/categories/${cat.id}`).set('X-CSRF-Token', token).expect(204);
  });

  it('issues a new token on login and the old one stops working', async () => {
    const { agent, setToken } = await csrfAgent();
    await agent.post(`${api}/auth/register`).send({ ...body, role: 'admin' }).expect(201);
    const oldToken = (await agent.get(`${api}/auth/csrf`)).body.csrfToken;
    const login = await agent.post(`${api}/auth/login`).send({ email: body.email, password: body.password }).expect(200);
    expect(login.body.csrfToken).not.toBe(oldToken);
    await agent.post(`${api}/categories`).send({ name: 'A' }).expect(403); // still sending the old token
    setToken(login.body.csrfToken);
    await agent.post(`${api}/categories`).send({ name: 'A' }).expect(201);
  });

  it('blocks requests from a foreign Origin even with a valid token, and accepts the frontend origin', async () => {
    const { agent } = await csrfAgent();
    const token = (await agent.get(`${api}/auth/csrf`)).body.csrfToken;
    const evil = await request(app).post(`${api}/auth/register`).set('Origin', 'https://evil.example').set('X-CSRF-Token', token).send(body);
    expect(evil.status).toBe(403);
    await agent.post(`${api}/auth/register`).set('Origin', 'http://localhost:5173').send(body).expect(201);
  });
});

describe('protected files', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

  it('serves uploads only to logged-in users of any role', async () => {
    const stock = await loginAs('stock');
    const cat = (await stock.post(`${api}/categories`).send({ name: 'T' })).body;
    const p = (await stock.post(`${api}/products`).send({ barcode: 'A', reference: 'R', name: 'N', purchasePrice: 1, sellingPrice: 2, categoryId: cat.id })).body;
    const up = await stock.post(`${api}/products/${p.id}/image`).attach('image', png, { filename: 'a.png', contentType: 'image/png' }).expect(200);
    const file = up.body.imagePath as string;

    await request(app).get(`${api}/files/${file}`).expect(401); // anonymous
    const cashier = await loginAs('cashier');
    const res = await cashier.get(`${api}/files/${file}`).expect(200);
    expect(res.headers['cache-control']).toMatch(/private/);
    await cashier.get(`${api}/files/missing.png`).expect(404);
    await cashier.get(`${api}/files/..%2F..%2F.env`).expect(404);
    await cashier.get(`${api}/files/.gitkeep`).expect(404);
    await request(app).get(`/uploads/${file}`).expect(404); // old public path is gone
  });
});
