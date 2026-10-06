import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadDir } from '../middleware/upload.js';

// Uploaded images (product photos, company logo) are only served to logged-in users.
export const filesRouter = Router();
filesRouter.use(requireAuth);

filesRouter.get('/:name', (req, res, next) => {
  const name = String(req.params['name']);
  if (!/^[\w-]+\.\w+$/.test(name)) return next(new HttpError(404, 'File not found'));
  res.sendFile(name, { root: uploadDir, dotfiles: 'deny', headers: { 'Cache-Control': 'private, no-store' } }, (err) => {
    if (err) next(new HttpError(404, 'File not found'));
  });
});
