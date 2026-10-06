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

// Registers + logs in a user of the given role; the agent keeps the session cookie.
export async function loginAs(role: RoleName, email = `${role}@test.local`) {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/register').send({ name: role, email, password: 'password123', role }).expect(201);
  await agent.post('/api/v1/auth/login').send({ email, password: 'password123' }).expect(200);
  return agent;
}
