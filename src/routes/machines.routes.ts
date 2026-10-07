import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error-handler';
import { parseListQuery, searchExpr, buildMeta } from '../utils/query';
import { unwrap, wrap, wrapList, created } from '../utils/api-response';
import { idParam } from '../schemas/common';
import { machineCreateSchema, machineUpdateSchema } from '../schemas/machines';

const router = Router();

// GET /api/machines?site_id=&status=
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const lp = parseListQuery(req, {
      defaultSort: 'code',
      defaultOrder: 'asc',
      sortable: ['code', 'name', 'status', 'created_at'],
    });
    let q = supabase.from('machines').select('*, sites(name, code)', { count: 'exact' });
    if (req.query.site_id) q = q.eq('site_id', String(req.query.site_id));
    if (req.query.status) q = q.eq('status', String(req.query.status));
    if (lp.q) q = q.or(searchExpr(['name', 'code'], lp.q));
    q = q.order(lp.sort, { ascending: lp.order === 'asc' }).range(lp.from, lp.to);
    const result = await q;
    res.json(wrapList('machines', unwrap(result), buildMeta(lp, result.count)));
  }),
);

// GET /api/machines/:id
router.get(
  '/:id',
  authenticate,
  validate({ params: idParam }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const machine = unwrap(
      await supabase
        .from('machines')
        .select('*, sites(name, code), service_requests(id, title, status, priority, created_at)')
        .eq('id', req.params.id)
        .single(),
      { notFoundMessage: 'Machine not found' },
    );
    res.json(wrap('machine', machine));
  }),
);

// POST /api/machines
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  validate({ body: machineCreateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const machine = unwrap(await supabase.from('machines').insert(req.body).select().single());
    created(res, wrap('machine', machine));
  }),
);

// PATCH /api/machines/:id
router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  validate({ params: idParam, body: machineUpdateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const machine = unwrap(
      await supabase.from('machines').update(req.body).eq('id', req.params.id).select().single(),
      { notFoundMessage: 'Machine not found' },
    );
    res.json(wrap('machine', machine));
  }),
);

export default router;
