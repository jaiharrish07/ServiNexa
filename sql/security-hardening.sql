-- Revoke broad direct-client access from the public API schema.
-- The Express API uses Supabase's server-side service-role key. All tables keep
-- RLS enabled and no anon/authenticated policy is installed by this project.
-- Re-runnable: removes every existing policy from the managed tables first.
DO $$
DECLARE
  table_name TEXT;
  policy_row RECORD;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users','sites','machines','technicians','service_requests','work_orders',
    'spare_parts','reservations','exception_flags','documents','audit_logs','notifications',
    'machine_model_components','visual_diagnoses','technician_diagnoses',
    'machine_dependencies','production_orders','impact_analyses','external_vendors',
    'vendor_parts','part_substitutes','bid_rounds','solution_bids','parts_staging','knowledge_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    FOR policy_row IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_row.policyname, table_name);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY "Service role full access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      table_name
    );
  END LOOP;
END $$;

-- Serialize audit appends in one DB transaction and give each row a stable order.
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS chain_position BIGINT;
ALTER TABLE public.parts_staging ADD COLUMN IF NOT EXISTS actual_arrival TIMESTAMPTZ;
DO $$
DECLARE
  max_position BIGINT;
BEGIN
  WITH unnumbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
    FROM public.audit_logs WHERE chain_position IS NULL
  ), current_max AS (
    SELECT COALESCE(MAX(chain_position), 0) AS n FROM public.audit_logs WHERE chain_position IS NOT NULL
  )
  UPDATE public.audit_logs AS a
    SET chain_position = current_max.n + unnumbered.rn
    FROM unnumbered, current_max
    WHERE a.id = unnumbered.id;

  CREATE SEQUENCE IF NOT EXISTS public.audit_logs_chain_position_seq;
  SELECT COALESCE(MAX(chain_position), 0) INTO max_position FROM public.audit_logs;
  PERFORM setval('public.audit_logs_chain_position_seq', max_position + 1, false);
  ALTER TABLE public.audit_logs ALTER COLUMN chain_position SET DEFAULT nextval('public.audit_logs_chain_position_seq');
  ALTER SEQUENCE public.audit_logs_chain_position_seq OWNED BY public.audit_logs.chain_position;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_chain_position ON public.audit_logs(chain_position);

