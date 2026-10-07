import { describe, it, expect, afterAll, vi } from 'vitest';

vi.mock('../src/config/ai-service', () => ({ AI_SERVICE_URL: 'http://ai.test', AI_SERVICE_TOKEN: 'test-only-token', AI_TIMEOUT_MS: 50 }));

import { callAIService } from '../src/services/ai-client';

const realFetch = global.fetch;
afterAll(() => {
  global.fetch = realFetch;
});

describe('callAIService', () => {
  it('returns source "ai" on a successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ category: 'HYDRAULIC', priority: 'HIGH' }),
    }) as any;
    const r = await callAIService<{ category: string }>('/ai/classify-request', { description: 'x' });
    expect(r.source).toBe('ai');
    expect(r.data).toEqual({ category: 'HYDRAULIC', priority: 'HIGH' });
    expect(r.error).toBeNull();
  });

  it('falls back to stub on a non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }) as any;
    const r = await callAIService('/ai/predict-health', {});
    expect(r.source).toBe('stub');
    expect(r.data).toBeNull();
    expect(r.error).toContain('503');
  });

  it('falls back to stub on a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
    const r = await callAIService('/ai/match-technician', {});
    expect(r.source).toBe('stub');
    expect(r.error).toContain('ECONNREFUSED');
  });

  it('falls back to stub when the request aborts/times out', async () => {
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          setTimeout(() => reject(err), 5);
        }),
    ) as any;
    const r = await callAIService('/ai/detect-anomalies', {});
    expect(r.source).toBe('stub');
  });
});
