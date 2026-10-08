import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler, AppError, badRequest, conflict } from '../middleware/error-handler';
import { parseListQuery, searchExpr, buildMeta } from '../utils/query';
import { unwrap, wrap, wrapList, created } from '../utils/api-response';
import { idParam } from '../schemas/common';
import { sparePartCreateSchema, sparePartUpdateSchema, reserveSchema } from '../schemas/spare-parts';

const router = Router();

// GET /api/spare-parts?site_id=
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const lp = parseListQuery(req, {
      defaultSort: 'name',
      defaultOrder: 'asc',
      sortable: ['name', 'part_number', 'quantity_available'],
    });
    let q = supabase.from('spare_parts').select('*, sites(name, code)', { count: 'exact' });
    if (req.user!.role === 'CUSTOMER') {
      const { data: requests } = await supabase.from('service_requests').select('site_id').eq('requester_id', req.user!.id);
      const siteIds = [...new Set((requests ?? []).map((r: any) => r.site_id))];
      if (!siteIds.length) return res.json(wrapList('spare_parts', [], buildMeta(lp, 0)));
      q = q.in('site_id', siteIds);
    } else if (req.user!.role === 'TECHNICIAN') {
      const { data: tech } = await supabase.from('technicians').select('site_id').eq('user_id', req.user!.id).maybeSingle();
      q = q.eq('site_id', tech?.site_id ?? '00000000-0000-0000-0000-000000000000');
    }
    if (req.query.site_id) q = q.eq('site_id', String(req.query.site_id));
    if (lp.q) q = q.or(searchExpr(['name', 'part_number'], lp.q));
    q = q.order(lp.sort, { ascending: lp.order === 'asc' }).range(lp.from, lp.to);
    const result = await q;
    res.json(wrapList('spare_parts', unwrap(result), buildMeta(lp, result.count)));
  }),
);

// POST /api/spare-parts
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  validate({ body: sparePartCreateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const part = unwrap(await supabase.from('spare_parts').insert(req.body).select().single());
    created(res, wrap('spare_part', part));
  }),
);

// PATCH /api/spare-parts/:id
router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  validate({ params: idParam, body: sparePartUpdateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const part = unwrap(
      await supabase.from('spare_parts').update(req.body).eq('id', req.params.id).select().single(),
      { notFoundMessage: 'Spare part not found' },
    );
    res.json(wrap('spare_part', part));
  }),
);

// POST /api/spare-parts/:id/reserve  — race-safe via optimistic concurrency
router.post(
  '/:id/reserve',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER', 'TECHNICIAN'),
  validate({ params: idParam, body: reserveSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id;
    const { work_order_id, quantity } = req.body;
    const { data: workOrder } = await supabase
      .from('work_orders')
      .select('id, technician_id')
      .eq('id', work_order_id)
      .maybeSingle();
    if (!workOrder) throw new AppError('Work order not found', 404, 'NOT_FOUND');
    if (req.user!.role === 'TECHNICIAN') {
      const { data: technician } = await supabase.from('technicians').select('id').eq('user_id', req.user!.id).maybeSingle();
      if (!technician || workOrder.technician_id !== technician.id) throw new AppError('Work order not found', 404, 'NOT_FOUND');
    }

    const { data, error } = await supabase.rpc('reserve_spare_part', {
      p_spare_part_id: id,
      p_work_order_id: work_order_id,
      p_quantity: quantity,
    });
    if (error) {
      if (error.code === 'P0002') throw new AppError(error.message, 404, 'NOT_FOUND');
      if (error.message === 'Insufficient stock') throw conflict(error.message);
      if (error.message === 'Part and work order must belong to the same site') throw new AppError(error.message, 400, 'SITE_MISMATCH');
      if (error.code === '22023') throw badRequest(error.message);
      throw new AppError(error.message, 500, 'DB_ERROR');
    }
    created(res, wrap('reservation', data));
  }),
);

export default router;
