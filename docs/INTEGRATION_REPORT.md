# ServiNexa — 7-Feature Integration Report

> Target stack: **Next.js 14 (App Router) + Express/TypeScript API + Supabase (Postgres/Auth/Realtime)**
> Scope: integration plan for Features 1–7 on top of the existing backend.
> Generated against the live codebase at `D:\ServiNexa`.

---

## ⚠️ Reality check before you start (read this first)

The repo is **mostly empty scaffolding**. Only Dev A's backend is implemented. The following **do not exist yet** (0-byte stub files):

| Area | Status |
|---|---|
| Dev A backend (workflow, audit, AI stubs, schema, seed/demo) | ✅ **Implemented + tested** |
| Dev B CRUD routes (`sites`, `machines`, `technicians`, `service-requests`, `work-orders`, `spare-parts`, `auth`, `notifications`, `reports`) | ❌ Empty 0-byte files |
| `src/services/reports.ts` | ❌ Empty |
| **Entire `frontend/`** (all pages, components, hooks, lib) | ❌ Empty 0-byte files |
| **Entire `ai-service/`** (FastAPI, models, routers) | ❌ Empty 0-byte files |

**Implication:** Every "modify existing frontend component" instruction below is really "create it." Every integration point that references a Dev B route assumes that route gets built first (per the base backend guide). This report plans the 7 features **as if the base platform is complete** (which is the hackathon plan), and flags where a dependency isn't built yet.

---

## 1. Current Codebase Inventory

### 1.1 Backend files that EXIST and are populated

| File | Purpose |
|---|---|
| `src/index.ts` | Express app; mounts routes; health check. Lines 61-63 mount Dev A routes; lines 48-56 are commented Dev B mounts. |
| `src/config/supabase.ts` | Service-role Supabase client (bypasses RLS). |
| `src/config/ai-service.ts` | `AI_SERVICE_URL`, `AI_TIMEOUT_MS`. |
| `src/middleware/auth.ts` | `authenticate` (JWT → profile), `authorize(...roles)`, `AuthRequest`. |
| `src/middleware/error-handler.ts` | `AppError`, global `errorHandler`. |
| `src/utils/request-number.ts` | `generateRequestNumber()`, `generateOrderNumber()`. |
| `src/services/workflow.ts` | **State machine** (spine). `TRANSITIONS`, `TRANSITION_ROLES`, `SLA_HOURS`, `transitionStatus()`, `raiseException()`, pure helpers `isTransitionAllowed`/`canRoleTransition`/`slaHoursFor`. |
| `src/services/audit.ts` | Tamper-evident SHA-256 audit chain + `verifyAuditChain`. |
| `src/services/notifications.ts` | `createNotification`, `notifyStatusChange`. |
| `src/services/ai-client.ts` | `callAIService<T>()` — live-first with stub fallback, `AIResponse<T>`. |
| `src/ai-stubs/{classify,predict,match}.stub.ts` | Rule-based AI fallbacks. |
| `src/routes/ai.routes.ts` | `POST /api/ai/{classify,predict,match,anomalies}`. |
| `src/routes/audit.routes.ts` | `GET /api/audit`, `GET /api/audit/verify`. |
| `src/routes/workflow.routes.ts` | `POST /api/service-requests/:id/{transition,exception}`. |
| `scripts/seed.ts`, `scripts/demo-flow.ts` | Demo data + end-to-end driver. |
| `sql/schema.sql` | 12 tables, 15 indexes, RLS, triggers, `increment_job_count`/`decrement_job_count` RPCs. |

### 1.2 Existing API endpoints (live today)

| Method | Path | Auth | Source |
|---|---|---|---|
| GET | `/health` | none | index.ts |
| POST | `/api/ai/classify` | authenticate | ai.routes.ts |
| POST | `/api/ai/predict` | authenticate | ai.routes.ts |
| POST | `/api/ai/match` | authenticate | ai.routes.ts |
| POST | `/api/ai/anomalies` | authenticate | ai.routes.ts |
| GET | `/api/audit` | ADMIN/OPS_MANAGER | audit.routes.ts |
| GET | `/api/audit/verify` | ADMIN | audit.routes.ts |
| POST | `/api/service-requests/:id/transition` | authenticate | workflow.routes.ts |
| POST | `/api/service-requests/:id/exception` | authenticate | workflow.routes.ts |

