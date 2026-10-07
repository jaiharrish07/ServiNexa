import { describe, it, expect } from 'vitest';
import { classifyStub } from '../src/ai-stubs/classify.stub';
import { predictStub } from '../src/ai-stubs/predict.stub';
import { matchStub } from '../src/ai-stubs/match.stub';

describe('classifyStub', () => {
  it('maps hydraulic/leak → HYDRAULIC/HIGH', () => {
    const r = classifyStub('The hydraulic system is leaking fluid near the cylinder');
    expect(r.category).toBe('HYDRAULIC');
    expect(r.priority).toBe('HIGH');
    expect(r.confidence).toBeGreaterThan(0.5);
  });
  it('maps fire → SAFETY/CRITICAL', () => {
    const r = classifyStub('possible fire hazard near the panel');
    expect(r.category).toBe('SAFETY');
    expect(r.priority).toBe('CRITICAL');
  });
  it('defaults to OTHER/MEDIUM on no match', () => {
    const r = classifyStub('something completely unrelated xyz');
    expect(r.category).toBe('OTHER');
    expect(r.priority).toBe('MEDIUM');
    expect(r.confidence).toBeLessThan(0.5);
  });
  it('handles empty input defensively', () => {
    expect(classifyStub('').category).toBe('OTHER');
  });
});

describe('predictStub', () => {
  it('flags HIGH risk for the worn+hot M-104 demo machine', () => {
    const r = predictStub({ air_temp: 25.5, process_temp: 38.2, rotational_speed: 1480, torque: 55.3, tool_wear: 210 });
    expect(r.risk_level).toBe('HIGH');
    expect(r.failure_probability).toBeCloseTo(0.5, 5);
    expect(r.failure_modes.some((m) => m.mode === 'Tool Wear Failure')).toBe(true);
  });
  it('reports LOW risk for a healthy machine', () => {
    const r = predictStub({ air_temp: 23, process_temp: 30, rotational_speed: 1500, torque: 35, tool_wear: 50 });
    expect(r.risk_level).toBe('LOW');
  });
  it('coerces invalid sensor values and never exceeds probability 1', () => {
    // @ts-expect-error partial/invalid input on purpose
    const r = predictStub({ air_temp: NaN, process_temp: undefined });
    expect(typeof r.failure_probability).toBe('number');
    expect(r.failure_probability).toBeLessThanOrEqual(1);
  });
});

describe('matchStub', () => {
  const techs = [
    { id: 't1', is_available: true, specializations: ['hydraulic', 'mechanical'], current_job_count: 1, max_concurrent_jobs: 3, site_id: 'A', rating: 4.8 },
    { id: 't2', is_available: true, specializations: ['electrical'], current_job_count: 3, max_concurrent_jobs: 3, site_id: 'B', rating: 4.0 },
    { id: 't3', is_available: false, specializations: ['hydraulic'], current_job_count: 0, max_concurrent_jobs: 3, site_id: 'A', rating: 5.0 },
  ];
  const request = { category: 'HYDRAULIC', site_id: 'A' };

  it('ranks the specialized, same-site, low-load tech first', () => {
    expect(matchStub(techs, request).ranked_technicians[0].technician_id).toBe('t1');
  });
  it('excludes unavailable technicians', () => {
    const ids = matchStub(techs, request).ranked_technicians.map((t) => t.technician_id);
    expect(ids).not.toContain('t3');
  });
  it('clamps scores to 0..100 and caps at 5', () => {
    const r = matchStub(techs, request);
    for (const t of r.ranked_technicians) {
      expect(t.score).toBeGreaterThanOrEqual(0);
      expect(t.score).toBeLessThanOrEqual(100);
    }
    expect(r.ranked_technicians.length).toBeLessThanOrEqual(5);
  });
  it('returns empty list for non-array input', () => {
    // @ts-expect-error intentional bad input
    expect(matchStub(null, request).ranked_technicians).toEqual([]);
  });
});
