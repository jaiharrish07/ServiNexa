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
    seedTable('spare_parts', [p]);
    const res = await request(app)
      .post(`/api/spare-parts/${p.id}/reserve`)
      .set('Authorization', u.bearer)
      .send({ work_order_id: randomUUID(), quantity: 4 })
      .expect(201);
    expect(res.body.reservation.quantity).toBe(4);
    expect(getTable('spare_parts')[0].quantity_reserved).toBe(4);
    expect(getTable('reservations')).toHaveLength(1);
  });

  it('reserve: insufficient stock → 400, nothing changes', async () => {
    const u = seedUser('TECHNICIAN');
    const p = part({ quantity_available: 5, quantity_reserved: 3 }); // only 2 available
    seedTable('spare_parts', [p]);
    await request(app)
      .post(`/api/spare-parts/${p.id}/reserve`)
      .set('Authorization', u.bearer)
      .send({ work_order_id: randomUUID(), quantity: 3 })
      .expect(400);
    expect(getTable('spare_parts')[0].quantity_reserved).toBe(3);
    expect(getTable('reservations')).toHaveLength(0);
  });

  it('reserve: two SEQUENTIAL reserves of 3 → reserved=6, 2 reservations (no lost update)', async () => {
    const u = seedUser('TECHNICIAN');
    const p = part({ quantity_available: 10, quantity_reserved: 0 });
    seedTable('spare_parts', [p]);
    await request(app).post(`/api/spare-parts/${p.id}/reserve`).set('Authorization', u.bearer).send({ work_order_id: randomUUID(), quantity: 3 }).expect(201);
    await request(app).post(`/api/spare-parts/${p.id}/reserve`).set('Authorization', u.bearer).send({ work_order_id: randomUUID(), quantity: 3 }).expect(201);
    expect(getTable('spare_parts')[0].quantity_reserved).toBe(6);
    expect(getTable('reservations')).toHaveLength(2);
  });

  it('reserve: two PARALLEL reserves of 3 → reserved=6 (optimistic retry converges)', async () => {
    const u = seedUser('TECHNICIAN');
    const p = part({ quantity_available: 10, quantity_reserved: 0 });
    seedTable('spare_parts', [p]);
    const fire = () =>
      request(app).post(`/api/spare-parts/${p.id}/reserve`).set('Authorization', u.bearer).send({ work_order_id: randomUUID(), quantity: 3 });
    const results = await Promise.all([fire(), fire()]);
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(getTable('spare_parts')[0].quantity_reserved).toBe(6);
    expect(getTable('reservations')).toHaveLength(2);
  });
});
