import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/error-handler';
import { parseListQuery, buildMeta } from '../utils/query';
import { unwrap, wrap, wrapList } from '../utils/api-response';
import { idParam } from '../schemas/common';

const router = Router();

// GET /api/notifications/unread-count  (declare BEFORE '/:id' routes)
router.get(
  '/unread-count',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user!.id)
      .eq('is_read', false);
    if (error) throw error;
    res.json({ unread_count: count ?? 0 });
  }),
);

// PATCH /api/notifications/read-all
router.patch(
  '/read-all',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user!.id)
      .eq('is_read', false);
    if (error) throw error;
    res.json({ success: true });
  }),
);

// GET /api/notifications  (only the caller's own)
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const lp = parseListQuery(req, { defaultSort: 'created_at', defaultOrder: 'desc', sortable: ['created_at'] });
    let q = supabase.from('notifications').select('*', { count: 'exact' }).eq('user_id', req.user!.id);
    if (req.query.is_read === 'true') q = q.eq('is_read', true);
    if (req.query.is_read === 'false') q = q.eq('is_read', false);
    q = q.order(lp.sort, { ascending: lp.order === 'asc' }).range(lp.from, lp.to);
    const result = await q;
    res.json(wrapList('notifications', unwrap(result), buildMeta(lp, result.count)));
  }),
);

// PATCH /api/notifications/:id/read  (scoped to the caller)
router.patch(
  '/:id/read',
  authenticate,
  validate({ params: idParam }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const notification = unwrap(
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', req.params.id)
        .eq('user_id', req.user!.id)
        .select()
        .single(),
      { notFoundMessage: 'Notification not found' },
    );
    res.json(wrap('notification', notification));
  }),
);

export default router;
