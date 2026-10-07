import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});

import partsRouter from '../src/routes/spare-parts.routes';
import { resetDb, seedTable, getTable } from './_mocks/supabase';
import { testApp, seedUser } from './_mocks/helpers';

const app = testApp((a) => a.use('/api/spare-parts', partsRouter));
beforeEach(() => resetDb());

const SITE = randomUUID();
const part = (over: Record<string, any> = {}) => ({
  id: randomUUID(),
  site_id: SITE,
  name: 'Seal Kit',
  part_number: `P-${randomUUID().slice(0, 4)}`,
  quantity_available: 10,
  quantity_reserved: 0,
  reorder_level: 5,
  created_at: new Date().toISOString(),
  ...over,
});

function seedReservationWorld(user: ReturnType<typeof seedUser>, p: ReturnType<typeof part>) {
  const technicianId = randomUUID();
  const requestId = randomUUID();
  const workOrderId = randomUUID();
  seedTable('technicians', [{ id: technicianId, user_id: user.id, site_id: SITE, is_available: true }]);
  seedTable('service_requests', [{ id: requestId, requester_id: randomUUID(), site_id: SITE, assigned_technician_id: technicianId, status: 'ASSIGNED' }]);
  seedTable('work_orders', [{ id: workOrderId, service_request_id: requestId, technician_id: technicianId, status: 'PENDING' }]);
  seedTable('spare_parts', [p]);
  return workOrderId;
}

describe('spare-parts', () => {
  it('401 without a token', async () => {
    await request(app).get('/api/spare-parts').expect(401);
  });

  it('lists with pagination meta + search', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('spare_parts', [part({ name: 'Hydraulic Seal' }), part({ name: 'Tool Insert' }), part()]);
    const res = await request(app).get('/api/spare-parts?limit=2&page=1').set('Authorization', u.bearer).expect(200);
    expect(res.body.spare_parts).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);
    const s = await request(app).get('/api/spare-parts?q=hydraulic').set('Authorization', u.bearer).expect(200);
    expect(s.body.spare_parts).toHaveLength(1);
  });

  it('OPS_MANAGER creates a part (201); CUSTOMER cannot (403)', async () => {
    const admin = seedUser('OPS_MANAGER');
    await request(app)
      .post('/api/spare-parts')
      .set('Authorization', admin.bearer)
      .send({ site_id: SITE, name: 'Bearing', part_number: 'MB-300', quantity_available: 8 })
      .expect(201);
    const cust = seedUser('CUSTOMER');
    await request(app)
      .post('/api/spare-parts')
      .set('Authorization', cust.bearer)
      .send({ site_id: SITE, name: 'X', part_number: 'X-1' })
      .expect(403);
  });

  it('reserve: happy path decrements stock and creates a reservation', async () => {
    const u = seedUser('TECHNICIAN');
    const p = part({ quantity_available: 10, quantity_reserved: 0 });
    const workOrderId = seedReservationWorld(u, p);
    const res = await request(app)
      .post(`/api/spare-parts/${p.id}/reserve`)
      .set('Authorization', u.bearer)
      .send({ work_order_id: workOrderId, quantity: 4 })
      .expect(201);
    expect(res.body.reservation.quantity).toBe(4);
    expect(getTable('spare_parts')[0].quantity_reserved).toBe(4);
    expect(getTable('reservations')).toHaveLength(1);
  });

  it('reserve: insufficient stock → 409, nothing changes', async () => {
    const u = seedUser('TECHNICIAN');
    const p = part({ quantity_available: 5, quantity_reserved: 3 }); // only 2 available
    const workOrderId = seedReservationWorld(u, p);
    await request(app)
      .post(`/api/spare-parts/${p.id}/reserve`)
      .set('Authorization', u.bearer)
      .send({ work_order_id: workOrderId, quantity: 3 })
      .expect(409);
    expect(getTable('spare_parts')[0].quantity_reserved).toBe(3);
    expect(getTable('reservations')).toHaveLength(0);
  });

  it('reserve: two SEQUENTIAL reserves of 3 → reserved=6, 2 reservations (no lost update)', async () => {
    const u = seedUser('TECHNICIAN');
    const p = part({ quantity_available: 10, quantity_reserved: 0 });
    const firstWorkOrder = seedReservationWorld(u, p);
    const secondWorkOrder = randomUUID();
    seedTable('work_orders', [{ id: secondWorkOrder, service_request_id: getTable('work_orders')[0].service_request_id, technician_id: getTable('work_orders')[0].technician_id, status: 'PENDING' }]);
    await request(app).post(`/api/spare-parts/${p.id}/reserve`).set('Authorization', u.bearer).send({ work_order_id: firstWorkOrder, quantity: 3 }).expect(201);
    await request(app).post(`/api/spare-parts/${p.id}/reserve`).set('Authorization', u.bearer).send({ work_order_id: secondWorkOrder, quantity: 3 }).expect(201);
    expect(getTable('spare_parts')[0].quantity_reserved).toBe(6);
    expect(getTable('reservations')).toHaveLength(2);
  });

  it('reserve: two PARALLEL reserves of 3 → reserved=6 (transactional row lock serializes)', async () => {
    const u = seedUser('TECHNICIAN');
    const p = part({ quantity_available: 10, quantity_reserved: 0 });
    const workOrderId = seedReservationWorld(u, p);
    const fire = () =>
      request(app).post(`/api/spare-parts/${p.id}/reserve`).set('Authorization', u.bearer).send({ work_order_id: workOrderId, quantity: 3 });
    const results = await Promise.all([fire(), fire()]);
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(getTable('spare_parts')[0].quantity_reserved).toBe(6);
    expect(getTable('reservations')).toHaveLength(2);
  });

  it('reserve: rejects a part from a different site without changing stock', async () => {
    const u = seedUser('TECHNICIAN');
    const p = part({ site_id: randomUUID() });
    const workOrderId = seedReservationWorld(u, p);
    const requestRow = getTable('service_requests')[0];
    requestRow.site_id = SITE;
    await request(app)
      .post(`/api/spare-parts/${p.id}/reserve`)
      .set('Authorization', u.bearer)
      .send({ work_order_id: workOrderId, quantity: 1 })
      .expect(400);
    expect(getTable('spare_parts')[0].quantity_reserved).toBe(0);
    expect(getTable('reservations')).toHaveLength(0);
  });
});
