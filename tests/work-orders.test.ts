import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});

import woRouter from '../src/routes/work-orders.routes';
import { resetDb, seedTable, getTable } from './_mocks/supabase';
import { testApp, seedUser } from './_mocks/helpers';

const app = testApp((a) => a.use('/api/work-orders', woRouter));
beforeEach(() => resetDb());

const wo = (over: Record<string, any> = {}) => ({
  id: randomUUID(),
  order_number: `WO-20240101-${Math.floor(Math.random() * 900 + 100)}`,
  service_request_id: randomUUID(),
  technician_id: randomUUID(),
  status: 'PENDING',
  created_at: new Date().toISOString(),
  ...over,
});

describe('work-orders', () => {
  it('401 without a token', async () => {
    await request(app).get('/api/work-orders').expect(401);
  });

  it('lists with pagination meta', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('work_orders', [wo(), wo(), wo()]);
    const res = await request(app).get('/api/work-orders?limit=2&page=1').set('Authorization', u.bearer).expect(200);
    expect(res.body.work_orders).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);
  });

  it('filters by technician_id', async () => {
    const u = seedUser('OPS_MANAGER');
    const tech = randomUUID();
    seedTable('work_orders', [wo({ technician_id: tech }), wo()]);
    const res = await request(app).get(`/api/work-orders?technician_id=${tech}`).set('Authorization', u.bearer).expect(200);
    expect(res.body.work_orders).toHaveLength(1);
  });

  it('OPS_MANAGER creates a work order with a generated number (201)', async () => {
    const u = seedUser('OPS_MANAGER');
    const requestId = randomUUID();
    const technicianId = randomUUID();
    seedTable('service_requests', [{ id: requestId, status: 'ASSIGNED', assigned_technician_id: technicianId }]);
    const res = await request(app)
      .post('/api/work-orders')
      .set('Authorization', u.bearer)
      .send({ service_request_id: requestId, technician_id: technicianId, estimated_hours: 3 })
      .expect(201);
    expect(res.body.work_order.order_number).toMatch(/^WO-\d{8}-\d{3}$/);
    expect(res.body.work_order.status).toBe('PENDING');
    expect(getTable('work_orders')).toHaveLength(1);
  });

  it('rejects a work order for an unassigned request', async () => {
    const u = seedUser('OPS_MANAGER');
    const requestId = randomUUID();
    seedTable('service_requests', [{ id: requestId, status: 'DRAFT', assigned_technician_id: null }]);
    await request(app)
      .post('/api/work-orders')
      .set('Authorization', u.bearer)
      .send({ service_request_id: requestId, technician_id: randomUUID() })
      .expect(400);
    expect(getTable('work_orders')).toHaveLength(0);
  });

  it('CUSTOMER cannot create a work order (403)', async () => {
    const u = seedUser('CUSTOMER');
    await request(app)
      .post('/api/work-orders')
      .set('Authorization', u.bearer)
      .send({ service_request_id: randomUUID(), technician_id: randomUUID() })
      .expect(403);
  });

  it('400 on missing required field', async () => {
    const u = seedUser('ADMIN');
    await request(app)
      .post('/api/work-orders')
      .set('Authorization', u.bearer)
      .send({ service_request_id: randomUUID() })
      .expect(400);
  });

  it('assigned technician can advance their work order status', async () => {
    const u = seedUser('TECHNICIAN');
    const techId = randomUUID();
    const requestId = randomUUID();
    const w = wo({ technician_id: techId, service_request_id: requestId });
    seedTable('technicians', [{ id: techId, user_id: u.id, site_id: randomUUID() }]);
    seedTable('service_requests', [{ id: requestId, requester_id: randomUUID(), assigned_technician_id: techId, status: 'ASSIGNED' }]);
    seedTable('work_orders', [w]);
    const res = await request(app)
      .patch(`/api/work-orders/${w.id}`)
      .set('Authorization', u.bearer)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(res.body.work_order.status).toBe('IN_PROGRESS');
  });

  it('technician cannot update another technician\'s work order', async () => {
    const u = seedUser('TECHNICIAN');
    const requestId = randomUUID();
    const assignedTechId = randomUUID();
    const callerTechId = randomUUID();
    const w = wo({ technician_id: assignedTechId, service_request_id: requestId });
    seedTable('technicians', [{ id: callerTechId, user_id: u.id, site_id: randomUUID() }]);
    seedTable('service_requests', [{ id: requestId, requester_id: randomUUID(), assigned_technician_id: assignedTechId, status: 'ASSIGNED' }]);
    seedTable('work_orders', [w]);
    await request(app).patch(`/api/work-orders/${w.id}`).set('Authorization', u.bearer).send({ status: 'IN_PROGRESS' }).expect(404);
  });

  it('404 patching unknown id', async () => {
    const u = seedUser('OPS_MANAGER');
    await request(app)
      .patch(`/api/work-orders/${randomUUID()}`)
      .set('Authorization', u.bearer)
      .send({ status: 'COMPLETED' })
      .expect(404);
  });
});
