import { existsSync } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { db } from '../../prisma/db.js';
import { uploadDir } from '../middleware/upload.js';
import { getDocument } from './documents.js';

const TITLES: Record<string, string> = {
  invoice: 'INVOICE',
  draft: 'DRAFT INVOICE (QUOTE)',
  delivery_note: 'DELIVERY NOTE',
  uninvoiced: 'SALES RECEIPT',
  credit_note: 'CREDIT NOTE',
};

const fmt = (v: string) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function renderDocumentPdf(id: number): Promise<Buffer> {
  const doc = await getDocument(id);
  const company = await db.orm.public.CompanyInfo.first();

  const pdf = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Buffer[] = [];
  pdf.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => pdf.on('end', () => resolve(Buffer.concat(chunks))));

  // Header: logo + company
  let y = 40;
  if (company?.logoPath) {
    const file = path.join(uploadDir, path.basename(company.logoPath));
    if (existsSync(file)) pdf.image(file, 40, y, { fit: [80, 60] });
  }
  pdf.font('Helvetica-Bold').fontSize(14).text(company?.companyName ?? 'Company', 130, y);
  pdf.font('Helvetica').fontSize(9);
  const info = [
    company?.address,
    company?.phoneNumber && `Phone: ${company.phoneNumber}`,
    company?.email && `Email: ${company.email}`,
    company?.commonBusinessId && `ICE: ${company.commonBusinessId}`,
    company?.taxIdNumber && `Tax ID: ${company.taxIdNumber}`,
    company?.commercialRegister && `Commercial register: ${company.commercialRegister}`,
    company?.businessLicense && `License: ${company.businessLicense}`,
    company?.socialSecurityNo && `Social security: ${company.socialSecurityNo}`,
  ].filter(Boolean) as string[];
  info.forEach((l) => pdf.text(l, 130));

  y = Math.max(pdf.y, 110) + 15;
  pdf.font('Helvetica-Bold').fontSize(16).text(TITLES[doc.type] ?? doc.type, 40, y);
  pdf.font('Helvetica').fontSize(10).text(`No: ${doc.number}`, 40, y + 22).text(`Date: ${doc.documentDate}`);
  if (doc.client) {
    pdf.font('Helvetica-Bold').text('Client', 350, y).font('Helvetica');
    pdf.text(doc.client.name, 350, y + 14);
    if (doc.client.ice) pdf.text(`ICE: ${doc.client.ice}`);
    if (doc.client.address) pdf.text(doc.client.address);
    if (doc.client.phone) pdf.text(`Phone: ${doc.client.phone}`);
  }

  // Lines table
  y = Math.max(pdf.y, y + 50) + 20;
  const cols = [40, 90, 290, 340, 405, 445, 495];
  const heads = ['#', 'Description', 'Qty', 'Unit price', 'Disc %', 'TVA %', 'Total'];
  pdf.font('Helvetica-Bold').fontSize(9);
  heads.forEach((h, i) => pdf.text(h, cols[i]!, y, { width: (cols[i + 1] ?? 555) - cols[i]! - 4 }));
  pdf.moveTo(40, y + 14).lineTo(555, y + 14).stroke();
  y += 20;
  pdf.font('Helvetica');
  doc.lines.forEach((l, n) => {
    if (y > 740) {
      pdf.addPage();
      y = 40;
    }
    const cells = [String(n + 1), l.description, l.quantity.replace(/\.?0+$/, ''), fmt(l.unitPrice), l.discountPercent, l.tvaRate, fmt(l.lineTotal)];
    cells.forEach((c, i) => pdf.text(c, cols[i]!, y, { width: (cols[i + 1] ?? 555) - cols[i]! - 4 }));
    y += 16;
  });

  // Totals
  y += 10;
  if (y > 700) {
    pdf.addPage();
    y = 40;
  }
  const row = (label: string, value: string, bold = false) => {
    pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, 380, y).text(value, 455, y, { width: 100, align: 'right' });
    y += 16;
  };
  row('Subtotal (after discount)', fmt(doc.subtotal));
  row('Discount', fmt(doc.discountTotal));
  row('TVA', fmt(doc.tvaTotal));
  row('TOTAL', fmt(doc.total), true);

  const paid = doc.payments.reduce((s, p) => s + Number(p.amount), 0);
  if (doc.payments.length) {
    y += 8;
    pdf.font('Helvetica-Bold').text('Payments', 40, y);
    y += 14;
    pdf.font('Helvetica');
    doc.payments.forEach((p) => {
      pdf.text(`${p.method}${p.chequeNumber ? ` #${p.chequeNumber}` : ''}: ${fmt(p.amount)}`, 40, y);
      y += 13;
    });
  }
  const owed = doc.credits.reduce((s, c) => s + Number(c.balance), 0);
  if (doc.credits.length) pdf.text(`Paid: ${fmt(String(paid))}   Remaining on credit: ${fmt(String(owed))}`, 40, y + 4);
  if (doc.note) pdf.text(`Note: ${doc.note}`, 40, y + 22);

  pdf.end();
  return done;
}
