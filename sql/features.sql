-- ============================================================================
-- ServiNexa — Phase B feature migration (run AFTER sql/schema.sql)
-- 7 novelty features. Re-runnable: IF NOT EXISTS / CREATE OR REPLACE / guarded.
-- Uses uuid_generate_v4() to match schema.sql (uuid-ossp already enabled there).
-- ============================================================================

-- ============ ALTER service_requests (bidding states + feature columns) ============
ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN (
    'DRAFT','SUBMITTED','VALIDATING','PENDING_APPROVAL','APPROVED',
    'BIDDING','BID_REVIEW','BID_ACCEPTED',          -- NEW (Feature 4)
    'ASSIGNED','IN_PROGRESS','COMPLETED','VERIFIED','CLOSED','EXCEPTION'
  ));

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS ai_sub_category         TEXT,
  ADD COLUMN IF NOT EXISTS cascading_impact_score  DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impact_inr              DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impact_calculated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visualization_id        UUID,
  ADD COLUMN IF NOT EXISTS selected_bid_id         UUID;

-- Technician success metrics used by bid scoring (Feature 7 tie-in).
ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS success_rate   DOUBLE PRECISION DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS jobs_completed INTEGER DEFAULT 0;

-- Machine downtime clock + standalone output (Feature 2 live accrual).
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS downtime_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hourly_output       DOUBLE PRECISION DEFAULT 0;

-- ============ FEATURE 1: 3D Visual Diagnosis ============
CREATE TABLE IF NOT EXISTS public.machine_model_components (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_type   TEXT NOT NULL,
  sub_category   TEXT,                                 -- nullable = applies to all failure tags
  component_id   TEXT NOT NULL,                        -- stable key, e.g. 'hydraulic_pump'
  component_name TEXT NOT NULL,
  coord_x        DOUBLE PRECISION DEFAULT 0,
  coord_y        DOUBLE PRECISION DEFAULT 0,
  coord_z        DOUBLE PRECISION DEFAULT 0,
  highlight_color TEXT DEFAULT '#ff4444',
  model_path     TEXT,                                 -- nullable: viewer uses procedural geometry
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(machine_type, component_id)
);

