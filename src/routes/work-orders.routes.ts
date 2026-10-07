import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error-handler';
import { parseListQuery, buildMeta } from '../utils/query';
import { unwrap, wrap, wrapList, created } from '../utils/api-response';
import { generateOrderNumber, insertWithUniqueNumber } from '../utils/request-number';
import { idParam } from '../schemas/common';
import { workOrderCreateSchema, workOrderUpdateSchema } from '../schemas/work-orders';
import { resolveTechnicianId } from '../utils/technician';
import { getAccessibleServiceRequest, isOperations } from '../utils/access';
import { transitionStatus } from '../services/workflow';

const router = Router();

const SELECT =
  '*, service_requests(request_number, title, priority), technicians(employee_code, users(full_name))';

// GET /api/work-orders?service_request_id=&technician_id=&status=
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const lp = parseListQuery(req, {
      defaultSort: 'created_at',
      defaultOrder: 'desc',
      sortable: ['created_at', 'status'],
    });
    let q = supabase.from('work_orders').select(SELECT, { count: 'exact' });
    if (req.user!.role === 'TECHNICIAN') {
      const techId = await resolveTechnicianId(req.user!.id);
      q = q.eq('technician_id', techId ?? '00000000-0000-0000-0000-000000000000');
    } else if (req.user!.role === 'CUSTOMER') {
      const { data: requests } = await supabase.from('service_requests').select('id').eq('requester_id', req.user!.id);
      const requestIds = (requests ?? []).map((r: any) => r.id);
      if (!requestIds.length) return res.json(wrapList('work_orders', [], buildMeta(lp, 0)));
      q = q.in('service_request_id', requestIds);
    } else if (!isOperations(req.user!)) {
      q = q.eq('id', '00000000-0000-0000-0000-000000000000');
    }
    if (req.query.service_request_id) q = q.eq('service_request_id', String(req.query.service_request_id));
    if (req.query.technician_id) q = q.eq('technician_id', String(req.query.technician_id));
    if (req.query.status) q = q.eq('status', String(req.query.status));
    q = q.order(lp.sort, { ascending: lp.order === 'asc' }).range(lp.from, lp.to);
    const result = await q;
    res.json(wrapList('work_orders', unwrap(result), buildMeta(lp, result.count)));
  }),
);

// GET /api/work-orders/:id
router.get(
  '/:id',
  authenticate,
  validate({ params: idParam }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const workOrder = unwrap<any>(
      await supabase.from('work_orders').select(SELECT).eq('id', req.params.id).single(),
      { notFoundMessage: 'Work order not found' },
    );
    const visibleRequest = await getAccessibleServiceRequest(workOrder.service_request_id, req.user!);
    if (!visibleRequest || (req.user!.role === 'TECHNICIAN' && workOrder.technician_id !== await resolveTechnicianId(req.user!.id))) {
      return res.status(404).json({ error: 'Work order not found', code: 'NOT_FOUND' });
    }
    res.json(wrap('work_order', workOrder));
  }),
);

// POST /api/work-orders
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  validate({ body: workOrderCreateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await insertWithUniqueNumber({
      generate: generateOrderNumber,
      insert: (order_number) => supabase.rpc('create_work_order_for_assigned_request', {
        p_service_request_id: req.body.service_request_id,
        p_technician_id: req.body.technician_id,
        p_order_number: order_number,
        p_description: req.body.description ?? null,
        p_estimated_hours: req.body.estimated_hours ?? null,
        p_actual_hours: req.body.actual_hours ?? null,
        p_notes: req.body.notes ?? null,
      }),
    });
    created(res, wrap('work_order', unwrap(result)));
  }),
);

// PATCH /api/work-orders/:id
router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER', 'TECHNICIAN'),
  validate({ params: idParam, body: workOrderUpdateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const existing = unwrap<any>(
      await supabase.from('work_orders').select('*').eq('id', req.params.id).single(),
      { notFoundMessage: 'Work order not found' },
    );
    const visibleRequest = await getAccessibleServiceRequest(existing.service_request_id, req.user!);
    if (!visibleRequest) return res.status(404).json({ error: 'Work order not found', code: 'NOT_FOUND' });
    let update = supabase.from('work_orders').update(req.body).eq('id', req.params.id);
    if (req.user!.role === 'TECHNICIAN') {
      const techId = await resolveTechnicianId(req.user!.id);
      if (!techId || existing.technician_id !== techId) return res.status(404).json({ error: 'Work order not found', code: 'NOT_FOUND' });
      const editable = new Set(['status', 'actual_hours', 'notes', 'started_at', 'completed_at']);
      if (Object.keys(req.body).some((key) => !editable.has(key))) {
        return res.status(403).json({ error: 'Technicians cannot reassign or change estimates', code: 'FORBIDDEN' });
      }
      const allowed: Record<string, string[]> = { PENDING: ['IN_PROGRESS'], IN_PROGRESS: ['COMPLETED'] };
      if (req.body.status && !(allowed[existing.status] ?? []).includes(req.body.status)) {
        return res.status(409).json({ error: `Invalid work-order transition ${existing.status} -> ${req.body.status}`, code: 'INVALID_TRANSITION' });
      }
      update = update.eq('technician_id', techId).eq('status', existing.status);
    } else if (!isOperations(req.user!)) {
      return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
    }
    const workOrder = unwrap<any>(
      await update.select().single(),
      { notFoundMessage: 'Work order not found' },
    );

    // Cascade: when all work orders for a service request are COMPLETED,
    // auto-transition the parent service request to COMPLETED.
    if (req.body.status === 'COMPLETED' && workOrder.service_request_id) {
      const { data: siblings } = await supabase
        .from('work_orders')
        .select('id, status')
        .eq('service_request_id', workOrder.service_request_id);
      const allDone = (siblings ?? []).every((wo: any) => wo.status === 'COMPLETED');
      if (allDone) {
        await transitionStatus(
          workOrder.service_request_id,
          'COMPLETED',
          req.user!.id,
          req.user!.role,
          { resolution_notes: workOrder.notes ?? 'Completed via work order' },
        ).catch((err: any) => {
          console.error('[work-orders] cascade to COMPLETED failed (non-fatal):', err?.message || err);
        });
      }
    }

    res.json(wrap('work_order', workOrder));
  }),
);

export default router;
