import 'dotenv/config';
import { execSync } from 'node:child_process';

// Applies the migrations to the test database before any test file runs.
export default function setup() {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) throw new Error('TEST_DATABASE_URL is not set');
  execSync('npx prisma db migrate', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