CREATE TABLE IF NOT EXISTS public.visual_diagnoses (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_request_id    UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  machine_id            UUID REFERENCES public.machines(id),
  machine_type          TEXT,
  affected_component_id TEXT NOT NULL,
  component_name        TEXT NOT NULL,
  ai_analysis           JSONB NOT NULL DEFAULT '{}',
  model_snapshot_url    TEXT,
  status                TEXT DEFAULT 'PENDING_REVIEW'
                        CHECK (status IN ('PENDING_REVIEW','REVIEWING','DIAGNOSIS_COMPLETE','CLOSED')),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.technician_diagnoses (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visual_diagnosis_id UUID NOT NULL REFERENCES public.visual_diagnoses(id) ON DELETE CASCADE,
  technician_id      UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  diagnosis_text     TEXT NOT NULL,
  proposed_solution  TEXT NOT NULL,
  parts_needed       JSONB DEFAULT '[]',
  estimated_cost     DECIMAL(12,2),
  estimated_hours    DECIMAL(6,2),
  confidence_level   TEXT CHECK (confidence_level IN ('HIGH','MEDIUM','LOW')),
  is_selected        BOOLEAN DEFAULT false,
  submitted_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(visual_diagnosis_id, technician_id)
);

-- ============ FEATURE 2: Cascading Impact ============
CREATE TABLE IF NOT EXISTS public.machine_dependencies (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id            UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,       -- upstream (source)
  depends_on_machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,       -- downstream (affected)
  dependency_type       TEXT DEFAULT 'DIRECT' CHECK (dependency_type IN ('DIRECT','INDIRECT','SHARED_RESOURCE')),
  impact_weight         DECIMAL(3,2) DEFAULT 1.0,
  throughput_rate       DOUBLE PRECISION DEFAULT 0,    -- units/hr on this edge  (#5 fix)
  unit_value            DECIMAL(12,2) DEFAULT 0,       -- INR/unit on this edge  (#5 fix)
  buffer_hours          DOUBLE PRECISION DEFAULT 0,
  production_line       TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(machine_id, depends_on_machine_id),
  CHECK (machine_id <> depends_on_machine_id)
);

CREATE TABLE IF NOT EXISTS public.production_orders (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_code  TEXT NOT NULL UNIQUE,
  machine_id  UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL,
  unit_value  DECIMAL(12,2) DEFAULT 0,
  deadline    TIMESTAMPTZ NOT NULL,
  sla_penalty DECIMAL(12,2) DEFAULT 0,
  status      TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','FULFILLED','CANCELLED')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.impact_analyses (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_request_id        UUID REFERENCES public.service_requests(id) ON DELETE CASCADE,
  source_machine_id         UUID REFERENCES public.machines(id),
  affected_machines         JSONB DEFAULT '[]',
  total_hourly_impact_inr   DECIMAL(14,2) DEFAULT 0,
  cascade_depth             INTEGER DEFAULT 0,
  production_lines_affected JSONB DEFAULT '[]',
  cascading_impact_score    DOUBLE PRECISION DEFAULT 0,
  ai_analysis               JSONB DEFAULT '{}',
  source                    TEXT DEFAULT 'ai',
  created_at                TIMESTAMPTZ DEFAULT now()
);

-- ============ FEATURE 3: Parts sourcing (reuses existing spare_parts) ============
CREATE TABLE IF NOT EXISTS public.external_vendors (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  contact_email     TEXT,
  phone             TEXT,
  location          TEXT,
  avg_delivery_hours INTEGER DEFAULT 48,
  reliability_score DECIMAL(3,2) DEFAULT 0.8,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_parts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id      UUID NOT NULL REFERENCES public.external_vendors(id) ON DELETE CASCADE,
  part_number    TEXT NOT NULL,                     -- join by part_number (spare_parts are per-site)
  unit_price_inr DECIMAL(10,2),
  lead_time_hours INTEGER DEFAULT 48,
  in_stock       BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vendor_id, part_number)
);

CREATE TABLE IF NOT EXISTS public.part_substitutes (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_part_number   TEXT NOT NULL,
  substitute_part_number TEXT NOT NULL,
  compatibility_score    DECIMAL(3,2) DEFAULT 0.8,
  notes                  TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE(original_part_number, substitute_part_number)
);

-- ============ FEATURE 4: Collaborative bidding ============
CREATE TABLE IF NOT EXISTS public.bid_rounds (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  status             TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','DECIDED')),
  deadline           TIMESTAMPTZ,
  winning_bid_id     UUID,
  opened_at          TIMESTAMPTZ DEFAULT now(),
  closed_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.solution_bids (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  bid_round_id       UUID REFERENCES public.bid_rounds(id) ON DELETE CASCADE,
  technician_id      UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  proposed_solution  TEXT NOT NULL,
  parts_list         JSONB DEFAULT '[]',
  labor_hours        DECIMAL(6,2) NOT NULL,
  total_cost         DECIMAL(12,2) NOT NULL,
  approach_description TEXT,
  ai_score           JSONB,
  status             TEXT DEFAULT 'SUBMITTED' CHECK (status IN ('INVITED','SUBMITTED','UNDER_REVIEW','ACCEPTED','REJECTED')),
  submitted_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(service_request_id, technician_id)
);

-- ============ FEATURE 5: Pre-dispatch parts staging ============
CREATE TABLE IF NOT EXISTS public.parts_staging (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_request_id UUID REFERENCES public.service_requests(id) ON DELETE CASCADE,
  work_order_id      UUID REFERENCES public.work_orders(id) ON DELETE CASCADE,
  part_number        TEXT NOT NULL,
  quantity           INTEGER NOT NULL,
  source_type        TEXT CHECK (source_type IN ('LOCAL_SITE','OTHER_SITE','EXTERNAL_VENDOR','SUBSTITUTE')),
  source_id          UUID,
  status             TEXT DEFAULT 'IDENTIFIED'
                     CHECK (status IN ('IDENTIFIED','RESERVED','IN_TRANSIT','STAGED','ISSUED')),
  staging_location   TEXT,
  eta                TIMESTAMPTZ,
  staged_by          UUID REFERENCES public.users(id),
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- ============ FEATURE 7: Knowledge base ============
CREATE TABLE IF NOT EXISTS public.knowledge_entries (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id        UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  service_request_id   UUID REFERENCES public.service_requests(id) ON DELETE SET NULL,
  machine_type         TEXT NOT NULL,
  category             TEXT NOT NULL,
  sub_category         TEXT,
  problem_description  TEXT NOT NULL,
  solution_applied     TEXT NOT NULL,
  parts_used           JSONB DEFAULT '[]',
  resolution_hours     DECIMAL(6,2),
  cost                 DECIMAL(12,2),
  effectiveness_rating INTEGER CHECK (effectiveness_rating BETWEEN 1 AND 5),
  success_flag         BOOLEAN,                        -- null until the 30-day window closes
  success_checked_at   TIMESTAMPTZ,
  technician_id        UUID REFERENCES public.technicians(id),
  tags                 TEXT[] DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- ============ Indexes ============
CREATE INDEX IF NOT EXISTS idx_mmc_type        ON public.machine_model_components(machine_type);
CREATE INDEX IF NOT EXISTS idx_visdiag_sr       ON public.visual_diagnoses(service_request_id);
CREATE INDEX IF NOT EXISTS idx_techdiag_vd      ON public.technician_diagnoses(visual_diagnosis_id);
CREATE INDEX IF NOT EXISTS idx_deps_machine     ON public.machine_dependencies(machine_id);
CREATE INDEX IF NOT EXISTS idx_deps_down        ON public.machine_dependencies(depends_on_machine_id);
CREATE INDEX IF NOT EXISTS idx_prod_orders      ON public.production_orders(machine_id, status);
CREATE INDEX IF NOT EXISTS idx_impact_sr        ON public.impact_analyses(service_request_id);
CREATE INDEX IF NOT EXISTS idx_vendor_parts     ON public.vendor_parts(part_number);
CREATE INDEX IF NOT EXISTS idx_part_subs        ON public.part_substitutes(original_part_number);
CREATE INDEX IF NOT EXISTS idx_bids_sr          ON public.solution_bids(service_request_id);
CREATE INDEX IF NOT EXISTS idx_bids_tech        ON public.solution_bids(technician_id);
CREATE INDEX IF NOT EXISTS idx_bid_rounds_sr    ON public.bid_rounds(service_request_id);
CREATE INDEX IF NOT EXISTS idx_staging_sr       ON public.parts_staging(service_request_id);
CREATE INDEX IF NOT EXISTS idx_staging_wo       ON public.parts_staging(work_order_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_lookup ON public.knowledge_entries(machine_type, category, sub_category);

-- ============ updated_at triggers (reuse update_updated_at from schema.sql) ============
DROP TRIGGER IF EXISTS set_updated_at ON public.visual_diagnoses;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.visual_diagnoses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.parts_staging;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.parts_staging FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============ RLS (permissive hackathon policy — API uses the service role) ============
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'machine_model_components','visual_diagnoses','technician_diagnoses',
    'machine_dependencies','production_orders','impact_analyses',
    'external_vendors','vendor_parts','part_substitutes',
    'bid_rounds','solution_bids','parts_staging','knowledge_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON public.%I;', t);
    EXECUTE format('CREATE POLICY "Service role full access" ON public.%I FOR ALL USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;

-- Enable Realtime (Dashboard → Database → Replication) for:
--   visual_diagnoses, technician_diagnoses, solution_bids, parts_staging
--   (plus the schema.sql set: service_requests, work_orders, exception_flags, machines, notifications)
