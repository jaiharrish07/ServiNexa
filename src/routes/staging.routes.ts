import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler, AppError, badRequest, notFound } from '../middleware/error-handler';
import { ok } from '../utils/api-response';
import { createAuditLog } from '../services/audit';
import { getAccessibleServiceRequest } from '../utils/access';
import { validate } from '../middleware/validate';
import { requestIdParam, stagingIdParam, stagingStatusSchema } from '../schemas/features';

// Mounted at /api (Feature 5: pre-dispatch parts staging).
const router = Router();

const STAGING_STATUSES = ['IDENTIFIED', 'RESERVED', 'IN_TRANSIT', 'STAGED', 'ISSUED'];
const NEXT_STAGING_STATUS: Record<string, string[]> = {
  IDENTIFIED: ['RESERVED'],
  RESERVED: ['IN_TRANSIT', 'STAGED'],
  IN_TRANSIT: ['STAGED'],
  STAGED: ['ISSUED'],
  ISSUED: [],
};

// GET /api/staging/dashboard — overview across active requests (declare before /:requestId).
router.get(
  '/staging/dashboard',
  authenticate,
  authorize('OPS_MANAGER', 'ADMIN'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const { data } = await supabase
      .from('parts_staging')
      .select('*, service_requests(request_number, status)')
      .order('created_at', { ascending: false })
      .limit(200);
    const byStatus: Record<string, number> = {};
    for (const r of data ?? []) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    ok(res, { staging: data ?? [], by_status: byStatus });
  })
);

// GET /api/staging/:requestId — staging records for one request.
router.get(
  '/staging/:requestId',
  authenticate,
  validate({ params: requestIdParam }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!await getAccessibleServiceRequest(req.params.requestId, req.user!)) throw notFound('Staging records not found');
    const { data } = await supabase
      .from('parts_staging')
      .select('*')
      .eq('service_request_id', req.params.requestId)
      .order('created_at');
    ok(res, { staging: data ?? [] });
  })
);

// PUT /api/staging/:id/status — advance a staging record.
router.put(
  '/staging/:id/status',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER', 'TECHNICIAN'),
  validate({ params: stagingIdParam, body: stagingStatusSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status } = req.body ?? {};
    if (!status || !STAGING_STATUSES.includes(status)) {
      throw badRequest(`status must be one of ${STAGING_STATUSES.join(', ')}`);
    }
    const { data: existing } = await supabase.from('parts_staging').select('id, service_request_id, status').eq('id', req.params.id).maybeSingle();
    if (!existing?.service_request_id || !await getAccessibleServiceRequest(existing.service_request_id, req.user!)) {
      throw notFound('Staging record not found');
    }
    if (status !== existing.status && !(NEXT_STAGING_STATUS[existing.status] ?? []).includes(status)) {
      throw new AppError(`Invalid staging transition ${existing.status} -> ${status}`, 409, 'INVALID_TRANSITION');
    }
    const patch: Record<string, any> = { status };
    if (status === 'STAGED' || status === 'ISSUED') patch.actual_arrival = new Date().toISOString();

    const { data, error } = await supabase
      .from('parts_staging')
      .update(patch)
      .eq('id', req.params.id)
      .eq('status', existing.status)
      .select()
      .single();
    if (error) throw badRequest(error.message);
    if (!data) throw notFound('Staging record not found');

    await createAuditLog({
      entity_type: 'parts_staging',
      entity_id: data.id,
      action: 'STATUS_CHANGE',
      field_changed: 'status',
      new_value: status,
      performed_by: req.user!.id,
    });
    ok(res, { staging: data });
  })
);

export default router;
