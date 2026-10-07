import { supabase } from '../config/supabase';
import { callAIService } from './ai-client';
import { matchStub } from '../ai-stubs/match.stub';
import { bidsStub } from '../ai-stubs/bids.stub';
import { transitionStatus, TransitionResult } from './workflow';
import { createNotifications } from './notifications';
import { NotificationInput } from '../schemas/notifications';
import { planStaging } from './staging.service';

/**
 * Collaborative bidding (Feature 4). APPROVED → BIDDING → BID_REVIEW → BID_ACCEPTED
 * → ASSIGNED. Top technicians are invited; they submit blind bids; the AI scores
 * them (stub fallback); ops accepts one, which assigns the tech + stages parts.
 */

export async function openBidding(
  serviceRequestId: string,
  topN: number,
  userId: string,
  userRole: string
): Promise<TransitionResult & { bid_round?: any; invited?: any[] }> {
  const { data: sr } = await supabase.from('service_requests').select('*').eq('id', serviceRequestId).single();
  if (!sr) return { success: false, error: 'Service request not found', code: 'NOT_FOUND' };

  const t = await transitionStatus(serviceRequestId, 'BIDDING', userId, userRole);
  if (!t.success) return t;

  const { data: techs } = await supabase
    .from('technicians')
    .select('*, users(full_name)')
    .eq('is_available', true);

  const techList = (techs ?? []).map((x: any) => ({
    id: x.id,
    employee_code: x.employee_code,
    name: x.users?.full_name,
    specializations: x.specializations,
    certifications: x.certifications,
    current_job_count: x.current_job_count,
    max_concurrent_jobs: x.max_concurrent_jobs,
    avg_resolution_hours: x.avg_resolution_hours,
    rating: x.rating,
    site_id: x.site_id,
    is_available: x.is_available,
  }));

  const ai = await callAIService<any>('/ai/match-technician', { request: sr, technicians: techList });
  const ranked = ai.data?.ranked_technicians ?? matchStub(techs ?? [], sr).ranked_technicians;
  const top = ranked.slice(0, topN || 3);

  const { data: round } = await supabase
    .from('bid_rounds')
    .insert({
      service_request_id: serviceRequestId,
      status: 'OPEN',
      deadline: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    })
    .select()
    .single();

  const techById: Record<string, any> = {};
  for (const x of techs ?? []) techById[x.id] = x;
  const notes: NotificationInput[] = [];
  for (const r of top) {
    const tech = techById[r.technician_id];
    if (tech?.user_id) {
      notes.push({
        user_id: tech.user_id,
        title: `Bid invitation: ${sr.request_number}`,
        message: `You're invited to submit a solution bid for "${sr.title}".`,
        type: sr.priority === 'CRITICAL' ? 'CRITICAL' : 'INFO',
        related_entity_type: 'service_request',
        related_entity_id: sr.id,
      });
    }
  }
  await createNotifications(notes);

  return { success: true, service_request: t.service_request, bid_round: round, invited: top };
}

export async function scoreBids(
  serviceRequestId: string,
  userId: string,
  userRole: string
): Promise<TransitionResult & { ranked_bids?: any[] }> {
  const { data: bids } = await supabase
    .from('solution_bids')
    .select('*, technicians(success_rate)')
    .eq('service_request_id', serviceRequestId);

  if (!bids || bids.length === 0) return { success: false, error: 'No bids to score', code: 'NOT_FOUND' };

  const { data: sr } = await supabase
    .from('service_requests')
    .select('category, priority')
    .eq('id', serviceRequestId)
    .single();

  const bidPayload = bids.map((b: any) => ({
    bid_id: b.id,
    success_rate: b.technicians?.success_rate ?? 0.8,
    proposed_solution: b.proposed_solution,
    parts_list: b.parts_list,
    labor_hours: Number(b.labor_hours ?? 0),
    total_cost: Number(b.total_cost ?? 0),
    parts_availability_score: 70,
  }));

  const ai = await callAIService<any>('/ai/score-bids', {
    category: sr?.category ?? '',
    priority: sr?.priority ?? '',
    knowledge: null,
    bids: bidPayload,
  });
  const scored = ai.data?.ranked_bids ? ai.data : bidsStub(bidPayload);
  const source = ai.data ? 'ai' : 'stub';

  for (const sb of scored.ranked_bids ?? []) {
    await supabase
      .from('solution_bids')
      .update({ ai_score: { ...sb, source }, status: 'UNDER_REVIEW' })
      .eq('id', sb.bid_id);
  }

  const t = await transitionStatus(serviceRequestId, 'BID_REVIEW', userId, userRole);
  if (!t.success) return t;

  return { success: true, service_request: t.service_request, ranked_bids: scored.ranked_bids, ...( { winner_bid_id: scored.winner_bid_id } as any) };
}

export async function acceptBid(
  bidId: string,
  userId: string,
  userRole: string
): Promise<TransitionResult & { bid?: any; staging?: any[] }> {
  const { data: bid } = await supabase.from('solution_bids').select('*').eq('id', bidId).single();
  if (!bid) return { success: false, error: 'Bid not found', code: 'NOT_FOUND' };

  const srId = bid.service_request_id;

  // Reject all, then accept the winner (two updates keep it simple + deterministic).
  await supabase.from('solution_bids').update({ status: 'REJECTED' }).eq('service_request_id', srId);
  await supabase.from('solution_bids').update({ status: 'ACCEPTED' }).eq('id', bidId);
  await supabase
    .from('bid_rounds')
    .update({ status: 'DECIDED', winning_bid_id: bidId, closed_at: new Date().toISOString() })
    .eq('service_request_id', srId);
  await supabase.from('service_requests').update({ selected_bid_id: bidId }).eq('id', srId);

  // BID_REVIEW → BID_ACCEPTED → ASSIGNED (assigns the winning technician).
  const t1 = await transitionStatus(srId, 'BID_ACCEPTED', userId, userRole);
  if (!t1.success) return { ...t1, bid };
  const t2 = await transitionStatus(srId, 'ASSIGNED', userId, userRole, { technician_id: bid.technician_id });
  if (!t2.success) return { ...t2, bid };

  // Auto-stage the winning bid's parts (Feature 5).
  const { data: sr } = await supabase.from('service_requests').select('site_id').eq('id', srId).single();
  let staging: any[] = [];
  try {
    staging = await planStaging(srId, sr?.site_id, bid.parts_list ?? []);
  } catch (e: any) {
    console.error('[bidding] staging failed (non-fatal):', e?.message || e);
  }

  return { success: true, service_request: t2.service_request, bid, staging };
}
