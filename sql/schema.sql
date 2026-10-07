-- ============================================================================
-- ServiNexa — Industrial Equipment Service-Request Management Platform
-- Supabase / PostgreSQL schema (idempotent-leaning, re-runnable)
--
-- Paste this entire file into the Supabase SQL Editor and run it.
-- Safe to run multiple times: tables use CREATE TABLE IF NOT EXISTS,
-- indexes use CREATE INDEX IF NOT EXISTS, triggers are dropped before
-- (re)creation, and RLS policies are dropped before (re)creation.
--
-- Table creation order respects foreign-key dependencies:
--   users -> sites -> machines -> technicians -> service_requests ->
--   work_orders -> spare_parts -> reservations -> exception_flags ->
--   documents -> audit_logs -> notifications
-- ============================================================================

-- Required for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- === 1. USERS ===
-- Application user records, linked 1:1 to Supabase auth.users.
CREATE TABLE IF NOT EXISTS public.users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id     UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL UNIQUE,
    full_name   TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('ADMIN','OPS_MANAGER','TECHNICIAN','CUSTOMER')),
    phone       TEXT,
    avatar_url  TEXT,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);


-- === 2. SITES ===
-- Physical facilities / locations where machines are installed.
CREATE TABLE IF NOT EXISTS public.sites (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    code        TEXT NOT NULL UNIQUE,
    address     TEXT,
    city        TEXT,
    state       TEXT,
    country     TEXT DEFAULT 'US',
    lat         DOUBLE PRECISION,
    lng         DOUBLE PRECISION,
    timezone    TEXT DEFAULT 'America/New_York',
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);


-- === 3. MACHINES ===
-- Industrial equipment, including latest sensor telemetry snapshots.
CREATE TABLE IF NOT EXISTS public.machines (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id                 UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    code                    TEXT NOT NULL UNIQUE,
    type                    TEXT NOT NULL,
    manufacturer            TEXT,
    model                   TEXT,
    serial_number           TEXT,
    install_date            DATE,
    status                  TEXT DEFAULT 'OPERATIONAL' CHECK (status IN ('OPERATIONAL','DEGRADED','DOWN','MAINTENANCE')),
    criticality             TEXT DEFAULT 'MEDIUM' CHECK (criticality IN ('CRITICAL','HIGH','MEDIUM','LOW')),
    -- Sensor telemetry snapshot
    air_temp                DOUBLE PRECISION,
    process_temp            DOUBLE PRECISION,
    rotational_speed        INTEGER,
    torque                  DOUBLE PRECISION,
    tool_wear               INTEGER,
    last_maintenance_date   TIMESTAMPTZ,
    next_maintenance_date   TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);


-- === 4. TECHNICIANS ===
-- Field technicians; extends a user with scheduling / skill metadata.
CREATE TABLE IF NOT EXISTS public.technicians (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    site_id              UUID NOT NULL REFERENCES public.sites(id),
    employee_code        TEXT NOT NULL UNIQUE,
    specializations      TEXT[] DEFAULT '{}',
    certifications       TEXT[] DEFAULT '{}',
    max_concurrent_jobs  INTEGER DEFAULT 3,
    current_job_count    INTEGER DEFAULT 0,
    avg_resolution_hours DOUBLE PRECISION DEFAULT 4.0,
    rating               DOUBLE PRECISION DEFAULT 4.0,
    is_available         BOOLEAN DEFAULT true,
    lat                  DOUBLE PRECISION,
    lng                  DOUBLE PRECISION,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now()
);


