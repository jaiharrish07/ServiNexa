-- ============================================================================
-- ServiNexa — AI Orchestration Pipeline migration
-- Run AFTER features.sql. Re-runnable: IF NOT EXISTS / guarded.
-- ============================================================================

-- ── AI triage columns on service_requests ───────────────────────────────────
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS ai_category               TEXT,
  ADD COLUMN IF NOT EXISTS ai_priority               TEXT,
  ADD COLUMN IF NOT EXISTS ai_confidence             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ai_urgency_score          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ai_triage_source          TEXT,
  ADD COLUMN IF NOT EXISTS ai_triage_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_knowledge_matches      JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_knowledge_source       TEXT,
  ADD COLUMN IF NOT EXISTS ai_recommended_technicians JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_match_source           TEXT,
  ADD COLUMN IF NOT EXISTS ai_pipeline_status        TEXT DEFAULT 'PENDING'
                            CHECK (ai_pipeline_status IN ('PENDING','RUNNING','COMPLETE','PARTIAL','FAILED')),
  ADD COLUMN IF NOT EXISTS ai_pipeline_completed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_pipeline_steps         JSONB DEFAULT '{}';

-- ── AI predictions table (links predictions to requests) ────────────────────
CREATE TABLE IF NOT EXISTS public.ai_predictions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_request_id     UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  machine_id             UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  failure_probability    DOUBLE PRECISION DEFAULT 0,
  risk_level             TEXT,
  predicted_failure_mode TEXT,
  recommended_action     TEXT,
  confidence             DOUBLE PRECISION DEFAULT 0,
  source                 TEXT NOT NULL DEFAULT 'stub',
  created_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictions_sr ON public.ai_predictions(service_request_id);

-- RLS
ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.ai_predictions;
CREATE POLICY "Service role full access" ON public.ai_predictions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Deduct spare-part inventory when parts are consumed (ISSUED) ───────────
CREATE OR REPLACE FUNCTION public.deduct_spare_part(
  p_part_number TEXT,
  p_site_id UUID,
  p_quantity INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_part public.spare_parts;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO selected_part
    FROM public.spare_parts
    WHERE part_number = p_part_number AND site_id = p_site_id
    FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.spare_parts
    SET quantity_available = GREATEST(0, COALESCE(quantity_available, 0) - p_quantity),
        quantity_reserved  = GREATEST(0, COALESCE(quantity_reserved, 0) - p_quantity)
    WHERE id = selected_part.id;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_spare_part(TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_spare_part(TEXT, UUID, INTEGER) TO service_role;
