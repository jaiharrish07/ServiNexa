interface MatchFactors {
  skill_match: number;
  proximity: number;
  workload: number;
  experience: number;
  certification: number;
}

interface RankedTechnician {
  technician_id: string;
  name: string;
  specializations: string[];
  score: number;
  match_score: number;
  reasoning: string;
  factors: MatchFactors;
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
    .filter((t: any) => t.is_available && (t.current_job_count ?? 0) < (t.max_concurrent_jobs ?? 3))
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

      const finalScore = Math.round(Math.max(0, Math.min(score, 100)));
      const matched =
        request?.category &&
        Array.isArray(tech.specializations) &&
        tech.specializations
          .map((s: unknown) => String(s).toLowerCase())
          .includes(String(request.category).toLowerCase());
      const factors: MatchFactors = {
        skill_match: matched ? 100 : 10,
        proximity: tech.site_id && request?.site_id && tech.site_id === request.site_id ? 100 : 40,
        workload: Math.round(Math.max(0, Math.min(100, loadFactor * 100))),
        experience: typeof tech.rating === 'number' ? Math.round((tech.rating / 5) * 100) : 70,
        certification: Array.isArray(tech.certifications) && tech.certifications.length > 0 ? 80 : 40,
      };

      return {
        technician_id: tech.id,
        name: tech.users?.full_name ?? tech.employee_code ?? 'Technician',
        specializations: tech.specializations ?? [],
        score: finalScore,
        match_score: finalScore,
        reasoning: reasons.join('; '),
        factors,
      };
    });

  ranked.sort((a: RankedTechnician, b: RankedTechnician) => b.score - a.score);

  return { ranked_technicians: ranked.slice(0, 5) };
}