-- === 5. SERVICE_REQUESTS ===
-- Core service-request lifecycle entity.
CREATE TABLE IF NOT EXISTS public.service_requests (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_number          TEXT NOT NULL UNIQUE,
    site_id                 UUID NOT NULL REFERENCES public.sites(id),
    machine_id              UUID REFERENCES public.machines(id),
    requester_id            UUID NOT NULL REFERENCES public.users(id),
    title                   TEXT NOT NULL,
    description             TEXT NOT NULL,
    raw_input               TEXT,
    category                TEXT CHECK (category IN ('MECHANICAL','ELECTRICAL','HYDRAULIC','PNEUMATIC','SOFTWARE','CALIBRATION','SAFETY','PREVENTIVE','OTHER')),
    priority                TEXT DEFAULT 'MEDIUM' CHECK (priority IN ('CRITICAL','HIGH','MEDIUM','LOW')),
    ai_confidence           DOUBLE PRECISION,
    status                  TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','VALIDATING','PENDING_APPROVAL','APPROVED','ASSIGNED','IN_PROGRESS','COMPLETED','VERIFIED','CLOSED','EXCEPTION')),
    approved_by             UUID REFERENCES public.users(id),
    approved_at             TIMESTAMPTZ,
    assigned_technician_id  UUID REFERENCES public.technicians(id),
    assigned_at             TIMESTAMPTZ,
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    verified_at             TIMESTAMPTZ,
    closed_at               TIMESTAMPTZ,
    sla_deadline            TIMESTAMPTZ,
    resolution_notes        TEXT,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);


-- === 6. WORK_ORDERS ===
-- Execution unit derived from an approved service request.
CREATE TABLE IF NOT EXISTS public.work_orders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number        TEXT NOT NULL UNIQUE,
    service_request_id  UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
    technician_id       UUID NOT NULL REFERENCES public.technicians(id),
    description         TEXT,
    estimated_hours     DOUBLE PRECISION,
    actual_hours        DOUBLE PRECISION,
    status              TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);


-- === 7. SPARE_PARTS ===
-- Per-site spare-parts inventory.
CREATE TABLE IF NOT EXISTS public.spare_parts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id             UUID NOT NULL REFERENCES public.sites(id),
    name                TEXT NOT NULL,
    part_number         TEXT NOT NULL,
    category            TEXT,
    quantity_available  INTEGER DEFAULT 0,
    quantity_reserved   INTEGER DEFAULT 0,
    reorder_level       INTEGER DEFAULT 5,
    unit_cost           DECIMAL(10,2),
    location            TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE (site_id, part_number)
);


-- === 8. RESERVATIONS ===
-- Spare-part reservations tied to a work order.
CREATE TABLE IF NOT EXISTS public.reservations (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    spare_part_id  UUID NOT NULL REFERENCES public.spare_parts(id),
    work_order_id  UUID NOT NULL REFERENCES public.work_orders(id),
    quantity       INTEGER NOT NULL,
    status         TEXT DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','ISSUED','RETURNED','CANCELLED')),
    reserved_at    TIMESTAMPTZ DEFAULT now(),
    issued_at      TIMESTAMPTZ,
    returned_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT now()
);


-- === 9. EXCEPTION_FLAGS ===
-- Exceptions raised against a service request (dropouts, breaches, etc.).
CREATE TABLE IF NOT EXISTS public.exception_flags (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_request_id  UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
    type                TEXT NOT NULL CHECK (type IN ('TECH_DROPOUT','PART_UNAVAILABLE','SLA_BREACH','ESCALATION','OTHER')),
    description         TEXT NOT NULL,
    severity            TEXT DEFAULT 'MEDIUM' CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
    status              TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
    raised_by           UUID REFERENCES public.users(id),
    resolved_by         UUID REFERENCES public.users(id),
    resolved_at         TIMESTAMPTZ,
    resolution_notes    TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);


-- === 10. DOCUMENTS ===
-- Attachments linked to service requests and/or work orders.
CREATE TABLE IF NOT EXISTS public.documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_request_id  UUID REFERENCES public.service_requests(id) ON DELETE CASCADE,
    work_order_id       UUID REFERENCES public.work_orders(id),
    name                TEXT NOT NULL,
    file_url            TEXT NOT NULL,
    file_type           TEXT,
    file_size           INTEGER,
    uploaded_by         UUID REFERENCES public.users(id),
    created_at          TIMESTAMPTZ DEFAULT now()
);


-- === 11. AUDIT_LOGS ===
-- Append-only, hash-chained audit trail.
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type   TEXT NOT NULL,
    entity_id     UUID NOT NULL,
    action        TEXT NOT NULL,
    field_changed TEXT,
    old_value     TEXT,
    new_value     TEXT,
    performed_by  UUID REFERENCES public.users(id),
    ip_address    TEXT,
    user_agent    TEXT,
    metadata      JSONB DEFAULT '{}',
    prev_hash     TEXT,
    hash          TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now()
);


