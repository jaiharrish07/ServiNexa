import { supabase } from '../config/supabase';
import { callAIService } from './ai-client';
import { impactStub } from '../ai-stubs/impact.stub';

/**
 * Cascading impact (Feature 2). Gathers the dependency graph + open production
 * orders, asks the AI service to monetize the cascade (stub fallback), persists an
 * impact_analyses row, and writes the score back onto the service request.
 */
export async function computeImpact(machineId: string, serviceRequestId?: string) {
  const [{ data: deps }, { data: machines }, { data: orders }] = await Promise.all([
    supabase.from('machine_dependencies').select('*'),
    supabase.from('machines').select('id, code'),
    supabase.from('production_orders').select('order_code, deadline, sla_penalty, machine_id').eq('status', 'OPEN'),
  ]);

  const codeById: Record<string, string> = {};
  for (const m of machines ?? []) codeById[m.id] = m.code;

  const edges = (deps ?? []).map((d: any) => ({
    upstream: d.machine_id,
    downstream: d.depends_on_machine_id,
    machine_code: codeById[d.depends_on_machine_id] ?? d.depends_on_machine_id,
    throughput_rate: d.throughput_rate ?? 0,
    unit_value: Number(d.unit_value ?? 0),
    buffer_hours: d.buffer_hours ?? 0,
    production_line: d.production_line ?? undefined,
  }));

  const payload = {
    machine_id: machineId,
    machine_code: codeById[machineId] ?? '',
    edges,
    production_orders: (orders ?? []).map((o: any) => ({
      order_code: o.order_code,
      deadline: o.deadline,
      penalty_inr: Number(o.sla_penalty ?? 0),
      machine_id: o.machine_id,
    })),
    hours: 1,
  };

  const ai = await callAIService<any>('/ai/impact-analyze', payload);
  const result = ai.data ? { ...ai.data, source: 'ai' as const } : { ...impactStub(payload), source: 'stub' as const };

  if (serviceRequestId) {
    await supabase.from('impact_analyses').insert({
      service_request_id: serviceRequestId,
      source_machine_id: machineId,
      affected_machines: result.affected_machines ?? [],
      total_hourly_impact_inr: result.total_hourly_impact_inr ?? 0,
      cascade_depth: result.cascade_depth ?? 0,
      production_lines_affected: result.production_lines ?? [],
      cascading_impact_score: result.cascading_impact_score ?? 0,
      ai_analysis: result,
      source: result.source,
    });
    await supabase
      .from('service_requests')
      .update({
        cascading_impact_score: result.cascading_impact_score ?? 0,
        impact_inr: result.total_hourly_impact_inr ?? 0,
        impact_calculated_at: new Date().toISOString(),
      })
      .eq('id', serviceRequestId);
  }

  return result;
}

export async function getDependencyGraph(machineId: string) {
  const { data: deps } = await supabase.from('machine_dependencies').select('*').eq('machine_id', machineId);
  const { data: machines } = await supabase.from('machines').select('id, code, name');
  const byId: Record<string, any> = {};
  for (const m of machines ?? []) byId[m.id] = m;
  return (deps ?? []).map((d: any) => ({
    ...d,
    upstream: byId[d.machine_id],
    downstream: byId[d.depends_on_machine_id],
  }));
}
