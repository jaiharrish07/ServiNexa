import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error-handler';
import { parseListQuery, searchExpr, buildMeta } from '../utils/query';
import { unwrap, wrap, wrapList, created } from '../utils/api-response';
import { generateRequestNumber, insertWithUniqueNumber } from '../utils/request-number';
import { idParam } from '../schemas/common';
import { serviceRequestCreateSchema, serviceRequestUpdateSchema } from '../schemas/service-requests';
import { notifyRequestCreated } from '../services/notifications';
import { createAuditLog } from '../services/audit';
import { getAccessibleServiceRequest, getServiceRequestScope } from '../utils/access';

const router = Router();

const LIST_SELECT =
  '*, sites(name, code), machines(name, code, type), requester:users!requester_id(full_name), technician:technicians!assigned_technician_id(employee_code, users(full_name))';

const DETAIL_SELECT = `
  *,
  sites(name, code),
  machines(name, code, type, status),
  requester:users!requester_id(full_name, email),
  approver:users!approved_by(full_name),
  technician:technicians!assigned_technician_id(*, users(full_name, email)),
  work_orders(*),
  exception_flags(*),
  documents(*)
`;

// GET /api/service-requests?status=&site_id=&priority=&machine_id=&technician_id=
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const lp = parseListQuery(req, {
      defaultSort: 'created_at',
      defaultOrder: 'desc',
      sortable: ['created_at', 'priority', 'status'],
    });
    let q = supabase.from('service_requests').select(LIST_SELECT, { count: 'exact' });
    const scope = await getServiceRequestScope(req.user!);
    if (scope) q = q.eq(scope.field, scope.value);
    if (req.query.status) q = q.eq('status', String(req.query.status));
    if (req.query.site_id) q = q.eq('site_id', String(req.query.site_id));
    if (req.query.priority) q = q.eq('priority', String(req.query.priority));
    if (req.query.machine_id) q = q.eq('machine_id', String(req.query.machine_id));
    if (req.query.technician_id) q = q.eq('assigned_technician_id', String(req.query.technician_id));
    if (lp.q) q = q.or(searchExpr(['title', 'description', 'request_number'], lp.q));
    q = q.order(lp.sort, { ascending: lp.order === 'asc' }).range(lp.from, lp.to);
    const result = await q;
    res.json(wrapList('service_requests', unwrap(result), buildMeta(lp, result.count)));
  }),
);

// GET /api/service-requests/:id
router.get(
  '/:id',
  authenticate,
  validate({ params: idParam }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const visible = await getAccessibleServiceRequest(req.params.id, req.user!);
    if (!visible) return res.status(404).json({ error: 'Service request not found', code: 'NOT_FOUND' });
    const sr = unwrap(await supabase.from('service_requests').select(DETAIL_SELECT).eq('id', req.params.id).single());
    res.json(wrap('service_request', sr));
  }),
);

// POST /api/service-requests
router.post(
  '/',
  authenticate,
  authorize('CUSTOMER', 'OPS_MANAGER', 'ADMIN'),
  validate({ body: serviceRequestCreateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await insertWithUniqueNumber({
      generate: generateRequestNumber,
      insert: (request_number) =>
        supabase
          .from('service_requests')
          .insert({
            ...req.body,
            request_number,
            requester_id: req.user!.id, // server-controlled — ignore any client value
            status: 'DRAFT',
          })
          .select()
          .single(),
    });
    const sr = unwrap(result);

    // Keep the public request number bound to its immutable UUID in the audit chain.
    // This preserves traceability if an operational row is later removed outside the API.
    await createAuditLog({
      entity_type: 'service_request',
      entity_id: sr.id,
      action: 'CREATE',
      performed_by: req.user!.id,
      metadata: { request_number: sr.request_number },
    });

    // Live notification producer (fire-and-forget; never throws / never blocks the response).
    await notifyRequestCreated(sr);

    created(res, wrap('service_request', sr));
  }),
);

// PATCH /api/service-requests/:id  (status changes go through Dev A's workflow engine)
router.patch(
  '/:id',
  authenticate,
  authorize('CUSTOMER', 'OPS_MANAGER', 'ADMIN'),
  validate({ params: idParam, body: serviceRequestUpdateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const visible = await getAccessibleServiceRequest(req.params.id, req.user!);
    if (!visible) return res.status(404).json({ error: 'Service request not found', code: 'NOT_FOUND' });
    if (req.user!.role === 'CUSTOMER' && visible.status !== 'DRAFT') {
      return res.status(409).json({ error: 'Only draft service requests can be edited by customers', code: 'INVALID_STATE' });
    }
    if (req.user!.role === 'CUSTOMER' && 'resolution_notes' in req.body) {
      return res.status(403).json({ error: 'Customers cannot edit resolution notes', code: 'FORBIDDEN' });
    }
    let update = supabase.from('service_requests').update(req.body).eq('id', req.params.id);
    if (req.user!.role === 'CUSTOMER') update = update.eq('requester_id', req.user!.id).eq('status', 'DRAFT');
    const sr = unwrap(
      await update.select().single(),
      { notFoundMessage: 'Service request not found' },
    );
    res.json(wrap('service_request', sr));
  }),
);

export default router;
