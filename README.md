# ServiNexa / DQBH Backend

Express 4 + TypeScript API backed by Supabase Postgres and Supabase Auth. This integrated backend includes the Dev B CRUD, reports, notifications, and seed tooling, plus Dev A workflow transitions, exception handling, audit verification, and AI endpoints with local stub fallbacks.

This repository is the backend. The AI service is optional and runs separately; without it, AI endpoints return deterministic local stub results.

## Requirements

- Node.js 18 or newer and npm
- A Supabase project you control
- PostgreSQL CLI (`psql`) for `npm run db:setup`

Do not commit `.env` or share the Supabase service role key. Each developer should use their own Supabase project or credentials supplied through a secure channel.

## Fresh clone setup

```bash
git clone https://github.com/jaiharrish07/ServiNexa.git
cd ServiNexa
npm install
cp .env.example .env
```

In `.env`, fill in these values from Supabase Project Settings:

- `SUPABASE_URL`: Project URL
- `SUPABASE_ANON_KEY`: anon/public key
- `SUPABASE_SERVICE_KEY`: service role key; keep this server-side and secret
- `DATABASE_URL`: PostgreSQL URI from Project Settings → Database → Connection string

Then apply the schema and load demo records:

```bash
npm run db:setup
npm run seed
```

`db:setup` applies [`sql/schema.sql`](sql/schema.sql) with `psql` and stops on the first SQL error. The schema can be safely reapplied. If you do not have `psql`, open the Supabase SQL Editor, run the full contents of `sql/schema.sql`, then run `npm run seed` locally.

Start the API in another terminal:

```bash
npm run dev
```

Check the server and database:

```bash
curl http://localhost:3001/health
curl http://localhost:3001/health/ready
```

The API should be available at `http://localhost:3001`; Swagger UI is at `/api/docs` and the raw OpenAPI document is at `/api/docs.json`.

## Verify the setup

With the API running and demo data seeded:

```bash
npm test
npm run typecheck
npm run build
npm run smoke
```

`npm run smoke` performs a live walkthrough and writes a demo service request, work order, and part reservation to the configured database. `npm run demo` exercises classification, workflow transitions, technician matching, prediction, dashboard reporting, and audit verification; it also creates demo records.

Demo accounts created by the seed script:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@dqbh.com` | `Admin123!` |
| Operations manager | `ops@dqbh.com` | `Ops123!` |
| Technician | `alex.chen@dqbh.com` | `Tech123!` |
| Customer | `customer@dqbh.com` | `Cust123!` |

These are development demo credentials. Do not use them for a public deployment.

## Database and security notes

- The Express API connects with the Supabase service role key. Keep it only in the backend environment; never put it in a browser app.
- The included SQL uses permissive policies intended for the hackathon/demo setup. Review and replace them with per-role and per-site policies before exposing direct Supabase access to clients.
- The schema adds operational tables to the `supabase_realtime` publication when it exists. Client subscriptions still need to use Supabase Realtime and appropriate read policies.
- `DATABASE_URL` is used only by the schema setup script. Runtime API queries use `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.

## Main API areas

- Auth: `/api/auth` (signup, login, current user)
- CRUD: `/api/sites`, `/api/machines`, `/api/technicians`, `/api/service-requests`, `/api/work-orders`, `/api/spare-parts`
- Workflow: `/api/service-requests/:id/transition` and `/api/service-requests/:id/exception`
- AI: `/api/ai/classify`, `/api/ai/predict`, `/api/ai/match`, `/api/ai/anomalies`
- Audit: `/api/audit` and `/api/audit/verify`
- Notifications: `/api/notifications`
- Reports: `/api/reports/dashboard`, `sla`, `mttr`, `utilization`, and `parts-rebalance`
