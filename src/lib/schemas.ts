import { z } from 'zod';

// Numbers are exchanged with the DB as decimal strings; accept either from clients.
const decimalString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d+(\.\d+)?$/.test(v), 'must be a non-negative decimal number');

export const decimal = decimalString;
export const positive = decimalString.refine((v) => Number(v) > 0, 'must be greater than 0');
export const percent = decimalString.refine((v) => Number(v) <= 100, 'must be between 0 and 100');

export const id = z.coerce.number().int().positive();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
export const idParams = z.object({ id });

export const roles = ['admin', 'manager', 'finance', 'stock', 'cashier'] as const;
export type RoleName = (typeof roles)[number];
