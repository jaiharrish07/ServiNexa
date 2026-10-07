import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, badRequest, notFound } from '../middleware/error-handler';
import { ok } from '../utils/api-response';
import { computeImpact, getDependencyGraph } from '../services/impact.service';

// Mounted at /api (Feature 2: cascading impact).
const router = Router();

// POST /api/impact-analysis/:requestId — run (or re-run) impact analysis.
router.post(
  '/impact-analysis/:requestId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data: sr } = await supabase
      .from('service_requests')
      .select('id, machine_id')
      .eq('id', req.params.requestId)
      .maybeSingle();
    if (!sr) throw notFound('Service request not found');
    if (!sr.machine_id) throw badRequest('Service request has no machine to analyze');

    const impact = await computeImpact(sr.machine_id, sr.id);
    ok(res, { impact });
  })
);

// GET /api/impact-analysis/:requestId — latest stored analysis for a request.
router.get(
  '/impact-analysis/:requestId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data } = await supabase
      .from('impact_analyses')
      .select('*')
      .eq('service_request_id', req.params.requestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    ok(res, { impact: data });
  })
);

// GET /api/dependencies/:machineId — dependency graph for a machine.
router.get(
  '/dependencies/:machineId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const edges = await getDependencyGraph(req.params.machineId);
    ok(res, { dependencies: edges });
  })
);

export default router;
