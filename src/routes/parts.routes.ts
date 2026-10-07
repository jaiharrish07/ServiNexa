import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, badRequest, notFound } from '../middleware/error-handler';
import { ok } from '../utils/api-response';
import { sourceParts } from '../services/parts.service';

// Mounted at /api (Feature 3: parts sourcing & availability).
const router = Router();

async function partsFromSelectedBid(serviceRequestId: string): Promise<string[]> {
  const { data: sr } = await supabase
    .from('service_requests')
    .select('selected_bid_id')
    .eq('id', serviceRequestId)
    .maybeSingle();
  if (!sr?.selected_bid_id) return [];
  const { data: bid } = await supabase
    .from('solution_bids')
    .select('parts_list')
    .eq('id', sr.selected_bid_id)
    .maybeSingle();
  return ((bid?.parts_list as any[]) ?? []).map((p) => p.part_number).filter(Boolean);
}

// POST /api/parts-sourcing/:requestId — body { part_numbers?, quantities? }
router.post(
  '/parts-sourcing/:requestId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data: sr } = await supabase
      .from('service_requests')
      .select('id, site_id, priority')
      .eq('id', req.params.requestId)
      .maybeSingle();
    if (!sr) throw notFound('Service request not found');

    let partNumbers: string[] = Array.isArray(req.body?.part_numbers) ? req.body.part_numbers : [];
    if (!partNumbers.length) partNumbers = await partsFromSelectedBid(sr.id);
    if (!partNumbers.length) throw badRequest('No part_numbers provided and no selected bid parts found');

    const sourcing = await sourceParts(partNumbers, sr.site_id, {
      priority: sr.priority,
      quantities: req.body?.quantities,
    });
    ok(res, { sourcing });
  })
);

// GET /api/parts-sourcing/:requestId — recompute from the selected bid's parts.
router.get(
  '/parts-sourcing/:requestId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data: sr } = await supabase
      .from('service_requests')
      .select('id, site_id, priority')
      .eq('id', req.params.requestId)
      .maybeSingle();
    if (!sr) throw notFound('Service request not found');
    const partNumbers = await partsFromSelectedBid(sr.id);
    const sourcing = partNumbers.length
      ? await sourceParts(partNumbers, sr.site_id, { priority: sr.priority })
      : { matrix: [], total_cost_inr: 0, ready_by_hours: 0, notes: 'No parts identified yet', source: 'stub' };
    ok(res, { sourcing });
  })
);

// GET /api/inventory/:siteId — site inventory with low-stock flags.
router.get(
  '/inventory/:siteId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data } = await supabase
      .from('spare_parts')
      .select('*')
      .eq('site_id', req.params.siteId)
      .order('name');
    const inventory = (data ?? []).map((p: any) => ({
      ...p,
      available: (p.quantity_available ?? 0) - (p.quantity_reserved ?? 0),
      low_stock: (p.quantity_available ?? 0) - (p.quantity_reserved ?? 0) <= (p.reorder_level ?? 0),
    }));
    ok(res, { inventory });
  })
);

// GET /api/parts/:partNumber/substitutes
router.get(
  '/parts/:partNumber/substitutes',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data } = await supabase
      .from('part_substitutes')
      .select('*')
      .eq('original_part_number', req.params.partNumber);
    ok(res, { substitutes: data ?? [] });
  })
);

export default router;
