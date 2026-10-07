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
    const workOrder = unwrap(
      await supabase.from('work_orders').select(SELECT).eq('id', req.params.id).single(),
      { notFoundMessage: 'Work order not found' },
    );
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
      insert: (order_number) =>
        supabase
          .from('work_orders')
          .insert({ ...req.body, order_number, status: 'PENDING' })
          .select()
          .single(),
    });
    created(res, wrap('work_order', unwrap(result)));
  }),
);

// PATCH /api/work-orders/:id
router.patch(
  '/:id',
  authenticate,
  validate({ params: idParam, body: workOrderUpdateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const workOrder = unwrap(
      await supabase.from('work_orders').update(req.body).eq('id', req.params.id).select().single(),
      { notFoundMessage: 'Work order not found' },
    );
    res.json(wrap('work_order', workOrder));
  }),
);

export default router;
