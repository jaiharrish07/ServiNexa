import { supabase } from '../config/supabase';
import { callAIService } from './ai-client';
import { knowledgeStub } from '../ai-stubs/knowledge.stub';

/**
 * Solution knowledge base (Feature 7). Searches past resolved cases for the top
 * matches (AI with stub fallback), and auto-indexes completed repairs.
 */
export async function searchSimilar(params: {
  category?: string;
  machine_type?: string;
  sub_category?: string;
  description?: string;
}) {
  let query = supabase.from('knowledge_entries').select('*').limit(50);
  if (params.machine_type) query = query.eq('machine_type', params.machine_type);
  else if (params.category) query = query.eq('category', params.category);
  const { data: cases } = await query;

  const payload = {
    category: params.category ?? '',
    machine_type: params.machine_type ?? '',
    sub_category: params.sub_category ?? '',
    description: params.description ?? '',
    cases: cases ?? [],
  };

  const ai = await callAIService<any>('/ai/knowledge-match', payload);
  return ai.data ? { ...ai.data, source: 'ai' as const } : { ...knowledgeStub(payload), source: 'stub' as const };
}

/** Auto-index a completed/verified request into the knowledge base. */
export async function indexFromRequest(serviceRequestId: string) {
  const { data: sr } = await supabase
    .from('service_requests')
    .select('id, category, ai_sub_category, machine_id, description, resolution_notes, selected_bid_id, assigned_technician_id')
    .eq('id', serviceRequestId)
    .maybeSingle();
  if (!sr) return null;

  const [{ data: machine }, { data: bid }, { data: wo }] = await Promise.all([
    supabase.from('machines').select('type').eq('id', sr.machine_id).maybeSingle(),
    sr.selected_bid_id
      ? supabase.from('solution_bids').select('*').eq('id', sr.selected_bid_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabase.from('work_orders').select('id, actual_hours').eq('service_request_id', serviceRequestId).maybeSingle(),
  ]);

  const { data, error } = await supabase
    .from('knowledge_entries')
    .insert({
      work_order_id: wo?.id ?? null,
      service_request_id: serviceRequestId,
      machine_type: machine?.type ?? 'Unknown',
      category: sr.category ?? 'OTHER',
      sub_category: sr.ai_sub_category ?? null,
      problem_description: sr.description ?? '',
      solution_applied: bid?.proposed_solution ?? sr.resolution_notes ?? 'Resolved',
      parts_used: bid?.parts_list ?? [],
      resolution_hours: bid?.labor_hours ?? wo?.actual_hours ?? null,
      cost: bid?.total_cost ?? null,
      technician_id: sr.assigned_technician_id ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[knowledge] index failed (non-fatal):', error.message);
    return null;
  }
  return data;
}
