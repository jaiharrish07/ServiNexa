import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { ok } from '../utils/api-response';

// Mounted at /api (Feature 6: SLA risk heatmap).
const router = Router();

const ACTIVE = ['SUBMITTED', 'VALIDATING', 'PENDING_APPROVAL', 'APPROVED', 'BIDDING', 'BID_REVIEW', 'BID_ACCEPTED', 'ASSIGNED', 'IN_PROGRESS'];

function slaStatus(createdAt: string, deadline: string | null): { status: string; pct: number; remainingMins: number } {
  if (!deadline) return { status: 'GREEN', pct: 0, remainingMins: 0 };
  const now = Date.now();
  const dl = new Date(deadline).getTime();
  const created = new Date(createdAt).getTime();
  const total = Math.max(1, dl - created);
  const remaining = dl - now;
  const ratio = remaining / total;
  const pct = Math.max(0, Math.min(100, Math.round((1 - ratio) * 100)));
  const remainingMins = Math.round(remaining / 60000);
  let status: string;
  if (ratio <= 0) status = 'BLACK';
  else if (ratio < 0.1) status = 'RED';
  else if (ratio < 0.25) status = 'ORANGE';
  else if (ratio < 0.5) status = 'YELLOW';
  else status = 'GREEN';
  return { status, pct, remainingMins };
}

// GET /api/dashboard/sla-heatmap?site_id=&priority=&category=&technician_id=&sla_status=
router.get(
  '/dashboard/sla-heatmap',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    let query = supabase
      .from('service_requests')
      .select(
        '*, machines(code, name), technician:technicians!assigned_technician_id(employee_code, users(full_name))'
      )
      .in('status', ACTIVE)
      .order('created_at', { ascending: false })
      .limit(300);

    if (req.query.site_id) query = query.eq('site_id', req.query.site_id as string);
    if (req.query.priority) query = query.eq('priority', req.query.priority as string);
    if (req.query.category) query = query.eq('category', req.query.category as string);
    if (req.query.technician_id) query = query.eq('assigned_technician_id', req.query.technician_id as string);

    const { data } = await query;

    let cards = (data ?? []).map((sr: any) => {
      const sla = slaStatus(sr.created_at, sr.sla_deadline);
      const impact = sr.cascading_impact_score ?? 0;
      const elevated = (sla.status === 'RED' || sla.status === 'BLACK') && impact >= 50;
      return {
        service_request_id: sr.id,
        request_number: sr.request_number,
        machine_code: sr.machines?.code ?? null,
        machine_name: sr.machines?.name ?? null,
        category: sr.category,
        priority: sr.priority,
        status: sr.status,
        assigned_technician: sr.technician?.users?.full_name ?? null,
        sla_status: sla.status,
        pct_elapsed: sla.pct,
        time_remaining_mins: sla.remainingMins,
        cascading_impact_score: impact,
        impact_inr: sr.impact_inr ?? 0,
        elevated_alert: elevated,
      };
    });

    if (req.query.sla_status) {
      const want = (req.query.sla_status as string).toUpperCase();
      cards = cards.filter((c) => c.sla_status === want);
    }

    const summary: Record<string, number> = {};
    for (const c of cards) summary[c.sla_status] = (summary[c.sla_status] ?? 0) + 1;

    ok(res, { heatmap: cards, summary, total: cards.length });
  })
);

export default router;
