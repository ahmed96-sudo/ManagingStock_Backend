import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  DATABASE_URL: z.string().min(1),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  MAIL_FROM: z.string().default('ManagingStock <no-reply@managingstock.local>'),
  UPLOAD_DIR: z.string().default('uploads'),
});

export const env = schema.parse(process.env);
