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
const MAX_RESERVE_ATTEMPTS = 5;

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
  validate({ params: idParam, body: reserveSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id;
    const { work_order_id, quantity } = req.body;

    for (let attempt = 0; attempt < MAX_RESERVE_ATTEMPTS; attempt++) {
      // 1. read current stock
      const part = unwrap<{ id: string; quantity_available: number; quantity_reserved: number }>(
        await supabase
          .from('spare_parts')
          .select('id, quantity_available, quantity_reserved')
          .eq('id', id)
          .single(),
        { notFoundMessage: 'Spare part not found' },
      );
      const available = (part.quantity_available ?? 0) - (part.quantity_reserved ?? 0);
      if (available < quantity) throw badRequest('Insufficient stock');

      // 2. conditional update — only succeeds if quantity_reserved is unchanged
      const upd = await supabase
        .from('spare_parts')
        .update({ quantity_reserved: (part.quantity_reserved ?? 0) + quantity })
        .eq('id', id)
        .eq('quantity_reserved', part.quantity_reserved ?? 0)
        .select();
      if (upd.error) throw new AppError(upd.error.message, 400, 'DB_ERROR');
      if (!upd.data || upd.data.length !== 1) continue; // lost the race → retry

      // 3. create the reservation; compensate (roll back the count) if it fails
      const resv = await supabase
        .from('reservations')
        .insert({ spare_part_id: id, work_order_id, quantity, status: 'RESERVED' })
        .select()
        .single();
      if (resv.error) {
        await supabase
          .from('spare_parts')
          .update({ quantity_reserved: part.quantity_reserved ?? 0 })
          .eq('id', id)
          .eq('quantity_reserved', (part.quantity_reserved ?? 0) + quantity);
        throw new AppError(resv.error.message, 400, 'DB_ERROR');
      }

      return created(res, wrap('reservation', resv.data));
    }

    throw conflict('Could not reserve stock due to concurrent updates, please retry');
  }),
);

export default router;
