# ServiNexa (DQBH) — Industrial Equipment Activity Management Platform

Express + TypeScript API · Supabase (Postgres/Auth/Realtime) · Next.js 14 frontend · Python FastAPI AI microservice (LLM-only, GroqCloud).

## Status (as of this commit)

| Area | State |
|---|---|
| **Backend core (Dev A)** — workflow engine, tamper-evident audit chain, AI stub layer + routes, SQL schema, seed/demo | ✅ Implemented & tested (`tsc` clean, 45 Jest tests pass) |
| Backend CRUD / reports / realtime (Dev B) | ⏳ Route files scaffolded (empty) — to build |
| Frontend (`frontend/`) | ⏳ Structure scaffolded (empty) — to build |
| AI service (`ai-service/`) | ⏳ LLM-only rebuild planned — see `docs/ML_TO_LLM_MIGRATION.md` |

## Quick start (backend)

```bash
npm install
cp .env.example .env        # fill in Supabase creds
# run sql/schema.sql in the Supabase SQL editor
npm run typecheck           # tsc --noEmit
npm test                    # jest (45 tests)
npm run dev                 # http://localhost:3001/health
npm run seed                # demo data (needs live Supabase)
npm run demo                # end-to-end driver (needs server + seed)
```

## Layout

```
src/            Express API (routes, services, middleware, config, ai-stubs, utils)
scripts/        seed.ts, demo-flow.ts
sql/            schema.sql (12 tables, RLS, triggers, RPCs)
tests/          Jest unit tests
docs/           INTEGRATION_REPORT.md (7 new features), ML_TO_LLM_MIGRATION.md
frontend/       Next.js 14 (App Router) — to build
ai-service/     Python FastAPI LLM orchestration — to build
```

## Ownership & branch workflow

- **Dev A (Jai):** `sql/schema.sql`, `services/workflow.ts` + `services/audit.ts` + `services/ai-client.ts`, `ai-stubs/*`, `routes/{ai,audit,workflow}.routes.ts`, `scripts/*`.
- **Dev B:** `routes/{auth,sites,machines,technicians,service-requests,work-orders,spare-parts,notifications,reports}.routes.ts`, `services/{notifications,reports}.ts`, CRUD/realtime.
- Shared scaffold (`config/*`, `middleware/*`, `utils/*`, `index.ts`, `package.json`, `tsconfig.json`) was built verbatim from the backend guide for conflict-free merge. **`src/index.ts` is the one merge point** — Dev B's route mounts are present but commented, ready to uncomment.

Trunk-based: branch per task (`jai/<feature>`, `dev-b/<feature>`), merge to `main` when green.

## Tech

Node 18+/TypeScript · Supabase JS client (service role, server-side) · JWT + RBAC (ADMIN, OPS_MANAGER, TECHNICIAN, CUSTOMER) · GPT-OSS 20B via GroqCloud for AI (with rule-based stub fallback).
