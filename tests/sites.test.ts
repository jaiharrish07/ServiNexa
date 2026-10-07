import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});

import sitesRouter from '../src/routes/sites.routes';
import { resetDb, seedTable, getTable } from './_mocks/supabase';
import { testApp, seedUser } from './_mocks/helpers';

const app = testApp((a) => a.use('/api/sites', sitesRouter));
beforeEach(() => resetDb());

const site = (over: Record<string, any> = {}) => ({
  id: randomUUID(),
  name: 'Plant',
  code: `SITE-${randomUUID().slice(0, 4)}`,
  is_active: true,
  created_at: new Date().toISOString(),
  ...over,
});

describe('sites', () => {
  it('401 without a token', async () => {
    await request(app).get('/api/sites').expect(401);
  });

  it('lists active sites with pagination meta', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('sites', [site({ name: 'Alpha' }), site({ name: 'Bravo' }), site({ name: 'Charlie' })]);
    const res = await request(app).get('/api/sites?limit=2&page=2').set('Authorization', u.bearer).expect(200);
    expect(res.body.sites).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 2, total: 3, total_pages: 2 });
  });

  it('searches by name/code via ?q=', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('sites', [site({ name: 'Detroit Plant' }), site({ name: 'Toledo Facility' })]);
    const res = await request(app).get('/api/sites?q=detroit').set('Authorization', u.bearer).expect(200);
    expect(res.body.sites).toHaveLength(1);
    expect(res.body.sites[0].name).toBe('Detroit Plant');
  });

  it('gets one site', async () => {
    const u = seedUser('ADMIN');
    const s = site();
    seedTable('sites', [s]);
    const res = await request(app).get(`/api/sites/${s.id}`).set('Authorization', u.bearer).expect(200);
    expect(res.body.site.id).toBe(s.id);
  });

  it('404 for unknown id', async () => {
    const u = seedUser('ADMIN');
    await request(app).get(`/api/sites/${randomUUID()}`).set('Authorization', u.bearer).expect(404);
  });

  it('400 for a non-uuid id', async () => {
    const u = seedUser('ADMIN');
    await request(app).get('/api/sites/not-a-uuid').set('Authorization', u.bearer).expect(400);
  });

  it('ADMIN can create a site (201 + persisted)', async () => {
    const u = seedUser('ADMIN');
    const res = await request(app)
      .post('/api/sites')
      .set('Authorization', u.bearer)
      .send({ name: 'New Plant', code: 'SITE-NEW' })
      .expect(201);
    expect(res.body.site.code).toBe('SITE-NEW');
    expect(getTable('sites')).toHaveLength(1);
  });

  it('CUSTOMER cannot create a site (403)', async () => {
    const u = seedUser('CUSTOMER');
    await request(app).post('/api/sites').set('Authorization', u.bearer).send({ name: 'X', code: 'Y' }).expect(403);
  });

  it('400 on invalid create body (missing name)', async () => {
    const u = seedUser('ADMIN');
    await request(app).post('/api/sites').set('Authorization', u.bearer).send({ code: 'NO-NAME' }).expect(400);
  });

  it('strips unknown fields on create (mass-assignment protection)', async () => {
    const u = seedUser('ADMIN');
    await request(app)
      .post('/api/sites')
      .set('Authorization', u.bearer)
      .send({ name: 'Z', code: 'SITE-Z', hacker_field: 'evil' })
      .expect(201);
    expect(getTable('sites')[0]).not.toHaveProperty('hacker_field');
  });

  it('ADMIN can patch a site', async () => {
    const u = seedUser('ADMIN');
    const s = site();
    seedTable('sites', [s]);
    const res = await request(app)
      .patch(`/api/sites/${s.id}`)
      .set('Authorization', u.bearer)
      .send({ city: 'Detroit' })
      .expect(200);
    expect(res.body.site.city).toBe('Detroit');
  });
});
