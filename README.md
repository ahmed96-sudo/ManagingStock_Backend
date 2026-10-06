# ManagingStock backend

Express 5 + TypeScript + Prisma Next (Postgres). One company per deployment, USD, English.

## Run

```bash
cp .env.example .env        # then set SESSION_SECRET
npm run docker:up           # Postgres :5432, Adminer :8080, Mailpit :8025 (SMTP :1025)
npm install
npm run db:migrate          # apply migrations
npm run dev                 # http://localhost:3000  (GET /health)
```

Create the first admin: `POST /api/v1/auth/register` with `{name, email, password, role: "admin"}`
(registration is open while developing; see the `TEMP` comment in `src/routes/auth.ts`).

## Scripts

- `npm run typecheck` · `npm test` (needs the docker DB; uses `managing_stock_test`) · `npm run build` · `npm start`
- Schema: edit `prisma/contract.prisma`, then `npm run contract:emit`, `npm run migration:plan -- --name <slug>`, `npm run db:migrate`.
  If the plan says `from: null`, pass `--from <hash of the last migration>`.

## Layout

`src/routes` (HTTP + zod validation) → `src/services` (business rules, transactions) → `prisma/db.ts`.
Roles: admin (everything), manager, finance, stock, cashier — see `requireRole(...)` on each route.
