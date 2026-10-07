import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});

import authRouter from '../src/routes/auth.routes';
import { resetDb, getTable } from './_mocks/supabase';
import { testApp, seedUser } from './_mocks/helpers';

const app = testApp((a) => a.use('/api/auth', authRouter));
beforeEach(() => resetDb());

describe('auth', () => {
  it('signs up a user (201 + profile row persisted)', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'new@dqbh.com', password: 'password123', full_name: 'New User', role: 'CUSTOMER' })
      .expect(201);
    expect(res.body.user.email).toBe('new@dqbh.com');
    expect(getTable('users')).toHaveLength(1);
  });

  it('rejects a short password with 400', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: 'x@dqbh.com', password: 'short', full_name: 'X' })
      .expect(400);
  });

  it('rejects duplicate email with 400', async () => {
    const body = { email: 'dup@dqbh.com', password: 'password123', full_name: 'Dup' };
    await request(app).post('/api/auth/signup').send(body).expect(201);
    await request(app).post('/api/auth/signup').send(body).expect(400);
  });

  it('logs in and returns a token + user', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: 'log@dqbh.com', password: 'password123', full_name: 'Log' })
      .expect(201);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'log@dqbh.com', password: 'password123' })
      .expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('log@dqbh.com');
  });

  it('rejects a bad password with 401', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: 'bad@dqbh.com', password: 'password123', full_name: 'Bad' })
      .expect(201);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'bad@dqbh.com', password: 'wrongpass' })
      .expect(401);
  });

  it('GET /me requires a token', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('GET /me returns the authenticated profile', async () => {
    const admin = seedUser('ADMIN', { email: 'me@dqbh.com' });
    const res = await request(app).get('/api/auth/me').set('Authorization', admin.bearer).expect(200);
    expect(res.body.user.email).toBe('me@dqbh.com');
    expect(res.body.user.role).toBe('ADMIN');
  });
});
