/**
 * Deterministic knowledge-match fallback. Mirrors Python `/ai/knowledge-match`.
 * Ranks past cases by sub_category/machine_type match + historical success + recency.
 */
export interface KnowledgeCase {
  entry_id?: string;
  id?: string;
  machine_type?: string;
  category?: string;
  sub_category?: string;
  solution_summary?: string;
  solution_applied?: string;
  resolution_hours?: number;
  cost?: number;
  success_flag?: boolean | null;
  created_at?: string;
}

export function knowledgeStub(params: {
  category?: string;
  machine_type?: string;
  sub_category?: string;
  cases: KnowledgeCase[];
}) {
  const cases = Array.isArray(params.cases) ? params.cases : [];

  const scored = cases
    .map((c) => {
      let relevance = 0;
      if (params.sub_category && c.sub_category === params.sub_category) relevance += 0.5;
      if (params.machine_type && c.machine_type === params.machine_type) relevance += 0.3;
      if (params.category && c.category === params.category) relevance += 0.2;
      if (c.success_flag === true) relevance += 0.1;
      return {
        entry_id: c.entry_id ?? c.id ?? '',
        solution_summary: c.solution_summary ?? c.solution_applied ?? '',
        resolution_hours: c.resolution_hours ?? 0,
        cost: c.cost ?? 0,
        success: c.success_flag !== false,
        relevance: Math.min(1, Number(relevance.toFixed(2))),
        match_reason: `Rule-based: matched ${[
          params.sub_category && c.sub_category === params.sub_category ? 'sub_category' : null,
          params.machine_type && c.machine_type === params.machine_type ? 'machine_type' : null,
          params.category && c.category === params.category ? 'category' : null,
        ]
          .filter(Boolean)
          .join(', ') || 'none'}`,
      };
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);

  const resolved = scored.filter((s) => s.resolution_hours > 0);
  const avg = resolved.length ? resolved.reduce((s, c) => s + c.resolution_hours, 0) / resolved.length : 0;

  return {
    similar_cases: scored,
    suggested_solutions: scored.map((s) => s.solution_summary).filter(Boolean),
    avg_resolution_time: Number(avg.toFixed(1)),
  };
}
