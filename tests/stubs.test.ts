import { classifyStub } from '../src/ai-stubs/classify.stub';
import { predictStub } from '../src/ai-stubs/predict.stub';
import { matchStub } from '../src/ai-stubs/match.stub';

describe('classifyStub', () => {
  it('matches hydraulic/leak keywords to HYDRAULIC/HIGH', () => {
    const r = classifyStub('The hydraulic system is leaking fluid near the cylinder');
    expect(r.category).toBe('HYDRAULIC');
    expect(r.priority).toBe('HIGH');
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('maps safety/fire to SAFETY/CRITICAL', () => {
    expect(classifyStub('possible fire hazard').category).toBe('SAFETY');
    expect(classifyStub('possible fire hazard').priority).toBe('CRITICAL');
  });

  it('defaults to OTHER/MEDIUM with low confidence on no match', () => {
    const r = classifyStub('something completely unrelated xyz');
    expect(r.category).toBe('OTHER');
    expect(r.priority).toBe('MEDIUM');
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('handles empty description defensively', () => {
    const r = classifyStub('');
    expect(r.category).toBe('OTHER');
    expect(r.confidence).toBeGreaterThan(0);
  });
});

describe('predictStub', () => {
  it('flags HIGH risk for the M-104 demo machine (worn tool + hot)', () => {
    const r = predictStub({
      air_temp: 25.5,
      process_temp: 38.2,
      rotational_speed: 1480,
      torque: 55.3,
      tool_wear: 210,
    });
    expect(r.risk_level).toBe('HIGH');
    expect(r.failure_probability).toBeCloseTo(0.5, 5);
    expect(r.failure_modes.some((m) => m.mode === 'Tool Wear Failure')).toBe(true);
  });

  it('reports LOW risk for a healthy machine', () => {
    const r = predictStub({
      air_temp: 23,
      process_temp: 30,
      rotational_speed: 1500,
      torque: 35,
      tool_wear: 50,
    });
    expect(r.risk_level).toBe('LOW');
    expect(r.failure_modes.length).toBeGreaterThan(0);
  });

  it('coerces missing/NaN sensor values to sane defaults', () => {
    // @ts-expect-error intentionally passing partial/invalid data
    const r = predictStub({ air_temp: NaN, process_temp: undefined });
    expect(typeof r.failure_probability).toBe('number');
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(r.risk_level);
  });

  it('never returns a probability above 1', () => {
    const r = predictStub({
      air_temp: 10,
      process_temp: 90,
      rotational_speed: 3000,
      torque: 100,
      tool_wear: 999,
    });
    expect(r.failure_probability).toBeLessThanOrEqual(1);
  });
});

describe('matchStub', () => {
  const techs = [
    {
      id: 't1',
      is_available: true,
      specializations: ['hydraulic', 'mechanical'],
      current_job_count: 1,
      max_concurrent_jobs: 3,
      site_id: 'siteA',
      rating: 4.8,
    },
    {
      id: 't2',
      is_available: true,
      specializations: ['electrical'],
      current_job_count: 3,
      max_concurrent_jobs: 3,
      site_id: 'siteB',
      rating: 4.0,
    },
    {
      id: 't3',
      is_available: false,
      specializations: ['hydraulic'],
      current_job_count: 0,
      max_concurrent_jobs: 3,
      site_id: 'siteA',
      rating: 5.0,
    },
  ];
  const request = { category: 'HYDRAULIC', site_id: 'siteA' };

  it('ranks the specialized, same-site, low-load technician first', () => {
    const r = matchStub(techs, request);
    expect(r.ranked_technicians[0].technician_id).toBe('t1');
  });

  it('excludes unavailable technicians', () => {
    const ids = matchStub(techs, request).ranked_technicians.map((t) => t.technician_id);
    expect(ids).not.toContain('t3');
  });

  it('clamps scores to 0..100 and returns at most 5', () => {
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