(Dev B's CRUD endpoints — `/api/auth/*`, `/api/sites`, `/api/machines`, `/api/technicians`, `/api/service-requests` CRUD, `/api/work-orders`, `/api/spare-parts`, `/api/notifications`, `/api/reports/*` — are **planned but not yet implemented**.)

### 1.3 Existing database tables (12)

`users`, `sites`, `machines`, `technicians`, `service_requests`, `work_orders`, `spare_parts`, `reservations`, `exception_flags`, `documents`, `audit_logs`, `notifications`.

Key columns you'll reuse:
- `machines`: `id, site_id, code, type, status, criticality, air_temp, process_temp, rotational_speed, torque, tool_wear`
- `service_requests`: `id, site_id, machine_id, requester_id, category, priority, ai_confidence, status, assigned_technician_id, sla_deadline, resolution_notes` + timestamps
- `technicians`: `id, user_id, site_id, specializations[], current_job_count, max_concurrent_jobs, avg_resolution_hours, rating, is_available`
- `spare_parts`: `id, site_id, name, part_number, quantity_available, quantity_reserved, reorder_level, unit_cost`
- `reservations`: `id, spare_part_id, work_order_id, quantity, status`

### 1.4 Existing state machine (`src/services/workflow.ts`)

```
DRAFT → SUBMITTED → VALIDATING → PENDING_APPROVAL → APPROVED → ASSIGNED → IN_PROGRESS → COMPLETED → VERIFIED → CLOSED
                         ↘ DRAFT        ↘ DRAFT                    ↘ EXCEPTION ↘ EXCEPTION
EXCEPTION → {ASSIGNED | IN_PROGRESS | CLOSED}
```
- `TRANSITIONS` map: `workflow.ts:32`
- `APPROVED: ['ASSIGNED']`: **`workflow.ts:37`** ← Feature 4 changes this
- `TRANSITION_ROLES`: `workflow.ts:47`
- `SLA_HOURS` (CRITICAL 4 / HIGH 8 / MEDIUM 24 / LOW 72): `workflow.ts:68`
- `transitionStatus()`: `workflow.ts:122`; side-effect blocks at `:171` (SUBMITTED→SLA), `:177` (APPROVED), `:182` (ASSIGNED), audit `:223`, notify `:238`

---

## 2. Database Changes

Put all of this in a new migration file `sql/features.sql` (run after `sql/schema.sql`). Everything is `IF NOT EXISTS` / re-runnable.

### 2.1 New tables

```sql
-- ============ FEATURE 1: 3D Visual Diagnosis ============
-- Component catalog per machine TYPE (generic schematic model) with 3D coords.
CREATE TABLE IF NOT EXISTS public.machine_components (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_type    TEXT NOT NULL,                 -- e.g. 'CNC Mill', 'Press', 'Welding Robot'
  component_key   TEXT NOT NULL,                 -- e.g. 'bearing_assembly', 'spindle', 'hydraulic_pump'
  component_name  TEXT NOT NULL,
  coord_x         DOUBLE PRECISION DEFAULT 0,    -- position in the generic model space
  coord_y         DOUBLE PRECISION DEFAULT 0,
  coord_z         DOUBLE PRECISION DEFAULT 0,
  mesh_ref        TEXT,                          -- optional: named mesh/group in the Three.js model
  default_color   TEXT DEFAULT '#9ca3af',
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(machine_type, component_key)
);

-- Maps an AI classification (category + optional sub_category/failure_mode) to a component to highlight.
CREATE TABLE IF NOT EXISTS public.ai_component_map (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category       TEXT NOT NULL,                  -- matches service_requests.category
  sub_category   TEXT,                           -- e.g. 'BEARING_THERMAL' (nullable = category default)
  machine_type   TEXT,                           -- nullable = applies to all types
  component_key  TEXT NOT NULL,
  highlight_color TEXT DEFAULT '#ef4444',
  pulse          BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- A generated visualization instance tied to a service request (cache + annotations).
CREATE TABLE IF NOT EXISTS public.visualizations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  machine_id         UUID REFERENCES public.machines(id),
  machine_type       TEXT,
  highlighted_components JSONB DEFAULT '[]',     -- [{component_key, color, pulse, reason}]
  annotations        JSONB DEFAULT '[]',         -- technician/ops markups
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- ============ FEATURE 2: Cascading Impact ============
CREATE TABLE IF NOT EXISTS public.machine_dependencies (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upstream_machine_id   UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  downstream_machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  dependency_type      TEXT DEFAULT 'FEEDS' CHECK (dependency_type IN ('FEEDS','SHARED_LINE','POWERS','BUFFERS')),
  throughput_rate      DOUBLE PRECISION DEFAULT 0,   -- units/hour passing on this edge
  unit_value           DECIMAL(12,2) DEFAULT 0,      -- ₹ value per unit at this edge
  buffer_hours         DOUBLE PRECISION DEFAULT 0,   -- downstream can run this long on buffer stock
  created_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(upstream_machine_id, downstream_machine_id),
  CHECK (upstream_machine_id <> downstream_machine_id)
);

CREATE TABLE IF NOT EXISTS public.production_orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_code    TEXT NOT NULL UNIQUE,
  machine_id    UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  quantity      INTEGER NOT NULL,
  unit_value    DECIMAL(12,2) DEFAULT 0,
  deadline      TIMESTAMPTZ NOT NULL,
  sla_penalty   DECIMAL(12,2) DEFAULT 0,          -- ₹ penalty if deadline missed
  status        TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','FULFILLED','CANCELLED')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============ FEATURE 3: Parts Sourcing ============
CREATE TABLE IF NOT EXISTS public.vendors (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  contact     TEXT,
  rating      DOUBLE PRECISION DEFAULT 4.0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_catalog (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id      UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  part_number    TEXT NOT NULL,                  -- join by part_number (parts are per-site)
  price          DECIMAL(12,2) NOT NULL,
  lead_time_hours INTEGER DEFAULT 48,
  min_order_qty  INTEGER DEFAULT 1,
  in_stock       BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vendor_id, part_number)
);

CREATE TABLE IF NOT EXISTS public.part_compatibility (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  part_number       TEXT NOT NULL,
  compatible_part_number TEXT NOT NULL,
  compatibility_notes TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(part_number, compatible_part_number)
);

-- ============ FEATURE 4: Solution Bidding ============
CREATE TABLE IF NOT EXISTS public.solution_bids (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  technician_id      UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  diagnosis          TEXT,
  solution_steps     JSONB DEFAULT '[]',          -- ordered steps
  parts_list         JSONB DEFAULT '[]',          -- [{part_number, quantity}]
  estimated_hours    DOUBLE PRECISION,
  estimated_cost     DECIMAL(12,2),
  parts_cost         DECIMAL(12,2) DEFAULT 0,
  labor_cost         DECIMAL(12,2) DEFAULT 0,
  score              DOUBLE PRECISION,            -- computed on scoring pass
  score_breakdown    JSONB DEFAULT '{}',
  status             TEXT DEFAULT 'SUBMITTED' CHECK (status IN ('INVITED','SUBMITTED','REJECTED','ACCEPTED')),
  created_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE(service_request_id, technician_id)
);

-- ============ FEATURE 5: Parts Staging ============
CREATE TABLE IF NOT EXISTS public.parts_staging (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id   UUID REFERENCES public.work_orders(id) ON DELETE CASCADE,
  service_request_id UUID REFERENCES public.service_requests(id) ON DELETE CASCADE,
  part_number     TEXT NOT NULL,
  source_type     TEXT CHECK (source_type IN ('LOCAL','CROSS_SITE','VENDOR','SUBSTITUTE')),
  source_site_id  UUID REFERENCES public.sites(id),
  vendor_id       UUID REFERENCES public.vendors(id),
  quantity        INTEGER NOT NULL,
  status          TEXT DEFAULT 'IDENTIFIED' CHECK (status IN ('IDENTIFIED','RESERVED','IN_TRANSIT','STAGED','ISSUED')),
  estimated_arrival TIMESTAMPTZ,
  actual_arrival  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============ FEATURE 7: Knowledge Base ============
CREATE TABLE IF NOT EXISTS public.knowledge_entries (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id      UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  service_request_id UUID REFERENCES public.service_requests(id) ON DELETE SET NULL,
  machine_type       TEXT,
  category           TEXT,
  sub_category       TEXT,
  solution_summary   TEXT,
  solution_steps     JSONB DEFAULT '[]',
  parts_used         JSONB DEFAULT '[]',
  resolution_hours   DOUBLE PRECISION,
  cost               DECIMAL(12,2),
  success_flag       BOOLEAN,                     -- null until 30-day window closes
  success_checked_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now()
);
```

### 2.2 ALTER statements on existing tables

```sql
-- Feature 2: store impact so it can feed priority + heatmap without recompute.
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS cascading_impact_score DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impact_inr DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impact_calculated_at TIMESTAMPTZ;

-- Feature 1: link the generated visualization + the component the AI flagged.
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS ai_sub_category TEXT,          -- e.g. 'BEARING_THERMAL'
  ADD COLUMN IF NOT EXISTS visualization_id UUID REFERENCES public.visualizations(id);

-- Feature 4: track the winning bid.
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS selected_bid_id UUID REFERENCES public.solution_bids(id);

-- Feature 7: technician success rate used by bid scoring (optional denormalization).
ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS success_rate DOUBLE PRECISION DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS jobs_completed INTEGER DEFAULT 0;

-- Feature 2: machine downtime clock (for live impact accrual).
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS downtime_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hourly_output DOUBLE PRECISION DEFAULT 0;  -- units/hour standalone

-- Feature 4: extend the status CHECK to add the bidding phase.
ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN (
    'DRAFT','SUBMITTED','VALIDATING','PENDING_APPROVAL','APPROVED',
    'BIDDING','BID_REVIEW',                 -- NEW (Feature 4)
    'ASSIGNED','IN_PROGRESS','COMPLETED','VERIFIED','CLOSED','EXCEPTION'
  ));
```

### 2.3 Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_machine_components_type ON public.machine_components(machine_type);
CREATE INDEX IF NOT EXISTS idx_ai_component_map_cat ON public.ai_component_map(category, sub_category);
CREATE INDEX IF NOT EXISTS idx_viz_sr ON public.visualizations(service_request_id);
CREATE INDEX IF NOT EXISTS idx_deps_up ON public.machine_dependencies(upstream_machine_id);
CREATE INDEX IF NOT EXISTS idx_deps_down ON public.machine_dependencies(downstream_machine_id);
CREATE INDEX IF NOT EXISTS idx_prod_orders_machine ON public.production_orders(machine_id, status);
CREATE INDEX IF NOT EXISTS idx_vendor_catalog_part ON public.vendor_catalog(part_number);
CREATE INDEX IF NOT EXISTS idx_part_compat ON public.part_compatibility(part_number);
CREATE INDEX IF NOT EXISTS idx_bids_sr ON public.solution_bids(service_request_id);
CREATE INDEX IF NOT EXISTS idx_bids_tech ON public.solution_bids(technician_id);
CREATE INDEX IF NOT EXISTS idx_staging_wo ON public.parts_staging(work_order_id);
CREATE INDEX IF NOT EXISTS idx_staging_sr ON public.parts_staging(service_request_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_lookup ON public.knowledge_entries(machine_type, category, sub_category);
```

### 2.4 RLS (match existing hackathon pattern — permissive, service-role API)

```sql
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'machine_components','ai_component_map','visualizations','machine_dependencies',
    'production_orders','vendors','vendor_catalog','part_compatibility',
    'solution_bids','parts_staging','knowledge_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON public.%I;', t);
    EXECUTE format('CREATE POLICY "Service role full access" ON public.%I FOR ALL USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;
```

Enable Realtime (Dashboard → Database → Replication) for: `solution_bids`, `parts_staging`, `visualizations` (plus existing `service_requests`, `work_orders`, `exception_flags`).

---

## 3. API Endpoints (new)

All behind `authenticate` unless noted; `authorize('OPS_MANAGER','ADMIN')` where an ops decision is made. New route files go in `src/routes/`, services in `src/services/`, mounted in `src/index.ts` (after line 63).

### Feature 1 — `src/routes/visual.routes.ts` → mount `/api/visual`
```ts
// POST /api/visual/generate  — build/fetch the 3D viz for a request
interface GenerateVizReq { service_request_id: string; }
interface GenerateVizRes {
  visualization_id: string;
  machine_type: string;
  highlighted_components: { component_key: string; component_name: string;
    coord: [number,number,number]; color: string; pulse: boolean; reason: string }[];
  all_components: { component_key: string; component_name: string; coord: [number,number,number] }[];
}
// GET /api/visual/:service_request_id  — retrieve cached viz + annotations
// POST /api/visual/:id/annotate  — add a markup  { component_key, note, author_id }
```

### Feature 2 — `src/routes/impact.routes.ts` → mount `/api/impact`
```ts
// POST /api/impact/calculate   { machine_id: string; hours?: number }
interface ImpactNode {
  machine_id: string; machine_code: string; depth: number;
  units_lost_per_hour: number; inr_per_hour: number;
  orders_at_risk: { order_code: string; deadline: string; penalty_inr: number }[];
  children: ImpactNode[];
}
interface ImpactRes {
  root_machine_id: string;
  downstream_count: number;
  total_units_lost_per_hour: number;
  total_inr_per_hour: number;
  total_penalty_at_risk_inr: number;
  cascading_impact_score: number;   // 0..100, feeds priority
  tree: ImpactNode;
}
// GET /api/impact/:service_request_id  — cached score for a request
```

### Feature 3 — `src/routes/parts.routes.ts` → mount `/api/parts`
```ts
// POST /api/parts/availability   { part_numbers: string[]; site_id: string; quantities?: Record<string,number> }
interface SourceOption {
  source_type: 'LOCAL'|'CROSS_SITE'|'VENDOR';
  site_id?: string; site_name?: string; vendor_id?: string; vendor_name?: string;
  available_qty: number; unit_cost: number; lead_time_hours: number;
}
interface PartSourcing {
  part_number: string; required_qty: number;
  sources: SourceOption[];
  cheapest: SourceOption | null; fastest: SourceOption | null;
  unavailable: boolean;
  substitutes: { part_number: string; notes: string }[];
}
interface AvailabilityRes { matrix: PartSourcing[]; }
```

### Feature 4 — `src/routes/bids.routes.ts` → mount `/api/bids`
```ts
// POST /api/service-requests/:id/open-bidding  (OPS/ADMIN) — distribute to top N techs, status APPROVED→BIDDING
//   body { top_n?: number }  -> creates solution_bids rows (status INVITED) + notifications + viz link
// POST /api/bids               (TECHNICIAN) — submit a bid
interface SubmitBidReq {
  service_request_id: string; diagnosis: string;
  solution_steps: string[]; parts_list: { part_number: string; quantity: number }[];
  estimated_hours: number;
}
// GET  /api/bids?service_request_id=   (OPS/ADMIN) — ranked comparison (blind to techs via RLS/route guard)
// POST /api/bids/:id/accept   (OPS/ADMIN) — pick winner: assign tech, reserve parts (F5), status BID_REVIEW→ASSIGNED
```
Scoring (`src/services/bid-scoring.ts`): weighted sum of completeness, cost-efficiency (vs median), technician `success_rate`, estimated time, parts-availability score (from F3), and knowledge-base match bonus (from F7).

### Feature 5 — `src/routes/staging.routes.ts` → mount `/api/staging`
```ts
// POST /api/staging/plan   { work_order_id|service_request_id, parts_list } -> creates parts_staging rows from F3 optimal source
// PATCH /api/staging/:id   { status }  (advances IDENTIFIED→RESERVED→IN_TRANSIT→STAGED→ISSUED)
// GET  /api/staging?work_order_id=
// POST /api/staging/:id/resolve-shortage  { strategy: 'WAIT'|'TEMP_FIX'|'SUBSTITUTE', substitute_part_number? }
```

### Feature 6 — reuse `/api/reports` + Realtime
```ts
// GET /api/reports/heatmap?site_id=&priority=&category=&technician_id=&sla_status=
interface HeatmapCard {
  service_request_id: string; request_number: string; machine_code: string;
  category: string; assigned_technician?: string;
  sla_status: 'GREEN'|'AMBER'|'RED'; time_remaining_mins: number; pct_elapsed: number;
  cascading_impact_score: number; elevated_alert: boolean; // red AND high impact
}
// returns HeatmapCard[]; frontend also subscribes to service_requests Realtime for live refresh
```

### Feature 7 — `src/routes/knowledge.routes.ts` → mount `/api/knowledge`
```ts
// GET /api/knowledge/similar?category=&machine_type=&sub_category=
interface KnowledgeHit {
  entry_id: string; solution_summary: string; parts_used: any[];
  resolution_hours: number; cost: number; success_rate: number; created_at: string;
}
// returns top 3 ranked by success_flag + recency + similarity
// (write path is automatic — see Integration Points §5, on COMPLETED/VERIFIED)
```

---

## 4. Frontend Components (all NEW — `frontend/` is empty)

| Feature | New pages / components (paths) | Notes |
|---|---|---|
| 1 | `frontend/components/visual/MachineViewer3D.tsx` (Three.js canvas, `@react-three/fiber` + `drei`), `frontend/components/visual/ComponentHighlight.tsx`, `frontend/components/service-requests/RemoteDiagnosisPanel.tsx` | Add viewer to `app/service-requests/[id]/page.tsx` |
| 2 | `frontend/components/impact/ImpactTree.tsx` (react-flow or d3 tree), `frontend/components/impact/ImpactSummaryCard.tsx` | Shown on SR detail + heatmap drill-in |
| 3 | `frontend/components/parts/SourcingMatrix.tsx`, `frontend/components/parts/SubstituteBadge.tsx` | Used in bid form + staging page |
| 4 | `frontend/app/bids/page.tsx` (tech: my invitations), `frontend/components/bids/BidForm.tsx`, `frontend/components/bids/BidComparisonTable.tsx` (ops) | Hooks into SR detail when status=BIDDING |
| 5 | `frontend/components/staging/StagingTimeline.tsx`, `frontend/components/staging/ShortageResolver.tsx` | On `app/work-orders/[id]` (create page) |
| 6 | `frontend/app/heatmap/page.tsx`, `frontend/components/heatmap/SlaCard.tsx`, `frontend/components/heatmap/HeatmapFilters.tsx` | Subscribes via `hooks/use-realtime.ts` |
| 7 | `frontend/components/knowledge/SimilarSolutions.tsx` | Embedded in BidForm + SR detail |

Shared infra to create first (also empty today): `frontend/lib/api.ts` (fetch wrapper w/ JWT), `frontend/lib/supabase-browser.ts`, `frontend/hooks/use-realtime.ts`, `frontend/hooks/use-auth.ts`, `frontend/components/ui/*`.

Libraries to add: `three @react-three/fiber @react-three/drei` (F1), `reactflow` or `d3` (F2/F6), `@tanstack/react-query` (recommended for all data fetching).

---

## 5. Integration Points (exact hooks)

> File:line references are against the **current** `src/services/workflow.ts` and `src/routes/ai.routes.ts`.

1. **Feature 1 — generate viz on classify.** In `src/routes/ai.routes.ts:34` (classify handler, after we have `category`/`sub_category`), call a new `buildVisualization(service_request_id, category, sub_category, machine_type)` and persist `service_requests.visualization_id` + `ai_sub_category`. Add the viz payload to the classify response. The AI stub `classify.stub.ts` should also emit a `sub_category` (e.g. map `HYDRAULIC`→`SEAL_LEAK`).

2. **Feature 2 — cascading impact feeds priority.** There is **no central priority function today** — priority is set by `/ai/classify` and stored. Add the hook in `src/services/workflow.ts` inside `transitionStatus`, in the **SUBMITTED block at `workflow.ts:171`**: after setting the SLA deadline, call `computeAndStoreImpact(sr.machine_id)` and, if `cascading_impact_score >= THRESHOLD`, bump `updatePayload.priority` up one tier (auto-escalate). Also expose standalone via `POST /api/impact/calculate`.

3. **Feature 4 — bidding phase replaces direct assignment.** Change the state machine:
   - `workflow.ts:37` — `APPROVED: ['ASSIGNED']` → `APPROVED: ['BIDDING', 'ASSIGNED']` (keep ASSIGNED as a manual-override fallback).
   - Add to `TRANSITIONS` (`workflow.ts:32` block): `BIDDING: ['BID_REVIEW', 'EXCEPTION'],` and `BID_REVIEW: ['ASSIGNED', 'BIDDING'],`.
   - Add to `ALL_STATUSES` (top of workflow.ts) `'BIDDING','BID_REVIEW'`.
   - Add to `TRANSITION_ROLES` (`workflow.ts:47`): `'APPROVED->BIDDING': ['OPS_MANAGER','ADMIN']`, `'BIDDING->BID_REVIEW': ['OPS_MANAGER','ADMIN']`, `'BID_REVIEW->ASSIGNED': ['OPS_MANAGER','ADMIN']`, `'BID_REVIEW->BIDDING': ['OPS_MANAGER','ADMIN']`.
   - **Bid distribution trigger:** in `transitionStatus`, add a new side-effect block (next to `:182`) `if (newStatus === 'BIDDING') { await openBidding(requestId, metadata?.top_n ?? 3); }` — reuses the matcher at `ai.routes.ts:106`/`matchStub` to pick top-N, creates `solution_bids` (INVITED), attaches the F1 viz, and notifies each tech via `notifications.ts`.
   - **Winner acceptance:** `POST /api/bids/:id/accept` sets `selected_bid_id`, then calls `transitionStatus(requestId, 'ASSIGNED', ..., { technician_id })` — which already increments job count at `workflow.ts:182`. Add parts reservation (F5) right after.

4. **Feature 1 payload into matching/bidding.** The match payload is built at `ai.routes.ts:139-154`. When `openBidding` fans out, include `visualization_id` so each invited technician's bid UI loads the 3D view.

5. **Feature 5 — stage parts on bid accept.** In `POST /api/bids/:id/accept` (after the ASSIGNED transition), call `planStaging(work_order_id, winningBid.parts_list)` which uses F3 `/parts/availability` to choose source and writes `parts_staging` rows. Reserve via the existing `reservations` table + `spare_parts.quantity_reserved` (same pattern as the base `/spare-parts/:id/reserve` route Dev B builds).

6. **Feature 6 — heatmap.** Pure read model over `service_requests` + `cascading_impact_score` (F2). Compute `sla_status` from `sla_deadline` vs `now()` (mirror the SLA logic Dev B's `reports.ts` `getSLAReport` will use). `elevated_alert = sla_status==='RED' && cascading_impact_score >= HIGH`. Live refresh via existing `use-realtime.ts` subscription on `service_requests`.

7. **Feature 7 — auto-write knowledge on close.** In `transitionStatus`, add a side-effect when `newStatus === 'COMPLETED'` (block at `workflow.ts` ~`:195`, where `completed_at`/`resolution_notes` are set): enqueue `writeKnowledgeEntry(requestId)` capturing machine_type, category, sub_category, winning bid, parts used, actual hours/cost. Set `success_flag` later via a scheduled check (or lazily when queried) using the 30-day no-repeat-failure rule. Read path: `GET /api/knowledge/similar`, and feed matches into bid scoring (`bid-scoring.ts`).

> All new side-effects in `transitionStatus` must be wrapped in try/catch like the existing audit (`:223`) and notify (`:238`) blocks — **non-fatal**, so a feature failure never strands a transition.

---

## 6. Feature Dependency Order (build sequence)

```
Wave 0 (foundations, parallelizable):
  F2 Impact ───────┐
  F3 Parts Sourcing┤   (independent)
  F1 3D Visual ────┘

Wave 1:
  F4 Bidding   ← needs F1 (viz in bid UI) + F3 (parts availability in bids)

Wave 2:
  F5 Staging   ← needs F3 + F4 (winning bid's parts)
  F6 Heatmap   ← needs F2 (impact score)   [can start in Wave 0 w/ placeholder score]
  F7 Knowledge ← needs F4 (winning bid to archive)
```

Recommended order for a hackathon: **F3 → F2 → F1 → F4 → F5 → F7 → F6**. (F3 first because F4/F5 both consume it; F6 last since it's mostly presentation over F2.)

---

## 7. Estimated Effort (per feature, hours)

| Feature | DB | Backend | Frontend | Integration | Total |
|---|---|---|---|---|---|
| F1 3D Visual | 1 | 3 (viz service + route + seed component map) | 6 (Three.js viewer) | 1 | **11** |
| F2 Impact | 1 | 4 (recursive tree + ₹ calc) | 3 (tree graph) | 1.5 | **9.5** |
| F3 Parts Sourcing | 1 | 4 (sourcing matrix + substitutes) | 2.5 | 1 | **8.5** |
| F4 Bidding | 1.5 | 5 (distribute + scoring + accept) | 4 (bid form + compare table) | 2 (state machine) | **12.5** |
| F5 Staging | 0.5 | 3 | 2 | 1.5 | **7** |
| F6 Heatmap | 0 | 1.5 (read model) | 4 (cards + filters + realtime) | 0.5 | **6** |
| F7 Knowledge | 0.5 | 2.5 (write + similar) | 1.5 | 1 (scoring tie-in) | **5.5** |
| | | | | **Grand total** | **~60 h** |

For a 2-dev sprint that's ~30h each; prioritize **F1 (professor's novelty) + F2 (₹ impact wows judges) + F4 (the differentiator)** if time is short.

---

## 8. Mock Data (seed additions → extend `scripts/seed.ts`)

```ts
// F1: component catalog + AI→component map (generic CNC Mill)
machine_components: [
  { machine_type:'CNC Mill', component_key:'spindle', component_name:'Spindle Assembly', coord_x:0, coord_y:1.2, coord_z:0 },
  { machine_type:'CNC Mill', component_key:'bearing_assembly', component_name:'Main Bearing', coord_x:0.4, coord_y:0.8, coord_z:0 },
  { machine_type:'CNC Mill', component_key:'hydraulic_pump', component_name:'Hydraulic Pump', coord_x:-0.6, coord_y:0.3, coord_z:0.2 },
  { machine_type:'CNC Mill', component_key:'tool_head', component_name:'Tool Head', coord_x:0, coord_y:1.6, coord_z:0.3 },
]
ai_component_map: [
  { category:'HYDRAULIC', sub_category:'SEAL_LEAK', machine_type:'CNC Mill', component_key:'hydraulic_pump', highlight_color:'#ef4444' },
  { category:'MECHANICAL', sub_category:'BEARING_THERMAL', machine_type:'CNC Mill', component_key:'bearing_assembly', highlight_color:'#f97316' },
]
// F2: dependency chain M-104 → M-200 → M-300 (use seeded machine ids)
machine_dependencies: [
  { upstream:'M-104', downstream:'M-200', dependency_type:'FEEDS', throughput_rate:40, unit_value:1200, buffer_hours:1 },
  { upstream:'M-200', downstream:'M-300', dependency_type:'FEEDS', throughput_rate:35, unit_value:1800, buffer_hours:0.5 },
]
production_orders: [
  { order_code:'PO-5001', machine:'M-300', quantity:500, unit_value:1800, deadline:'+36h', sla_penalty:50000 },
]
// F3
vendors: [{ name:'Acme Industrial Supply', rating:4.6 }, { name:'FastParts Logistics', rating:4.2 }]
vendor_catalog: [
  { vendor:'Acme', part_number:'HS-100', price:52.00, lead_time_hours:24, min_order_qty:2 },
  { vendor:'FastParts', part_number:'HS-100', price:61.00, lead_time_hours:8, min_order_qty:1 },
]
part_compatibility: [{ part_number:'HS-100', compatible_part_number:'HS-100X', notes:'OEM-equivalent seal, +2mm' }]
// F4 / F7 can be generated by running demo-flow once bidding exists.
```
(Resolve `'M-104'` etc. to UUIDs the same way `seed.ts` already does with `machines.find(m => m.code === 'M-104')`.)

---

## 9. Risk Areas & Edge Cases

**Could break existing functionality:**
- **State-machine edit (F4) is the highest-risk change.** Altering `TRANSITIONS`/`ALL_STATUSES`/the status CHECK affects the audit chain, notifications, SLA, `demo-flow.ts`, and all existing workflow tests. ✅ Mitigation: keep `APPROVED→ASSIGNED` as a legal fallback; update `tests/workflow.pure.test.ts` + `workflow.transition.test.ts`; re-run `npm test`.
- **Status CHECK ALTER** will fail if any row holds a status not in the new list — safe here (new states are additive).
- **`seed.ts` / `demo-flow.ts`** assume the current 10-step path; add the bidding detour behind a flag so the base demo still runs.

**Edge cases to handle:**
- **F2 cyclic dependencies** — `machine_dependencies` could contain a cycle; the recursive impact walk must track visited machine_ids (depth cap too) to avoid infinite loops.
- **F2 buffer_hours** — downstream isn't impacted until buffer is exhausted; don't double-count units already produced.
- **F3 part identity** — parts are per-site rows keyed by `part_number`; cross-site/vendor joins are by `part_number`, so enforce consistent part numbering or you'll miss sources.
- **F3/F5 concurrent reservations** — two accepted bids reserving the last unit; reserve inside a transaction / re-check `quantity_available - quantity_reserved` before committing (same race the base `/spare-parts/:id/reserve` must guard).
- **F4 blind bids** — the `GET /api/bids` list must be ops/admin-only; a technician hitting it should see only their own bid. Enforce in the route, not just RLS (service-role bypasses RLS).
- **F4 no bids submitted / timeout** — add a bidding deadline; if zero bids, fall back to auto-assign via the matcher (the old `APPROVED→ASSIGNED` path).
- **F1 unknown component** — if `ai_component_map` has no row for a category/sub_category, highlight nothing (don't crash the viewer); default-color the whole model.
- **F7 success_flag timing** — it's unknown for 30 days; treat `null` as "pending" in scoring (don't penalize), and backfill via a scheduled job or lazy check.
- **F6 Realtime load** — subscribing every heatmap client to all `service_requests` can be chatty; scope subscriptions by site and debounce re-renders.

**Security:**
- All new ops-decision routes (`open-bidding`, `bids/:id/accept`, `staging/*`, `impact/calculate` write) must use `authorize('OPS_MANAGER','ADMIN')`. The API uses the **service-role key (bypasses RLS)**, so authorization MUST be enforced in middleware — RLS is not your backstop here.

---

### Build checklist (tick as you go)
- [ ] Run `sql/features.sql` (tables + ALTERs + indexes + RLS) in Supabase
- [ ] Enable Realtime on `solution_bids`, `parts_staging`, `visualizations`
- [ ] F3 `parts.routes.ts` + service  → F2 `impact.routes.ts` + service → F1 `visual.routes.ts` + service
- [ ] Edit `workflow.ts` state machine (F4) + update workflow tests → `npm test` green
- [ ] F4 bids (distribute/score/accept) → F5 staging → F7 knowledge → F6 heatmap
- [ ] Extend `scripts/seed.ts` with §8 mock data; re-run `npm run seed`
- [ ] Mount all new routers in `src/index.ts` after line 63
```