-- === 12. NOTIFICATIONS ===
-- Per-user in-app notifications.
CREATE TABLE IF NOT EXISTS public.notifications (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title                TEXT NOT NULL,
    message              TEXT NOT NULL,
    type                 TEXT DEFAULT 'INFO' CHECK (type IN ('INFO','WARNING','CRITICAL','SUCCESS')),
    related_entity_type  TEXT,
    related_entity_id    UUID,
    is_read              BOOLEAN DEFAULT false,
    created_at           TIMESTAMPTZ DEFAULT now()
);


-- === 13. INDEXES ===
CREATE INDEX IF NOT EXISTS idx_machines_site        ON public.machines (site_id);
CREATE INDEX IF NOT EXISTS idx_machines_status      ON public.machines (status);
CREATE INDEX IF NOT EXISTS idx_technicians_site     ON public.technicians (site_id);
CREATE INDEX IF NOT EXISTS idx_technicians_available ON public.technicians (is_available);
CREATE INDEX IF NOT EXISTS idx_sr_status            ON public.service_requests (status);
CREATE INDEX IF NOT EXISTS idx_sr_site              ON public.service_requests (site_id);
CREATE INDEX IF NOT EXISTS idx_sr_technician        ON public.service_requests (assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_sr_created           ON public.service_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wo_sr                ON public.work_orders (service_request_id);
CREATE INDEX IF NOT EXISTS idx_wo_tech              ON public.work_orders (technician_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity         ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created        ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exception_sr         ON public.exception_flags (service_request_id);
CREATE INDEX IF NOT EXISTS idx_parts_site           ON public.spare_parts (site_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON public.notifications (user_id, is_read);


-- === 14. UPDATED_AT TRIGGER ===
-- Shared trigger function: stamp updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply BEFORE UPDATE trigger to every table that has an updated_at column.
DROP TRIGGER IF EXISTS set_updated_at ON public.users;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.sites;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sites
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.machines;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.machines
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.technicians;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.technicians
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.service_requests;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.service_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.work_orders;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.work_orders
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.spare_parts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.spare_parts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- === 15. ATOMIC JOB-COUNT RPCs ===
-- Backend calls these instead of read-modify-write to avoid races on
-- technicians.current_job_count under concurrent assignment.
CREATE OR REPLACE FUNCTION public.increment_job_count(tech_id UUID)
RETURNS void AS $$
  UPDATE public.technicians
  SET current_job_count = current_job_count + 1
  WHERE id = tech_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION public.decrement_job_count(tech_id UUID)
RETURNS void AS $$
  UPDATE public.technicians
  SET current_job_count = GREATEST(0, current_job_count - 1)
  WHERE id = tech_id;
$$ LANGUAGE sql;


-- === 16. ROW LEVEL SECURITY ===
-- Enable RLS on every table. For the hackathon we add a single permissive
-- policy per table so the service role / authenticated access works without
-- per-role rules. Tighten these before any production use.
ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technicians      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spare_parts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exception_flags  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.users;
CREATE POLICY "Service role full access" ON public.users            FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.sites;
CREATE POLICY "Service role full access" ON public.sites            FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.machines;
CREATE POLICY "Service role full access" ON public.machines         FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.technicians;
CREATE POLICY "Service role full access" ON public.technicians      FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.service_requests;
CREATE POLICY "Service role full access" ON public.service_requests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.work_orders;
CREATE POLICY "Service role full access" ON public.work_orders      FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.spare_parts;
CREATE POLICY "Service role full access" ON public.spare_parts      FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.reservations;
CREATE POLICY "Service role full access" ON public.reservations     FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.exception_flags;
CREATE POLICY "Service role full access" ON public.exception_flags  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.documents;
CREATE POLICY "Service role full access" ON public.documents        FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.audit_logs;
CREATE POLICY "Service role full access" ON public.audit_logs       FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.notifications;
CREATE POLICY "Service role full access" ON public.notifications    FOR ALL USING (true) WITH CHECK (true);


-- ============================================================================
-- REALTIME
-- After running this script, enable Realtime for the following tables in the
-- Supabase Dashboard -> Database -> Replication:
--   service_requests, work_orders, exception_flags, machines, notifications
-- ============================================================================
