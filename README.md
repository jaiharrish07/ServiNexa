# DQBH Platform — Backend API

Industrial Equipment Activity Management platform. Express 4 + TypeScript over Supabase
(Postgres + Auth), with a separate Python AI microservice (`ai-service/`, Dev A/researcher)
and a Next.js frontend (`frontend/`, built last).

This repository currently contains the **Dev B slice**: the Express scaffold, all CRUD
routes, notifications, reports, and seed/smoke tooling — built standalone-runnable and fully
tested. Dev A's workflow engine, audit chain, and AI routes merge in on top (see **Merging
Dev A** below).

## Quick start

```bash
npm install
cp .env.example .env            # fill in real Supabase creds (from Jai) for live runs
npm run dev                     # http://localhost:3001  (health, docs below)
npm test                        # 76 tests, no external infra needed (Supabase is mocked)
```

- Health (liveness): `GET /health`
- Readiness (DB ping): `GET /health/ready`
- **Interactive API docs (OpenAPI/Swagger): `GET /api/docs`** · raw spec: `GET /api/docs.json`

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API with hot reload (tsx) |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run typecheck` | `tsc --noEmit` (zero errors) |
| `npm test` / `npm run test:cov` | Vitest suite (+ coverage) against the in-memory Supabase mock |
| `npm run seed` | Seed demo data — **needs real Supabase creds + schema applied** |
| `npm run smoke` | End-to-end walkthrough against a running, seeded server |

## What Dev B built (endpoints)

Auth (`/api/auth`): signup, login, me. CRUD for `/api/sites`, `/api/machines`,
`/api/technicians`, `/api/service-requests`, `/api/work-orders`, `/api/spare-parts`
(+ atomic `/:id/reserve`). Notifications (`/api/notifications`: list, unread-count,
mark-read, read-all). Reports (`/api/reports`: dashboard, sla, **mttr**, **utilization**,
parts-rebalance).

### Advanced upgrades over the base guide
- **Zod validation + field whitelisting** on every write (closes the `insert(req.body)`
  mass-assignment hole) — server-controlled fields like SR `status`/`requester_id` can't be
  set by clients.
- **Pagination / sort / search** on every list endpoint (additive `meta`, existing keys
  unchanged).
- **Race-safe spare-part reservation** via optimistic concurrency + bounded retry (no lost
  updates under concurrent reserves — covered by a parallel-reservation test).
- **Collision-safe** SR/WO numbers (retry on unique-violation).
- **MTTR + technician-utilization reports** (named in the deliverables, never implemented in
  the guide).
- **OpenAPI/Swagger UI**, **rate limiting**, **structured logging (pino) with request IDs**,
  **CORS allowlist + helmet + body caps**, `asyncHandler` everywhere, graceful shutdown,
  and a **readiness probe**.
- **76 automated tests** (90% statement coverage) running with zero external infrastructure.

## Merging Dev A

Dev A owns (do not duplicate): `sql/schema.sql`, `src/services/workflow.ts`,
`src/routes/workflow.routes.ts`, `src/services/audit.ts`, `src/routes/audit.routes.ts`,
`src/services/ai-client.ts`, `src/ai-stubs/*`, `src/routes/ai.routes.ts`.

To light up the full 36-endpoint server after merge:
1. Add `sql/schema.sql` and apply it in Supabase; put real creds in `.env`.
2. In `src/app.ts`, uncomment the **DEV A MERGE POINT** block (workflow / ai / audit mounts).
3. Dev A's workflow engine imports `notifyStatusChange` from `src/services/notifications.ts`
   (already built, signature stable) and `createAuditLog` from their own audit service.
4. `npm run seed` then `npm run smoke` to verify end-to-end.

## Layout

```
src/
  app.ts            # app builder (middleware, routes, merge point)  index.ts # listen
  config/           # env (zod-validated), supabase client, ai-service
  middleware/       # auth, error-handler(+asyncHandler), validate, rate-limit, request-context
  routes/           # 9 Dev B route modules
  services/         # notifications, reports
  schemas/          # per-entity Zod schemas + openapi doc
  utils/            # request-number (unique retry), query (pagination), api-response
scripts/            # seed.ts, smoke.ts
tests/              # 9 test files + in-memory Supabase mock harness
```
