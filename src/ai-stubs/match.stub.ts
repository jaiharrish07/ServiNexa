interface RankedTechnician {
  technician_id: string;
  score: number;
  reasoning: string;
}

/**
 * Rule-based technician-matching fallback. Scores each available technician
 * on skill match, current workload, site co-location and rating, then returns
 * the top 5 ranked descending by score.
 */
export function matchStub(
  technicians: any[],
  request: any
): { ranked_technicians: RankedTechnician[] } {
  if (!Array.isArray(technicians)) {
    return { ranked_technicians: [] };
  }

  const ranked: RankedTechnician[] = technicians
    .filter((t: any) => t.is_available)
    .map((tech: any) => {
      let score = 50;
      const reasons: string[] = [];

      // Skill match.
      if (
        request?.category &&
        Array.isArray(tech.specializations) &&
        tech.specializations
          .map((s: unknown) => String(s).toLowerCase())
          .includes(String(request.category).toLowerCase())
      ) {
        score += 25;
        reasons.push(`Specializes in ${request.category}`);
      }

      // Workload — more free capacity scores higher.
      const max = tech.max_concurrent_jobs || 1;
      const loadFactor = 1 - (tech.current_job_count || 0) / max;
      score += loadFactor * 15;
      reasons.push(`Workload: ${tech.current_job_count || 0}/${max} jobs`);

      // Same site.
      if (tech.site_id && request?.site_id && tech.site_id === request.site_id) {
        score += 10;
        reasons.push('Same site');
      }

      // Rating nudge (small tie-breaker).
      if (typeof tech.rating === 'number') {
        score += (tech.rating - 4) * 2;
      }

      return {
        technician_id: tech.id,
        score: Math.round(Math.max(0, Math.min(score, 100))),
        reasoning: reasons.join('; '),
      };
    });

  ranked.sort((a: RankedTechnician, b: RankedTechnician) => b.score - a.score);

  return { ranked_technicians: ranked.slice(0, 5) };
}
