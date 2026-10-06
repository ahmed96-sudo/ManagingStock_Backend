import pg from 'pg';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { RoleName } from '../src/lib/schemas.js';

export const app = createApp();
const pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'] });

export async function resetDb() {
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

export async function closePool() {
  await pool.end();
}

// Agent that keeps cookies and sends the CSRF token on every unsafe request, like the frontend will.
export async function csrfAgent() {
  const agent = request.agent(app);
  let token = ((await agent.get('/api/v1/auth/csrf').expect(200)).body as { csrfToken: string }).csrfToken;
  for (const m of ['post', 'put', 'patch', 'delete'] as const) {
    const original = agent[m].bind(agent);
    agent[m] = ((url: string) => original(url).set('X-CSRF-Token', token)) as typeof agent.post;
  }
  return { agent, setToken: (t: string) => (token = t) };
}

// Registers + logs in a user of the given role; the agent keeps the session cookie.
export async function loginAs(role: RoleName, email = `${role}@test.local`) {
  const { agent, setToken } = await csrfAgent();
  await agent.post('/api/v1/auth/register').send({ name: role, email, password: 'password123', role }).expect(201);
  const login = await agent.post('/api/v1/auth/login').send({ email, password: 'password123' }).expect(200);
  setToken(login.body.csrfToken); // login starts a new session, so the token changes
  return agent;
}
