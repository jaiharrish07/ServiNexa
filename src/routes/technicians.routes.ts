import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error-handler';
import { parseListQuery, searchExpr, buildMeta } from '../utils/query';
import { unwrap, wrap, wrapList, created } from '../utils/api-response';
import { idParam } from '../schemas/common';
import { technicianCreateSchema, technicianUpdateSchema } from '../schemas/technicians';

const router = Router();

// GET /api/technicians?site_id=&available=true
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const lp = parseListQuery(req, {
      defaultSort: 'employee_code',
      defaultOrder: 'asc',
      sortable: ['employee_code', 'rating', 'created_at'],
    });
    let q = supabase
      .from('technicians')
      .select('*, users(full_name, email, phone), sites(name, code)', { count: 'exact' });
    if (req.query.site_id) q = q.eq('site_id', String(req.query.site_id));
    if (req.query.available === 'true') q = q.eq('is_available', true);
    if (lp.q) q = q.or(searchExpr(['employee_code'], lp.q));
    q = q.order(lp.sort, { ascending: lp.order === 'asc' }).range(lp.from, lp.to);
    const result = await q;
    res.json(wrapList('technicians', unwrap(result), buildMeta(lp, result.count)));
  }),
);

// GET /api/technicians/:id
router.get(
  '/:id',
  authenticate,
  validate({ params: idParam }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const technician = unwrap(
      await supabase
        .from('technicians')
        .select(
          '*, users(full_name, email, phone), sites(name, code), work_orders(id, order_number, status, created_at)',
        )
        .eq('id', req.params.id)
        .single(),
      { notFoundMessage: 'Technician not found' },
    );
    res.json(wrap('technician', technician));
  }),
);

// POST /api/technicians
router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  validate({ body: technicianCreateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const technician = unwrap(await supabase.from('technicians').insert(req.body).select().single());
    created(res, wrap('technician', technician));
  }),
);

// PATCH /api/technicians/:id
router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  validate({ params: idParam, body: technicianUpdateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const technician = unwrap(
      await supabase.from('technicians').update(req.body).eq('id', req.params.id).select().single(),
      { notFoundMessage: 'Technician not found' },
    );
    res.json(wrap('technician', technician));
  }),
);

export default router;
