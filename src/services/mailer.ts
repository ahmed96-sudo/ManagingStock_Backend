import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Dev SMTP is Mailpit (docker compose): no auth, no TLS.
const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false, ignoreTLS: true });

export const sendMail = (o: { to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer }[] }) =>
  transport.sendMail({ from: env.MAIL_FROM, ...o });
