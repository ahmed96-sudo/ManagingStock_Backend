import 'dotenv/config';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    fileParallelism: false, // all test files share one database
    testTimeout: 20000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env['TEST_DATABASE_URL'] ?? '',
      UPLOAD_DIR: path.join(tmpdir(), 'managing-stock-test-uploads'), // keep test uploads out of the repo
    },
  },
});
