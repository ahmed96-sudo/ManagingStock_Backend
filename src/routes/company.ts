import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../prisma/db.js';
import { HttpError } from '../lib/errors.js';
import { rate } from '../lib/money.js';
import { percent } from '../lib/schemas.js';
import { compact } from '../lib/utils.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';

export const companyRouter = Router();
companyRouter.use(requireAuth);

const text = z.string().trim().min(1);
const optText = z.string().trim().optional();
const body = z.object({
  companyName: text,
  phoneNumber: text,
  address: text,
  email: optText,
  businessLicense: optText,
  taxIdNumber: optText,
  commercialRegister: optText,
  socialSecurityNo: optText,
  commonBusinessId: optText,
  defaultTvaRate: percent.optional(),
});

// Single-row table: null until the admin fills it in.
companyRouter.get('/', async (_req, res) => {
  res.json((await db.orm.public.CompanyInfo.orderBy((c) => c.id.asc()).first()) ?? null);
});

companyRouter.put('/', requireRole(), validate({ body }), async (req, res) => {
  const { defaultTvaRate, ...fields } = req.body as z.infer<typeof body>;
  const data = { ...compact(fields), ...(defaultTvaRate !== undefined && { defaultTvaRate: rate(defaultTvaRate) }) };
  const existing = await db.orm.public.CompanyInfo.orderBy((c) => c.id.asc()).first();
  const row = existing
    ? await db.orm.public.CompanyInfo.where({ id: existing.id }).update({ ...data, updatedAt: new Date().toISOString() })
    : await db.orm.public.CompanyInfo.create({
        ...data,
        defaultTvaRate: data.defaultTvaRate ?? rate(0),
        companyName: fields.companyName,
        phoneNumber: fields.phoneNumber,
        address: fields.address,
      });
  res.json(row);
});

companyRouter.post('/logo', requireRole(), imageUpload, async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Send the image in the "image" field');
  const existing = await db.orm.public.CompanyInfo.orderBy((c) => c.id.asc()).first();
  if (!existing) throw new HttpError(409, 'Save the company info before uploading a logo');
  const row = await db.orm.public.CompanyInfo.where({ id: existing.id }).update({ logoPath: req.file.filename });
  res.json(row);
});
