import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';

export const uploadDir = path.resolve(env.UPLOAD_DIR);
mkdirSync(uploadDir, { recursive: true });

// Single image upload (field "image"), 2 MB max, random file names.
export const imageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    /^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)
      ? cb(null, true)
      : cb(new HttpError(400, 'Only png, jpg, webp or gif images are allowed')),
}).single('image');
