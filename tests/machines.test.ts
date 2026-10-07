import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});

import machinesRouter from '../src/routes/machines.routes';
import { resetDb, seedTable, getTable } from './_mocks/supabase';
import { testApp, seedUser } from './_mocks/helpers';

const app = testApp((a) => a.use('/api/machines', machinesRouter));
beforeEach(() => resetDb());

const SITE = randomUUID();
const machine = (over: Record<string, any> = {}) => ({
  id: randomUUID(),
  site_id: SITE,
  name: 'CNC',
  code: `M-${randomUUID().slice(0, 4)}`,
  type: 'CNC Mill',
  status: 'OPERATIONAL',
  created_at: new Date().toISOString(),
  ...over,
});

describe('machines', () => {
  it('401 without a token', async () => {
    await request(app).get('/api/machines').expect(401);
  });

  it('lists machines with pagination meta', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('machines', [machine(), machine(), machine()]);
    const res = await request(app).get('/api/machines?limit=2&page=1').set('Authorization', u.bearer).expect(200);
    expect(res.body.machines).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);
  });

  it('filters by site_id and status', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('machines', [
      machine({ status: 'DOWN' }),
      machine({ status: 'OPERATIONAL', site_id: randomUUID() }),
    ]);
    const res = await request(app).get(`/api/machines?site_id=${SITE}&status=DOWN`).set('Authorization', u.bearer).expect(200);
    expect(res.body.machines).toHaveLength(1);
    expect(res.body.machines[0].status).toBe('DOWN');
  });

  it('404 for unknown id', async () => {
    const u = seedUser('ADMIN');
    await request(app).get(`/api/machines/${randomUUID()}`).set('Authorization', u.bearer).expect(404);
  });

  it('OPS_MANAGER can create a machine (201)', async () => {
    const u = seedUser('OPS_MANAGER');
    const res = await request(app)
      .post('/api/machines')
      .set('Authorization', u.bearer)
      .send({ site_id: SITE, name: 'Press', code: 'M-PRESS', type: 'Press', criticality: 'HIGH' })
      .expect(201);
    expect(res.body.machine.code).toBe('M-PRESS');
    expect(getTable('machines')).toHaveLength(1);
  });

  it('CUSTOMER cannot create a machine (403)', async () => {
    const u = seedUser('CUSTOMER');
    await request(app)
      .post('/api/machines')
      .set('Authorization', u.bearer)
      .send({ site_id: SITE, name: 'X', code: 'M-X', type: 'T' })
      .expect(403);
  });

  it('400 on bad enum (status)', async () => {
    const u = seedUser('ADMIN');
    await request(app)
      .post('/api/machines')
      .set('Authorization', u.bearer)
      .send({ site_id: SITE, name: 'X', code: 'M-BAD', type: 'T', status: 'EXPLODED' })
      .expect(400);
  });

  it('rejects duplicate machine code (409)', async () => {
    const u = seedUser('ADMIN');
    seedTable('machines', [machine({ code: 'M-DUP' })]);
    await request(app)
      .post('/api/machines')
      .set('Authorization', u.bearer)
      .send({ site_id: SITE, name: 'Dup', code: 'M-DUP', type: 'T' })
      .expect(409);
  });

  it('patches a machine', async () => {
    const u = seedUser('OPS_MANAGER');
    const m = machine();
    seedTable('machines', [m]);
    const res = await request(app)
      .patch(`/api/machines/${m.id}`)
      .set('Authorization', u.bearer)
      .send({ status: 'DEGRADED' })
      .expect(200);
    expect(res.body.machine.status).toBe('DEGRADED');
  });
});
