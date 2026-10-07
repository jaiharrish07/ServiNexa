/**
 * Deterministic bid-scoring fallback. Mirrors Python `/ai/score-bids`.
 * Weighted blend of completeness, cost-efficiency (vs median), track record,
 * parts availability, and speed.
 */
export interface BidInput {
  bid_id: string;
  success_rate?: number;
  diagnosis?: string;
  proposed_solution?: string;
  solution_steps?: unknown[];
  parts_list?: unknown[];
  estimated_hours?: number;
  labor_hours?: number;
  estimated_cost?: number;
  total_cost?: number;
  parts_availability_score?: number;
}

export function bidsStub(bids: BidInput[]) {
  const list = Array.isArray(bids) ? bids : [];
  if (!list.length) return { ranked_bids: [], winner_bid_id: '' };

  const costs = list.map((b) => b.total_cost ?? b.estimated_cost ?? 0).filter((c) => c > 0);
  const medianCost = costs.length ? costs.sort((a, b) => a - b)[Math.floor(costs.length / 2)] : 0;
  const hoursArr = list.map((b) => b.labor_hours ?? b.estimated_hours ?? 0).filter((h) => h > 0);
  const maxHours = hoursArr.length ? Math.max(...hoursArr) : 1;

  const ranked = list
    .map((b) => {
      const cost = b.total_cost ?? b.estimated_cost ?? 0;
      const hours = b.labor_hours ?? b.estimated_hours ?? 0;
      const hasSolution = !!(b.proposed_solution || b.diagnosis || (b.solution_steps && b.solution_steps.length));
      const hasParts = Array.isArray(b.parts_list) && b.parts_list.length > 0;

      const completeness = (hasSolution ? 70 : 30) + (hasParts ? 30 : 0);
      const cost_efficiency = medianCost > 0 && cost > 0 ? Math.round(Math.max(0, Math.min(100, (medianCost / cost) * 70))) : 60;
      const track_record_score = Math.round((b.success_rate ?? 0.8) * 100);
      const parts_availability_score = b.parts_availability_score ?? 60;
      const speed = maxHours > 0 && hours > 0 ? Math.round(Math.max(0, Math.min(100, (1 - hours / (maxHours * 1.5)) * 100))) : 60;

      const overall_score = Math.round(
        completeness * 0.25 +
          cost_efficiency * 0.2 +
          track_record_score * 0.2 +
          speed * 0.15 +
          parts_availability_score * 0.1 +
          track_record_score * 0.1
      );

      return {
        bid_id: b.bid_id,
        completeness,
        cost_efficiency,
        track_record_score,
        parts_availability_score,
        overall_score,
        recommendation: '',
        justification: `Rule-based: cost-eff ${cost_efficiency}, track ${track_record_score}, parts ${parts_availability_score}, speed ${speed}.`,
      };
    })
    .sort((a, b) => b.overall_score - a.overall_score);

  if (ranked.length) ranked[0].recommendation = 'ACCEPT';
  ranked.slice(1).forEach((r) => (r.recommendation = 'REJECT'));

  return { ranked_bids: ranked, winner_bid_id: ranked[0]?.bid_id ?? '' };
}