CREATE OR REPLACE FUNCTION public.append_audit_log(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_action TEXT,
  p_field_changed TEXT,
  p_old_value TEXT,
  p_new_value TEXT,
  p_performed_by UUID,
  p_ip_address TEXT,
  p_user_agent TEXT,
  p_metadata JSONB,
  p_prev_hash TEXT,
  p_hash TEXT
) RETURNS public.audit_logs
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  latest_hash TEXT;
  inserted public.audit_logs;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.audit_logs'), hashtext('audit-chain'));
  SELECT hash INTO latest_hash FROM public.audit_logs ORDER BY chain_position DESC LIMIT 1;
  IF COALESCE(latest_hash, 'GENESIS') <> p_prev_hash THEN
    RAISE EXCEPTION 'Audit chain advanced; retry append' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.audit_logs (
    entity_type, entity_id, action, field_changed, old_value, new_value,
    performed_by, ip_address, user_agent, metadata, prev_hash, hash
  ) VALUES (
    p_entity_type, p_entity_id, p_action, p_field_changed, p_old_value, p_new_value,
    p_performed_by, p_ip_address, p_user_agent, COALESCE(p_metadata, '{}'::jsonb), p_prev_hash, p_hash
  ) RETURNING * INTO inserted;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.append_audit_log(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_audit_log(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, JSONB, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.transition_service_request(
  p_request_id UUID,
  p_expected_status TEXT,
  p_payload JSONB
) RETURNS public.service_requests
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  current_request public.service_requests;
  updated_request public.service_requests;
  target_technician UUID;
  was_active BOOLEAN;
  will_be_active BOOLEAN;
BEGIN
  SELECT * INTO current_request FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service request not found' USING ERRCODE = 'P0002'; END IF;
  IF current_request.status <> p_expected_status THEN
    RAISE EXCEPTION 'Request status changed concurrently; reload and retry' USING ERRCODE = '40001';
  END IF;

  target_technician := CASE WHEN p_payload ? 'assigned_technician_id'
    THEN NULLIF(p_payload->>'assigned_technician_id', '')::UUID
    ELSE current_request.assigned_technician_id END;
  was_active := current_request.status IN ('ASSIGNED', 'IN_PROGRESS', 'EXCEPTION');
  will_be_active := p_payload->>'status' IN ('ASSIGNED', 'IN_PROGRESS', 'EXCEPTION');

  -- Count assigned work consistently through reassignments, completion, reopen,
  -- and exception closure. Both decrement and capacity-checked increment are
  -- inside this transaction, so a failed reassignment rolls back both sides.
  IF was_active AND (NOT will_be_active OR current_request.assigned_technician_id IS DISTINCT FROM target_technician)
     AND current_request.assigned_technician_id IS NOT NULL THEN
    UPDATE public.technicians
      SET current_job_count = GREATEST(0, COALESCE(current_job_count, 0) - 1)
      WHERE id = current_request.assigned_technician_id;
  END IF;
  IF will_be_active AND (NOT was_active OR current_request.assigned_technician_id IS DISTINCT FROM target_technician) THEN
    IF target_technician IS NULL THEN RAISE EXCEPTION 'Technician is required for active assignment' USING ERRCODE = '23514'; END IF;
    UPDATE public.technicians
      SET current_job_count = COALESCE(current_job_count, 0) + 1
      WHERE id = target_technician AND is_available = true
        AND COALESCE(current_job_count, 0) < COALESCE(max_concurrent_jobs, 3);
    IF NOT FOUND THEN RAISE EXCEPTION 'Technician is unavailable or at capacity' USING ERRCODE = '23514'; END IF;
  END IF;

  UPDATE public.service_requests SET
    status = p_payload->>'status',
    sla_deadline = CASE WHEN p_payload ? 'sla_deadline' THEN (p_payload->>'sla_deadline')::TIMESTAMPTZ ELSE sla_deadline END,
    approved_by = CASE WHEN p_payload ? 'approved_by' THEN (p_payload->>'approved_by')::UUID ELSE approved_by END,
    approved_at = CASE WHEN p_payload ? 'approved_at' THEN (p_payload->>'approved_at')::TIMESTAMPTZ ELSE approved_at END,
    assigned_technician_id = CASE WHEN p_payload ? 'assigned_technician_id' THEN (p_payload->>'assigned_technician_id')::UUID ELSE assigned_technician_id END,
    assigned_at = CASE WHEN p_payload ? 'assigned_at' THEN (p_payload->>'assigned_at')::TIMESTAMPTZ ELSE assigned_at END,
    started_at = CASE WHEN p_payload ? 'started_at' THEN (p_payload->>'started_at')::TIMESTAMPTZ ELSE started_at END,
    completed_at = CASE WHEN p_payload ? 'completed_at' THEN (p_payload->>'completed_at')::TIMESTAMPTZ ELSE completed_at END,
    resolution_notes = CASE WHEN p_payload ? 'resolution_notes' THEN p_payload->>'resolution_notes' ELSE resolution_notes END,
    verified_at = CASE WHEN p_payload ? 'verified_at' THEN (p_payload->>'verified_at')::TIMESTAMPTZ ELSE verified_at END,
    closed_at = CASE WHEN p_payload ? 'closed_at' THEN (p_payload->>'closed_at')::TIMESTAMPTZ ELSE closed_at END
    WHERE id = p_request_id
    RETURNING * INTO updated_request;
  RETURN updated_request;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_service_request(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_service_request(UUID, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.accept_solution_bid(p_bid_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  chosen_bid public.solution_bids;
  parent_request public.service_requests;
  updated_request public.service_requests;
  updated_bid public.solution_bids;
BEGIN
  SELECT * INTO chosen_bid FROM public.solution_bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bid not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO parent_request FROM public.service_requests WHERE id = chosen_bid.service_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service request not found' USING ERRCODE = 'P0002'; END IF;
  IF parent_request.status <> 'BID_REVIEW' THEN
    RAISE EXCEPTION 'Request is not in bid review' USING ERRCODE = '40001';
  END IF;

  UPDATE public.solution_bids
    SET status = 'REJECTED'
    WHERE service_request_id = parent_request.id AND id <> p_bid_id;
  UPDATE public.solution_bids SET status = 'ACCEPTED' WHERE id = p_bid_id RETURNING * INTO updated_bid;
  UPDATE public.bid_rounds
    SET status = 'DECIDED', winning_bid_id = p_bid_id, closed_at = now()
    WHERE id = chosen_bid.bid_round_id AND status = 'OPEN';
  IF NOT FOUND THEN RAISE EXCEPTION 'Open bid round not found' USING ERRCODE = '40001'; END IF;

  UPDATE public.technicians
    SET current_job_count = COALESCE(current_job_count, 0) + 1
    WHERE id = chosen_bid.technician_id AND is_available = true
      AND COALESCE(current_job_count, 0) < COALESCE(max_concurrent_jobs, 3);
  IF NOT FOUND THEN RAISE EXCEPTION 'Winning technician unavailable or at capacity' USING ERRCODE = '23514'; END IF;

  UPDATE public.service_requests SET
    selected_bid_id = p_bid_id,
    status = 'ASSIGNED',
    assigned_technician_id = chosen_bid.technician_id,
    assigned_at = now()
    WHERE id = parent_request.id
    RETURNING * INTO updated_request;

  RETURN jsonb_build_object('bid', to_jsonb(updated_bid), 'service_request', to_jsonb(updated_request));
END;
$$;

REVOKE ALL ON FUNCTION public.accept_solution_bid(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_solution_bid(UUID) TO service_role;

-- Reserve a part and create its reservation under one row lock/transaction.
CREATE OR REPLACE FUNCTION public.reserve_spare_part(
  p_spare_part_id UUID,
  p_work_order_id UUID,
  p_quantity INTEGER
) RETURNS public.reservations
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_part public.spare_parts;
  selected_work_order public.work_orders;
  request_site_id UUID;
  inserted_reservation public.reservations;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO selected_part FROM public.spare_parts WHERE id = p_spare_part_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Spare part not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO selected_work_order FROM public.work_orders WHERE id = p_work_order_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002'; END IF;
  SELECT site_id INTO request_site_id FROM public.service_requests
    WHERE id = selected_work_order.service_request_id FOR SHARE;
  IF selected_part.site_id <> request_site_id THEN
    RAISE EXCEPTION 'Part and work order must belong to the same site' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(selected_part.quantity_available, 0) - COALESCE(selected_part.quantity_reserved, 0) < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock' USING ERRCODE = '23514';
  END IF;
  UPDATE public.spare_parts
    SET quantity_reserved = COALESCE(quantity_reserved, 0) + p_quantity
    WHERE id = p_spare_part_id;
  INSERT INTO public.reservations (spare_part_id, work_order_id, quantity, status)
    VALUES (p_spare_part_id, p_work_order_id, p_quantity, 'RESERVED')
    RETURNING * INTO inserted_reservation;
  RETURN inserted_reservation;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_spare_part(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_spare_part(UUID, UUID, INTEGER) TO service_role;

-- A work order may only be created for a request already assigned to that tech.
-- Locking the request makes validation and insert one consistent operation.
CREATE OR REPLACE FUNCTION public.create_work_order_for_assigned_request(
  p_service_request_id UUID,
  p_technician_id UUID,
  p_order_number TEXT,
  p_description TEXT,
  p_estimated_hours DOUBLE PRECISION,
  p_actual_hours DOUBLE PRECISION,
  p_notes TEXT
) RETURNS public.work_orders
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_request public.service_requests;
  inserted_work_order public.work_orders;
BEGIN
  SELECT * INTO selected_request FROM public.service_requests
    WHERE id = p_service_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service request not found' USING ERRCODE = 'P0002'; END IF;
  IF selected_request.status <> 'ASSIGNED'
     OR selected_request.assigned_technician_id IS DISTINCT FROM p_technician_id THEN
    RAISE EXCEPTION 'Work order requires the assigned technician on an ASSIGNED request' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.work_orders (
    order_number, service_request_id, technician_id, description,
    estimated_hours, actual_hours, notes, status
  ) VALUES (
    p_order_number, p_service_request_id, p_technician_id, p_description,
    p_estimated_hours, p_actual_hours, p_notes, 'PENDING'
  ) RETURNING * INTO inserted_work_order;
  RETURN inserted_work_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_work_order_for_assigned_request(UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_work_order_for_assigned_request(UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO service_role;
