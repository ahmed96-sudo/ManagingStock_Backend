import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../prisma/db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { id, idParams, isoDate, percent, positive } from '../lib/schemas.js';
import { like } from '../lib/utils.js';
import { currentUserId, requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { convertToInvoice, createDocument, createReturn, deleteDocument, getDocument, listDocuments } from '../services/documents.js';
import { sendMail } from '../services/mailer.js';
import { renderDocumentPdf } from '../services/pdf.js';

export const documentsRouter = Router();
export const returnsRouter = Router();
documentsRouter.use(requireAuth);
returnsRouter.use(requireAuth);

const optText = z.string().trim().optional();
export const paymentBody = z.object({
  method: z.enum(['cash', 'cheque']),
  amount: positive,
  chequeNumber: optText,
  bank: optText,
});

const createBody = z.object({
  type: z.enum(['invoice', 'draft', 'delivery_note', 'uninvoiced']),
  clientId: id.optional(),
  documentDate: isoDate.optional(),
  note: optText,
  lines: z
    .array(z.object({ productId: id, quantity: positive, discountPercent: percent.optional(), tvaRate: percent.optional() }))
    .min(1),
  // Whatever is not covered by payments becomes a credit on the client.
  payments: z.array(paymentBody).default([]),
});

const listQuery = z.object({
  type: z.enum(['invoice', 'draft', 'delivery_note', 'uninvoiced', 'credit_note']).optional(),
  clientName: z.string().trim().optional(),
  clientId: id.optional(),
  date: isoDate.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const sellers = requireRole('manager', 'cashier');
const viewers = requireRole('manager', 'finance', 'cashier');
const editors = requireRole('manager', 'finance');

documentsRouter.post('/', sellers, validate({ body: createBody }), async (req, res) => {
  res.status(201).json(await createDocument(currentUserId(req), req.body));
});

documentsRouter.get('/', viewers, validate({ query: listQuery }), async (req, res) => {
  res.json(await listDocuments(req.query as unknown as z.infer<typeof listQuery>, like));
});

documentsRouter.get('/:id', viewers, validate({ params: idParams }), async (req, res) => {
  res.json(await getDocument(Number(req.params['id'])));
});

documentsRouter.get('/:id/pdf', viewers, validate({ params: idParams }), async (req, res) => {
  const docId = Number(req.params['id']);
  const doc = await db.orm.public.Documents.where({ id: docId }).first();
  if (!doc) throw notFound('Document');
  const pdf = await renderDocumentPdf(docId);
  res.type('application/pdf').set('Content-Disposition', `inline; filename="${doc.number}.pdf"`).send(pdf);
});

documentsRouter.post('/:id/email', viewers, validate({ params: idParams, body: z.object({ to: z.email().optional() }) }), async (req, res) => {
  const docId = Number(req.params['id']);
  const doc = await getDocument(docId);
  const to = (req.body as { to?: string }).to ?? doc.client?.email;
  if (!to) throw new HttpError(400, 'No recipient: send "to" or give the client an email address');
  await sendMail({
    to,
    subject: `${doc.type.replace('_', ' ')} ${doc.number}`,
    text: `Please find attached ${doc.type.replace('_', ' ')} ${doc.number}.`,
    attachments: [{ filename: `${doc.number}.pdf`, content: await renderDocumentPdf(docId) }],
  });
  res.json({ sent: true, to });
});

documentsRouter.post('/:id/convert', editors, validate({ params: idParams, body: z.object({ payments: z.array(paymentBody).default([]) }) }), async (req, res) => {
  res.json(await convertToInvoice(currentUserId(req), Number(req.params['id']), req.body.payments));
});

documentsRouter.delete('/:id', editors, validate({ params: idParams }), async (req, res) => {
  await deleteDocument(currentUserId(req), Number(req.params['id']));
  res.status(204).end();
});

// Returns (credit notes)
const returnBody = z.object({
  relatedDocumentId: id,
  lines: z.array(z.object({ productId: id, quantity: positive })).min(1),
  refundMethod: z.enum(['cash', 'cheque', 'credit']),
  chequeNumber: optText,
  bank: optText,
  note: optText,
});
returnsRouter.post('/', editors, validate({ body: returnBody }), async (req, res) => {
  res.status(201).json(await createReturn(currentUserId(req), req.body));
});
