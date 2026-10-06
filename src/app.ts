import express from 'express';
import type { Application } from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { env } from './config/env.js';
import { uploadDir } from './middleware/upload.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { companyRouter } from './routes/company.js';
import { productsRouter } from './routes/products.js';
import { documentsRouter, returnsRouter } from './routes/documents.js';
import { creditsRouter, expensesRouter, ledgerRouter, supplierInvoicesRouter } from './routes/finance.js';
import { dashboardRouter, notificationsRouter } from './routes/dashboard.js';
import { categoriesRouter, suppliersRouter, clientGroupsRouter, clientsRouter } from './routes/catalog.js';

export function createApp(): Application {
  const app = express();
  const prod = env.NODE_ENV === 'production';

  app.set('trust proxy', 1); // behind a reverse proxy / Vercel-facing host
  if (env.NODE_ENV !== 'test') app.use(morgan('dev'));
  // Uploaded images are shown cross-origin by the frontend.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const PgStore = pgSession(session);
  app.use(
    session({
      name: 'sid',
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new PgStore({ conString: env.DATABASE_URL, tableName: 'session' }),
      cookie: {
        httpOnly: true,
        secure: prod,
        sameSite: prod ? 'none' : 'lax',
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );

  app.get('/health', (_req, res) => void res.json({ status: 'ok' }));
  app.use('/uploads', express.static(uploadDir));

  const api = express.Router();
  api.use('/auth', authRouter);
  api.use('/users', usersRouter);
  api.use('/company', companyRouter);
  api.use('/products', productsRouter);
  api.use('/documents', documentsRouter);
  api.use('/returns', returnsRouter);
  api.use('/ledger', ledgerRouter);
  api.use('/credits', creditsRouter);
  api.use('/supplier-invoices', supplierInvoicesRouter);
  api.use('/expenses', expensesRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/categories', categoriesRouter);
  api.use('/suppliers', suppliersRouter);
  api.use('/client-groups', clientGroupsRouter);
  api.use('/clients', clientsRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
