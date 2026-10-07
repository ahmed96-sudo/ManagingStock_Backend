import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { resetDb, closePool, loginAs, csrfAgent } from './helpers.js';

beforeEach(resetDb);
afterAll(closePool);

describe('auth', () => {
  it('registers, logs in, returns me and logs out', async () => {
    const agent = await loginAs('finance');
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ email: 'finance@test.local', role: 'finance' });
    expect(me.body.passwordHash).toBeUndefined();
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('rejects a wrong password and unknown email the same way', async () => {
    await loginAs('admin');
    const { agent: anon } = await csrfAgent();
    const a = await anon.post('/api/auth/login').send({ email: 'admin@test.local', password: 'wrong-password' });
    const b = await anon.post('/api/auth/login').send({ email: 'nobody@test.local', password: 'wrong-password' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('validates input and rejects duplicate emails', async () => {
    const { agent: anon } = await csrfAgent();
    await anon.post('/api/auth/register').send({ name: 'x', email: 'bad', password: 'short' }).expect(400);
    await loginAs('cashier', 'dup@test.local');
    await anon.post('/api/auth/register').send({ name: 'x', email: 'dup@test.local', password: 'password123' }).expect(409);
  });

  it('refuses a deactivated user', async () => {
    const admin = await loginAs('admin');
    await loginAs('cashier', 'c@test.local');
    const users = await admin.get('/api/users').expect(200);
    const c = users.body.find((u: { email: string }) => u.email === 'c@test.local');
    await admin.patch(`/api/users/${c.id}`).send({ isActive: false }).expect(200);
    const { agent: anon } = await csrfAgent();
    await anon.post('/api/auth/login').send({ email: 'c@test.local', password: 'password123' }).expect(401);
  });
});
