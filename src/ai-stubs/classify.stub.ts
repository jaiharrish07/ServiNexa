/**
 * Rule-based fallback classifier used when the live AI service is
 * unavailable. Keyword order matters: the first keyword found in the
 * (lowercased) description wins.
 *
 * Valid categories: MECHANICAL, ELECTRICAL, HYDRAULIC, PNEUMATIC,
 * SOFTWARE, CALIBRATION, SAFETY, PREVENTIVE, OTHER.
 * Valid priorities: CRITICAL, HIGH, MEDIUM, LOW.
 */
const KEYWORD_MAP: Record<string, { category: string; priority: string }> = {
  hydraulic: { category: 'HYDRAULIC', priority: 'HIGH' },
  leak: { category: 'HYDRAULIC', priority: 'HIGH' },
  electrical: { category: 'ELECTRICAL', priority: 'MEDIUM' },
  wiring: { category: 'ELECTRICAL', priority: 'MEDIUM' },
  vibration: { category: 'MECHANICAL', priority: 'HIGH' },
  noise: { category: 'MECHANICAL', priority: 'MEDIUM' },
  grinding: { category: 'MECHANICAL', priority: 'HIGH' },
  calibrat: { category: 'CALIBRATION', priority: 'MEDIUM' },
  software: { category: 'SOFTWARE', priority: 'LOW' },
  safety: { category: 'SAFETY', priority: 'CRITICAL' },
  fire: { category: 'SAFETY', priority: 'CRITICAL' },
  smoke: { category: 'SAFETY', priority: 'CRITICAL' },
  prevent: { category: 'PREVENTIVE', priority: 'LOW' },
  routine: { category: 'PREVENTIVE', priority: 'LOW' },
  pneumatic: { category: 'PNEUMATIC', priority: 'MEDIUM' },
  'air pressure': { category: 'PNEUMATIC', priority: 'MEDIUM' },
};

export function classifyStub(
  description: string
): { category: string; priority: string; confidence: number; reasoning: string } {
  if (!description) {
    return {
      category: 'OTHER',
      priority: 'MEDIUM',
      confidence: 0.2,
      reasoning: 'Rule-based: empty description',
    };
  }

  const lower = description.toLowerCase();

  for (const [keyword, result] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(keyword)) {
      return {
        ...result,
        confidence: 0.6,
        reasoning: `Rule-based: matched keyword "${keyword}"`,
      };
    }
  }

  return {
    category: 'OTHER',
    priority: 'MEDIUM',
    confidence: 0.3,
    reasoning: 'Rule-based: no keyword match, defaulting',
  };
}
