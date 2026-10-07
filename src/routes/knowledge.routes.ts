import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler, badRequest, notFound } from '../middleware/error-handler';
import { ok, created } from '../utils/api-response';
import { searchSimilar } from '../services/knowledge.service';

// Mounted at /api (Feature 7: solution knowledge base).
const router = Router();

// GET /api/knowledge/search?category=&machine_type=&sub_category=&q=
router.get(
  '/knowledge/search',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await searchSimilar({
      category: req.query.category as string | undefined,
      machine_type: req.query.machine_type as string | undefined,
      sub_category: req.query.sub_category as string | undefined,
      description: (req.query.q as string | undefined) ?? '',
    });
    ok(res, { results: result });
  })
);

// GET /api/knowledge/stats  (declare before /:id)
router.get(
  '/knowledge/stats',
  authenticate,
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const { data } = await supabase.from('knowledge_entries').select('machine_type, category, success_flag');
    const rows = data ?? [];
    const byCategory: Record<string, number> = {};
    for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    const successes = rows.filter((r) => r.success_flag === true).length;
    ok(res, {
      stats: {
        total: rows.length,
        by_category: byCategory,
        success_rate: rows.length ? +(successes / rows.length).toFixed(2) : 0,
      },
    });
  })
);

// GET /api/knowledge/:id
router.get(
  '/knowledge/:id',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data } = await supabase.from('knowledge_entries').select('*').eq('id', req.params.id).maybeSingle();
    if (!data) throw notFound('Knowledge entry not found');
    ok(res, { entry: data });
  })
);

// POST /api/knowledge  (OPS/ADMIN — manual entry / pre-seeding)
router.post(
  '/knowledge',
  authenticate,
  authorize('OPS_MANAGER', 'ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const b = req.body ?? {};
    if (!b.machine_type || !b.category || !b.problem_description || !b.solution_applied) {
      throw badRequest('machine_type, category, problem_description and solution_applied are required');
    }
    const { data, error } = await supabase
      .from('knowledge_entries')
      .insert({
        machine_type: b.machine_type,
        category: b.category,
        sub_category: b.sub_category ?? null,
        problem_description: b.problem_description,
        solution_applied: b.solution_applied,
        parts_used: b.parts_used ?? [],
        resolution_hours: b.resolution_hours ?? null,
        cost: b.cost ?? null,
        effectiveness_rating: b.effectiveness_rating ?? null,
        success_flag: b.success_flag ?? true,
        tags: b.tags ?? [],
      })
      .select()
      .single();
    if (error) throw badRequest(error.message);
    created(res, { entry: data });
  })
);

export default router;
