import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});

import techRouter from '../src/routes/technicians.routes';
import { resetDb, seedTable, getTable } from './_mocks/supabase';
import { testApp, seedUser } from './_mocks/helpers';

const app = testApp((a) => a.use('/api/technicians', techRouter));
beforeEach(() => resetDb());

const SITE = randomUUID();
const tech = (over: Record<string, any> = {}) => ({
  id: randomUUID(),
  user_id: randomUUID(),
  site_id: SITE,
  employee_code: `T-${randomUUID().slice(0, 4)}`,
  is_available: true,
  rating: 4.5,
  created_at: new Date().toISOString(),
  ...over,
});

describe('technicians', () => {
  it('401 without a token', async () => {
    await request(app).get('/api/technicians').expect(401);
  });

  it('lists with pagination meta', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('technicians', [tech(), tech(), tech()]);
    const res = await request(app).get('/api/technicians?limit=2&page=1').set('Authorization', u.bearer).expect(200);
    expect(res.body.technicians).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);
  });

  it('filters by available=true', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('technicians', [
      tech({ is_available: true, current_job_count: 1, max_concurrent_jobs: 3 }),
      tech({ is_available: true, current_job_count: 4, max_concurrent_jobs: 3 }),
      tech({ is_available: false }),
    ]);
    const res = await request(app).get('/api/technicians?available=true').set('Authorization', u.bearer).expect(200);
    expect(res.body.technicians).toHaveLength(1);
  });

  it('404 for unknown id', async () => {
    const u = seedUser('ADMIN');
    await request(app).get(`/api/technicians/${randomUUID()}`).set('Authorization', u.bearer).expect(404);
  });

  it('ADMIN can create (201)', async () => {
    const u = seedUser('ADMIN');
    const res = await request(app)
      .post('/api/technicians')
      .set('Authorization', u.bearer)
      .send({ user_id: randomUUID(), site_id: SITE, employee_code: 'T-999', specializations: ['hydraulic'] })
      .expect(201);
    expect(res.body.technician.employee_code).toBe('T-999');
    expect(getTable('technicians')).toHaveLength(1);
  });

  it('OPS_MANAGER cannot create (403, ADMIN-only)', async () => {
    const u = seedUser('OPS_MANAGER');
    await request(app)
      .post('/api/technicians')
      .set('Authorization', u.bearer)
      .send({ user_id: randomUUID(), site_id: SITE, employee_code: 'T-NO' })
      .expect(403);
  });

  it('400 on missing required field', async () => {
    const u = seedUser('ADMIN');
    await request(app)
      .post('/api/technicians')
      .set('Authorization', u.bearer)
      .send({ site_id: SITE, employee_code: 'T-X' })
      .expect(400);
  });

  it('OPS_MANAGER can patch (e.g. availability)', async () => {
    const u = seedUser('OPS_MANAGER');
    const t = tech();
    seedTable('technicians', [t]);
    const res = await request(app)
      .patch(`/api/technicians/${t.id}`)
      .set('Authorization', u.bearer)
      .send({ is_available: false })
      .expect(200);
    expect(res.body.technician.is_available).toBe(false);
  });
});
