import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error-handler';
import { parseListQuery, searchExpr, buildMeta } from '../utils/query';
import { unwrap, wrap, wrapList, created } from '../utils/api-response';
import { idParam } from '../schemas/common';
import { siteCreateSchema, siteUpdateSchema } from '../schemas/sites';

const router = Router();

// GET /api/sites
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const lp = parseListQuery(req, {
      defaultSort: 'name',
      defaultOrder: 'asc',
      sortable: ['name', 'code', 'created_at'],
    });
    let q = supabase.from('sites').select('*', { count: 'exact' }).eq('is_active', true);
    if (lp.q) q = q.or(searchExpr(['name', 'code'], lp.q));
    q = q.order(lp.sort, { ascending: lp.order === 'asc' }).range(lp.from, lp.to);
    const result = await q;
    res.json(wrapList('sites', unwrap(result), buildMeta(lp, result.count)));
  }),
);

// GET /api/sites/:id
router.get(
  '/:id',
  authenticate,
  validate({ params: idParam }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const site = unwrap(
      await supabase
        .from('sites')
        .select('*, machines(*), technicians(*, users(full_name, email))')
        .eq('id', req.params.id)
        .single(),
      { notFoundMessage: 'Site not found' },
    );
    res.json(wrap('site', site));
  }),
);

// POST /api/sites
router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  validate({ body: siteCreateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const site = unwrap(await supabase.from('sites').insert(req.body).select().single());
    created(res, wrap('site', site));
  }),
);

// PATCH /api/sites/:id
router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  validate({ params: idParam, body: siteUpdateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const site = unwrap(
      await supabase.from('sites').update(req.body).eq('id', req.params.id).select().single(),
      { notFoundMessage: 'Site not found' },
    );
    res.json(wrap('site', site));
  }),
);

export default router;
