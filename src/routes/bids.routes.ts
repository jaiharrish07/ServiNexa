import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler, badRequest, forbidden, AppError } from '../middleware/error-handler';
import { ok, created } from '../utils/api-response';
import { openBidding, scoreBids, acceptBid } from '../services/bidding.service';
import { resolveTechnicianId } from '../utils/technician';
import { createAuditLog } from '../services/audit';
import { TransitionResult } from '../services/workflow';
import { validate } from '../middleware/validate';
import { bidIdParam, bidRoundOpenSchema, bidSubmitSchema, requestIdParam } from '../schemas/features';

// Mounted at /api (Feature 4: collaborative solution bidding).
const router = Router();

function httpFor(result: TransitionResult): number {
  switch (result.code) {
    case 'NOT_FOUND':
      return 404;
    case 'FORBIDDEN':
      return 403;
    case 'INVALID_TRANSITION':
    case 'CONFLICT':
      return 409;
    case 'DB_ERROR':
      return 500;
    default:
      return 400;
  }
}

// POST /api/bid-rounds/:requestId/open  (OPS/ADMIN) — distribute to top N technicians.
router.post(
  '/bid-rounds/:requestId/open',
  authenticate,
  authorize('OPS_MANAGER', 'ADMIN'),
  validate({ params: requestIdParam, body: bidRoundOpenSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await openBidding(req.params.requestId, Number(req.body?.top_n) || 3, req.user!.id, req.user!.role);
    if (!result.success) throw new AppError(result.error ?? 'Failed to open bidding', httpFor(result), result.code);
    ok(res, { bid_round: result.bid_round, invited: result.invited, service_request: result.service_request });
  })
);

// POST /api/bids/submit  (technician submits a blind bid)
router.post(
  '/bids/submit',
  authenticate,
  authorize('TECHNICIAN'),
  validate({ body: bidSubmitSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const techId = await resolveTechnicianId(req.user!.id);
    if (!techId) throw forbidden('Only technicians can submit bids');

    const b = req.body ?? {};
    if (!b.service_request_id || !b.proposed_solution || b.labor_hours == null || b.total_cost == null) {
      throw badRequest('service_request_id, proposed_solution, labor_hours and total_cost are required');
    }

    const { data: round } = await supabase
      .from('bid_rounds')
      .select('id, status')
      .eq('service_request_id', b.service_request_id)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!round || round.status !== 'OPEN') throw badRequest('Bidding is not open for this request');

    const { data, error } = await supabase
      .from('solution_bids')
      .insert({
        service_request_id: b.service_request_id,
        bid_round_id: round.id,
        technician_id: techId,
        proposed_solution: b.proposed_solution,
        parts_list: b.parts_list ?? [],
        labor_hours: b.labor_hours,
        total_cost: b.total_cost,
        approach_description: b.approach_description ?? null,
        status: 'SUBMITTED',
      })
      .select()
      .single();
    if (error) {
      if ((error as any).code === '23505') throw new AppError('You already submitted a bid for this request', 409, 'CONFLICT');
      throw badRequest(error.message);
    }

    await createAuditLog({
      entity_type: 'solution_bid',
      entity_id: data.id,
      action: 'CREATE',
      performed_by: req.user!.id,
      metadata: { service_request_id: b.service_request_id },
    });
    created(res, { bid: data });
  })
);

// GET /api/bids/:requestId  — BLIND: technicians see only their own bid; ops/admin see all.
router.get(
  '/bids/:requestId',
  authenticate,
  validate({ params: requestIdParam }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const isOps = req.user!.role === 'OPS_MANAGER' || req.user!.role === 'ADMIN';
    let query = supabase
      .from('solution_bids')
      .select('*, technicians(employee_code, users(full_name))')
      .eq('service_request_id', req.params.requestId);

    if (!isOps) {
      const techId = await resolveTechnicianId(req.user!.id);
      if (!techId) {
        return ok(res, { bids: [] }); // non-tech, non-ops → nothing
      }
      query = query.eq('technician_id', techId); // blind: own bid only
    }

    const { data } = await query.order('submitted_at');
    ok(res, { bids: data ?? [], visibility: isOps ? 'all' : 'own' });
  })
);

// POST /api/bids/:requestId/score  (OPS/ADMIN) — AI scores all bids.
router.post(
  '/bids/:requestId/score',
  authenticate,
  authorize('OPS_MANAGER', 'ADMIN'),
  validate({ params: requestIdParam }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await scoreBids(req.params.requestId, req.user!.id, req.user!.role);
    if (!result.success) throw new AppError(result.error ?? 'Failed to score bids', httpFor(result), result.code);
    ok(res, { ranked_bids: result.ranked_bids, service_request: result.service_request });
  })
);

// PUT /api/bids/:bidId/accept  (OPS/ADMIN) — pick winner → assign + stage parts.
router.put(
  '/bids/:bidId/accept',
  authenticate,
  authorize('OPS_MANAGER', 'ADMIN'),
  validate({ params: bidIdParam }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await acceptBid(req.params.bidId, req.user!.id, req.user!.role);
    if (!result.success) throw new AppError(result.error ?? 'Failed to accept bid', httpFor(result), result.code);
    ok(res, { service_request: result.service_request, bid: result.bid, staging: result.staging });
  })
);

export default router;
