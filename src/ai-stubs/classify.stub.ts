/**
 * Rule-based fallback classifier used when the live AI service is unavailable.
 * Keyword order matters: the first keyword found in the (lowercased) description wins.
 *
 * Output is a SUPERSET that matches the Python `/ai/classify-request` response, so the
 * live AI result and this stub are interchangeable for the frontend/DB.
 * Valid categories: MECHANICAL, ELECTRICAL, HYDRAULIC, PNEUMATIC, SOFTWARE, CALIBRATION,
 * SAFETY, PREVENTIVE, OTHER. Priorities: CRITICAL, HIGH, MEDIUM, LOW.
 */
export interface ClassifyResult {
  category: string;
  sub_category: string;
  priority: string;
  confidence: number;
  urgency_score: number;
  estimated_complexity: string;
  suggested_sla_hours: number;
  reasoning: string;
}

const KEYWORD_MAP: Record<string, { category: string; priority: string; sub_category: string }> = {
  hydraulic: { category: 'HYDRAULIC', priority: 'HIGH', sub_category: 'SEAL_LEAK' },
  leak: { category: 'HYDRAULIC', priority: 'HIGH', sub_category: 'SEAL_LEAK' },
  electrical: { category: 'ELECTRICAL', priority: 'MEDIUM', sub_category: 'WIRING_FAULT' },
  wiring: { category: 'ELECTRICAL', priority: 'MEDIUM', sub_category: 'WIRING_FAULT' },
  vibration: { category: 'MECHANICAL', priority: 'HIGH', sub_category: 'BEARING_THERMAL' },
  noise: { category: 'MECHANICAL', priority: 'MEDIUM', sub_category: 'MECHANICAL_NOISE' },
  grinding: { category: 'MECHANICAL', priority: 'HIGH', sub_category: 'BEARING_THERMAL' },
  calibrat: { category: 'CALIBRATION', priority: 'MEDIUM', sub_category: 'CALIBRATION_DRIFT' },
  software: { category: 'SOFTWARE', priority: 'LOW', sub_category: 'SOFTWARE_FAULT' },
  safety: { category: 'SAFETY', priority: 'CRITICAL', sub_category: 'SAFETY_HAZARD' },
  fire: { category: 'SAFETY', priority: 'CRITICAL', sub_category: 'ELECTRICAL_FIRE' },
  smoke: { category: 'SAFETY', priority: 'CRITICAL', sub_category: 'ELECTRICAL_FIRE' },
  prevent: { category: 'PREVENTIVE', priority: 'LOW', sub_category: 'ROUTINE' },
  routine: { category: 'PREVENTIVE', priority: 'LOW', sub_category: 'ROUTINE' },
  pneumatic: { category: 'PNEUMATIC', priority: 'MEDIUM', sub_category: 'AIR_PRESSURE' },
  'air pressure': { category: 'PNEUMATIC', priority: 'MEDIUM', sub_category: 'AIR_PRESSURE' },
};

const SLA_BY_PRIORITY: Record<string, number> = { CRITICAL: 4, HIGH: 8, MEDIUM: 24, LOW: 72 };
const URGENCY_BY_PRIORITY: Record<string, number> = { CRITICAL: 0.95, HIGH: 0.75, MEDIUM: 0.5, LOW: 0.25 };
const COMPLEXITY_BY_PRIORITY: Record<string, string> = { CRITICAL: 'HIGH', HIGH: 'MEDIUM', MEDIUM: 'MEDIUM', LOW: 'LOW' };

function enrich(
  base: { category: string; priority: string; sub_category: string },
  confidence: number,
  reasoning: string
): ClassifyResult {
  return {
    ...base,
    confidence,
    reasoning,
    urgency_score: URGENCY_BY_PRIORITY[base.priority] ?? 0.5,
    estimated_complexity: COMPLEXITY_BY_PRIORITY[base.priority] ?? 'MEDIUM',
    suggested_sla_hours: SLA_BY_PRIORITY[base.priority] ?? 24,
  };
}

export function classifyStub(description: string): ClassifyResult {
  if (!description) {
    return enrich(
      { category: 'OTHER', priority: 'MEDIUM', sub_category: 'OTHER' },
      0.2,
      'Rule-based: empty description'
    );
  }

  const lower = description.toLowerCase();
  for (const [keyword, result] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(keyword)) {
      return enrich(result, 0.6, `Rule-based: matched keyword "${keyword}"`);
    }
  }

  return enrich(
    { category: 'OTHER', priority: 'MEDIUM', sub_category: 'OTHER' },
    0.3,
    'Rule-based: no keyword match, defaulting'
  );
}
