/**
 * Deterministic cascading-impact fallback (BFS over the dependency graph).
 * Mirrors the Python `/ai/impact-analyze` response shape.
 */
export interface ImpactEdge {
  upstream: string;
  downstream: string;
  machine_code?: string;
  throughput_rate?: number;
  unit_value?: number;
  buffer_hours?: number;
  production_line?: string;
}

export interface ImpactStubInput {
  machine_id: string;
  machine_code?: string;
  edges?: ImpactEdge[];
  production_orders?: Array<{ order_code?: string; deadline?: string; penalty_inr?: number; machine_id?: string }>;
  hours?: number;
}

export function impactStub(input: ImpactStubInput) {
  const edges = Array.isArray(input.edges) ? input.edges : [];
  const orders = Array.isArray(input.production_orders) ? input.production_orders : [];

  // BFS downstream from the failed machine; track depth; ignore cycles.
  const byUpstream = new Map<string, ImpactEdge[]>();
  for (const e of edges) {
    const list = byUpstream.get(e.upstream) ?? [];
    list.push(e);
    byUpstream.set(e.upstream, list);
  }

  const visited = new Set<string>([input.machine_id]);
  const affected: { machine_id: string; machine_code: string; depth: number; inr_per_hour: number; units_lost_per_hour: number; production_line?: string }[] = [];
  let queue: { id: string; depth: number }[] = [{ id: input.machine_id, depth: 0 }];

  while (queue.length) {
    const next: typeof queue = [];
    for (const { id, depth } of queue) {
      for (const e of byUpstream.get(id) ?? []) {
        if (visited.has(e.downstream)) continue;
        visited.add(e.downstream);
        const units = e.throughput_rate ?? 0;
        const inr = units * (e.unit_value ?? 0);
        affected.push({
          machine_id: e.downstream,
          machine_code: e.machine_code ?? e.downstream,
          depth: depth + 1,
          units_lost_per_hour: units,
          inr_per_hour: inr,
          production_line: e.production_line,
        });
        next.push({ id: e.downstream, depth: depth + 1 });
      }
    }
    queue = next;
  }

  const total_inr = affected.reduce((s, a) => s + a.inr_per_hour, 0);
  const total_units = affected.reduce((s, a) => s + a.units_lost_per_hour, 0);
  const cascade_depth = affected.reduce((m, a) => Math.max(m, a.depth), 0);
  const penalties = orders.reduce((s, o) => s + (o.penalty_inr ?? 0), 0);
  const lines = Array.from(new Set(affected.map((a) => a.production_line).filter(Boolean))) as string[];

  // 0..100 score: downstream breadth + money + penalties.
  const score = Math.min(
    100,
    Math.round(affected.length * 10 + total_inr / 2000 + penalties / 5000)
  );
  const sla_risk_level = score >= 70 ? 'CRITICAL' : score >= 40 ? 'HIGH' : score >= 15 ? 'MEDIUM' : 'LOW';

  return {
    root_machine_id: input.machine_id,
    downstream_count: affected.length,
    cascade_depth,
    affected_machines: affected.map((a) => a.machine_code),
    production_lines: lines,
    total_units_lost_per_hour: total_units,
    total_hourly_impact_inr: total_inr,
    total_penalty_at_risk_inr: penalties,
    cascading_impact_score: score,
    sla_risk_level,
    recommended_priority_override: score >= 70 ? 'CRITICAL' : score >= 40 ? 'HIGH' : '',
    breakdown_by_machine: affected.map((a) => ({ machine_code: a.machine_code, inr_per_hour: a.inr_per_hour })),
    tree: null,
  };
}
