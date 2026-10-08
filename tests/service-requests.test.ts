import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});

import srRouter from '../src/routes/service-requests.routes';
import { resetDb, seedTable, getTable } from './_mocks/supabase';
import { testApp, seedUser } from './_mocks/helpers';
import { insertWithUniqueNumber } from '../src/utils/request-number';

const app = testApp((a) => a.use('/api/service-requests', srRouter));
beforeEach(() => resetDb());

const SITE = randomUUID();
const sr = (over: Record<string, any> = {}) => ({
  id: randomUUID(),
  request_number: `SR-20240101-${Math.floor(Math.random() * 900 + 100)}`,
  site_id: SITE,
  requester_id: randomUUID(),
  title: 'Leak',
  description: 'Hydraulic leak detected',
  status: 'DRAFT',
  priority: 'MEDIUM',
  created_at: new Date().toISOString(),
  ...over,
});

describe('service-requests', () => {
  it('401 without a token', async () => {
    await request(app).get('/api/service-requests').expect(401);
  });

  it('lists with pagination meta', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('service_requests', [sr(), sr(), sr()]);
    const res = await request(app).get('/api/service-requests?limit=2&page=1').set('Authorization', u.bearer).expect(200);
    expect(res.body.service_requests).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);
  });

  it('customers see only their own service requests', async () => {
    const customer = seedUser('CUSTOMER');
    const owned = sr({ requester_id: customer.id });
    const privateOther = sr();
    seedTable('service_requests', [owned, privateOther]);
    const res = await request(app).get('/api/service-requests').set('Authorization', customer.bearer).expect(200);
    expect(res.body.service_requests.map((x: any) => x.id)).toEqual([owned.id]);
    await request(app).get(`/api/service-requests/${privateOther.id}`).set('Authorization', customer.bearer).expect(404);
    await request(app).patch(`/api/service-requests/${privateOther.id}`).set('Authorization', customer.bearer).send({ title: 'Changed title' }).expect(404);
  });

  it('customers can edit only their own draft requests', async () => {
    const customer = seedUser('CUSTOMER');
    const owned = sr({ requester_id: customer.id });
    seedTable('service_requests', [owned]);
    await request(app).patch(`/api/service-requests/${owned.id}`).set('Authorization', customer.bearer).send({ title: 'New title' }).expect(200);
    seedTable('service_requests', [sr({ requester_id: customer.id, status: 'APPROVED' })]);
    const approved = getTable('service_requests')[1];
    await request(app).patch(`/api/service-requests/${approved.id}`).set('Authorization', customer.bearer).send({ title: 'Attempt edit' }).expect(409);
  });

  it('filters by status', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('service_requests', [sr({ status: 'SUBMITTED' }), sr({ status: 'DRAFT' })]);
    const res = await request(app).get('/api/service-requests?status=SUBMITTED').set('Authorization', u.bearer).expect(200);
    expect(res.body.service_requests).toHaveLength(1);
  });

  it('creates an SR with server-controlled fields (status/requester/number)', async () => {
    const u = seedUser('CUSTOMER');
    const res = await request(app)
      .post('/api/service-requests')
      .set('Authorization', u.bearer)
      .send({
        site_id: SITE,
        title: 'Hydraulic leak on CNC',
        description: 'Leaking near the main cylinder, pressure dropping',
        priority: 'HIGH',
      })
      .expect(201);
    const created = res.body.service_request;
    expect(created.status).toBe('DRAFT');
    expect(created.requester_id).toBe(u.id);
    expect(created.request_number).toMatch(/^SR-\d{8}-\d{3}$/);
    const creationAudit = getTable('audit_logs').find((entry) => entry.entity_id === created.id);
    expect(creationAudit).toMatchObject({
      entity_type: 'service_request',
      action: 'CREATE',
      metadata: { request_number: created.request_number },
    });
  });

  it('ignores client attempts to set status / requester_id (mass-assignment)', async () => {
    const u = seedUser('CUSTOMER');
    const other = randomUUID();
    const res = await request(app)
      .post('/api/service-requests')
      .set('Authorization', u.bearer)
      .send({
        site_id: SITE,
        title: 'Sneaky request',
        description: 'trying to self-approve',
        status: 'CLOSED',
        requester_id: other,
        request_number: 'SR-HACKED',
      })
      .expect(201);
    expect(res.body.service_request.status).toBe('DRAFT');
    expect(res.body.service_request.requester_id).toBe(u.id);
    expect(res.body.service_request.request_number).not.toBe('SR-HACKED');
  });

  it('400 on too-short title', async () => {
    const u = seedUser('CUSTOMER');
    await request(app)
      .post('/api/service-requests')
      .set('Authorization', u.bearer)
      .send({ site_id: SITE, title: 'ab', description: 'long enough description' })
      .expect(400);
  });

  it('404 patching unknown id', async () => {
    const u = seedUser('OPS_MANAGER');
    await request(app)
      .patch(`/api/service-requests/${randomUUID()}`)
      .set('Authorization', u.bearer)
      .send({ priority: 'LOW' })
      .expect(404);
  });
});

describe('insertWithUniqueNumber', () => {
  it('retries on 23505 then succeeds (called twice)', async () => {
    let calls = 0;
    const result = await insertWithUniqueNumber({
      generate: () => `SR-20240101-${calls}`,
      insert: async () => {
        calls++;
        if (calls === 1) return { data: null, error: { code: '23505', message: 'dup' } };
        return { data: { id: 'ok', request_number: `SR-20240101-${calls}` }, error: null };
      },
    });
    expect(calls).toBe(2);
    expect(result.error).toBeNull();
    expect(result.data.id).toBe('ok');
  });

  it('bails immediately on a non-23505 error', async () => {
    let calls = 0;
    const result = await insertWithUniqueNumber({
      generate: () => 'SR-X',
      insert: async () => {
        calls++;
        return { data: null, error: { code: '23503', message: 'fk' } };
      },
    });
    expect(calls).toBe(1);
    expect(result.error.code).toBe('23503');
  });
});
