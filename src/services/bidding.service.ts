import { supabase } from '../config/supabase';
import { callAIService } from './ai-client';
import { matchStub } from '../ai-stubs/match.stub';
import { bidsStub } from '../ai-stubs/bids.stub';
import { transitionStatus, TransitionResult } from './workflow';
import { createNotifications } from './notifications';
import { NotificationInput } from '../schemas/notifications';
import { planStaging } from './staging.service';
import { notifyStatusChange } from './notifications';
import { createAuditLog } from './audit';
import { hasTechnicianCapacity } from '../utils/technician';

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
  const { data: sr, error: requestError } = await supabase.from('service_requests').select('*').eq('id', serviceRequestId).single();
  if (requestError) return { success: false, error: requestError.message, code: 'DB_ERROR' };
  if (!sr) return { success: false, error: 'Service request not found', code: 'NOT_FOUND' };
  if (sr.status !== 'APPROVED') return { success: false, error: `Cannot open bidding while request is ${sr.status}`, code: 'INVALID_TRANSITION' };

  const { data: techs, error: techError } = await supabase
    .from('technicians')
    .select('*, users(full_name)')
    .eq('is_available', true);
  if (techError) return { success: false, error: techError.message, code: 'DB_ERROR' };

  const eligibleTechs = (techs ?? []).filter(hasTechnicianCapacity);
  if (eligibleTechs.length === 0) {
    return { success: false, error: 'No available technicians have capacity for this request', code: 'CONFLICT' };
  }
  const techList = eligibleTechs.map((x: any) => ({
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
  const eligibleIds = new Set(eligibleTechs.map((tech: any) => tech.id));
  const aiRanked = Array.isArray(ai.data?.ranked_technicians)
    ? ai.data.ranked_technicians.filter((candidate: any) => eligibleIds.has(candidate.technician_id))
    : [];
  const ranked = aiRanked.length ? aiRanked : matchStub(eligibleTechs, sr).ranked_technicians;
  const top = ranked.slice(0, topN || 3);

  const { data: round, error: roundError } = await supabase
    .from('bid_rounds')
    .insert({
      service_request_id: serviceRequestId,
      status: 'OPEN',
      deadline: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    })
    .select()
    .single();
  if (roundError || !round) return { success: false, error: roundError?.message ?? 'Could not create bid round', code: 'DB_ERROR' };

  const t = await transitionStatus(serviceRequestId, 'BIDDING', userId, userRole);
  if (!t.success) {
    await supabase.from('bid_rounds').update({ status: 'CLOSED', closed_at: new Date().toISOString() }).eq('id', round.id);
    return t;
  }

  const techById: Record<string, any> = {};
  for (const x of eligibleTechs) techById[x.id] = x;
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
  const { data: bids, error: bidError } = await supabase
    .from('solution_bids')
    .select('*, technicians(success_rate)')
    .eq('service_request_id', serviceRequestId);

  if (bidError) return { success: false, error: bidError.message, code: 'DB_ERROR' };
  if (!bids || bids.length === 0) return { success: false, error: 'No bids to score', code: 'NOT_FOUND' };

  const { data: sr, error: srError } = await supabase
    .from('service_requests')
    .select('category, priority, status')
    .eq('id', serviceRequestId)
    .single();
  if (srError || !sr) return { success: false, error: srError?.message ?? 'Service request not found', code: 'NOT_FOUND' };
  if (sr.status !== 'BIDDING') return { success: false, error: `Cannot score bids while request is ${sr.status}`, code: 'INVALID_TRANSITION' };

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
    const { error } = await supabase
      .from('solution_bids')
      .update({ ai_score: { ...sb, source }, status: 'UNDER_REVIEW' })
      .eq('id', sb.bid_id);
    if (error) return { success: false, error: error.message, code: 'DB_ERROR' };
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
  // One database transaction locks the request, validates BID_REVIEW, accepts
  // exactly one bid, closes the round, assigns the technician, and updates load.
  const { data, error } = await supabase.rpc('accept_solution_bid', { p_bid_id: bidId });
  if (error) {
    if (error.code === 'P0002') return { success: false, error: error.message, code: 'NOT_FOUND' };
    if (error.code === '40001') return { success: false, error: error.message, code: 'INVALID_TRANSITION' };
    if (error.code === '23514') return { success: false, error: error.message, code: 'CONFLICT' };
    return { success: false, error: error.message, code: 'DB_ERROR' };
  }
  const bid = data?.bid;
  const assignedRequest = data?.service_request;
  if (!bid || !assignedRequest) return { success: false, error: 'Bid acceptance returned incomplete data', code: 'DB_ERROR' };
  const srId = bid.service_request_id;

  await createAuditLog({ entity_type: 'service_request', entity_id: srId, action: 'STATUS_CHANGE', field_changed: 'status', old_value: 'BID_REVIEW', new_value: 'BID_ACCEPTED', performed_by: userId });
  await createAuditLog({ entity_type: 'service_request', entity_id: srId, action: 'STATUS_CHANGE', field_changed: 'status', old_value: 'BID_ACCEPTED', new_value: 'ASSIGNED', performed_by: userId, metadata: { technician_id: bid.technician_id } });
  await createAuditLog({ entity_type: 'solution_bid', entity_id: bidId, action: 'ACCEPT', performed_by: userId, metadata: { service_request_id: srId } });
  try {
    await notifyStatusChange(assignedRequest, 'BID_REVIEW', 'ASSIGNED');
  } catch (e: any) {
    console.error('[bidding] status notification failed (non-fatal):', e?.message || e);
  }

  // Auto-stage the winning bid's parts (Feature 5).
  const { data: sr } = await supabase.from('service_requests').select('site_id').eq('id', srId).single();
  let staging: any[] = [];
  try {
    staging = await planStaging(srId, sr?.site_id, bid.parts_list ?? []);
  } catch (e: any) {
    console.error('[bidding] staging failed (non-fatal):', e?.message || e);
  }

  return { success: true, service_request: assignedRequest, bid, staging };
}
