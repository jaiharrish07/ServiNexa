import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});

import stagingRoutes from '../src/routes/staging.routes';
import { resetDb, seedTable, getTable } from './_mocks/supabase';
import { testApp, seedUser } from './_mocks/helpers';

const app = testApp((a) => a.use('/api', stagingRoutes));
beforeEach(() => resetDb());

describe('parts staging status', () => {
  it('allows forward status changes and records arrival when staged', async () => {
    const ops = seedUser('OPS_MANAGER');
    const requestId = randomUUID();
    const stagingId = randomUUID();
    seedTable('service_requests', [{ id: requestId, status: 'ASSIGNED', site_id: randomUUID() }]);
    seedTable('parts_staging', [{ id: stagingId, service_request_id: requestId, status: 'RESERVED', part_number: 'P-1', quantity: 1 }]);

    await request(app).put(`/api/staging/${stagingId}/status`).set('Authorization', ops.bearer).send({ status: 'STAGED' }).expect(200);
    expect(getTable('parts_staging')[0].status).toBe('STAGED');
    expect(getTable('parts_staging')[0].actual_arrival).toBeTruthy();
  });

  it('rejects backward movement and leaves the staging row unchanged', async () => {
    const ops = seedUser('OPS_MANAGER');
    const requestId = randomUUID();
    const stagingId = randomUUID();
    seedTable('service_requests', [{ id: requestId, status: 'ASSIGNED', site_id: randomUUID() }]);
    seedTable('parts_staging', [{ id: stagingId, service_request_id: requestId, status: 'ISSUED', part_number: 'P-1', quantity: 1 }]);

    await request(app).put(`/api/staging/${stagingId}/status`).set('Authorization', ops.bearer).send({ status: 'IDENTIFIED' }).expect(409);
    expect(getTable('parts_staging')[0].status).toBe('ISSUED');
  });
});
