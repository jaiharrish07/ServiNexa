import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});

import notifRouter from '../src/routes/notifications.routes';
import { resetDb, seedTable, getTable, mockSupabase } from './_mocks/supabase';
import { testApp, seedUser } from './_mocks/helpers';
import { createNotification, notifyStatusChange, notifyRequestCreated } from '../src/services/notifications';

const app = testApp((a) => a.use('/api/notifications', notifRouter));
beforeEach(() => resetDb());

const note = (user_id: string, over: Record<string, any> = {}) => ({
  id: randomUUID(),
  user_id,
  title: 'T',
  message: 'M',
  type: 'INFO',
  is_read: false,
  created_at: new Date().toISOString(),
  ...over,
});

describe('notifications routes', () => {
  it('401 without a token', async () => {
    await request(app).get('/api/notifications').expect(401);
  });

  it('only returns the caller’s own notifications', async () => {
    const me = seedUser('CUSTOMER');
    const other = randomUUID();
    seedTable('notifications', [note(me.id), note(me.id), note(other)]);
    const res = await request(app).get('/api/notifications').set('Authorization', me.bearer).expect(200);
    expect(res.body.notifications).toHaveLength(2);
    expect(res.body.notifications.every((n: any) => n.user_id === me.id)).toBe(true);
  });

  it('unread-count counts only unread for the caller', async () => {
    const me = seedUser('CUSTOMER');
    seedTable('notifications', [note(me.id, { is_read: false }), note(me.id, { is_read: true }), note(me.id, { is_read: false })]);
    const res = await request(app).get('/api/notifications/unread-count').set('Authorization', me.bearer).expect(200);
    expect(res.body.unread_count).toBe(2);
  });

  it('read-all flips only the caller’s unread notifications', async () => {
    const me = seedUser('CUSTOMER');
    const other = randomUUID();
    seedTable('notifications', [note(me.id), note(me.id), note(other)]);
    await request(app).patch('/api/notifications/read-all').set('Authorization', me.bearer).expect(200);
    const rows = getTable('notifications');
    expect(rows.filter((n) => n.user_id === me.id).every((n) => n.is_read)).toBe(true);
    expect(rows.find((n) => n.user_id === other)!.is_read).toBe(false);
  });

  it('cannot mark another user’s notification read (404)', async () => {
    const me = seedUser('CUSTOMER');
    const foreign = note(randomUUID());
    seedTable('notifications', [foreign]);
    await request(app).patch(`/api/notifications/${foreign.id}/read`).set('Authorization', me.bearer).expect(404);
  });

  it('marks own notification read', async () => {
    const me = seedUser('CUSTOMER');
    const mine = note(me.id);
    seedTable('notifications', [mine]);
    const res = await request(app).patch(`/api/notifications/${mine.id}/read`).set('Authorization', me.bearer).expect(200);
    expect(res.body.notification.is_read).toBe(true);
  });
});

describe('notifications service', () => {
  it('notifyStatusChange ASSIGNED notifies requester + assigned technician', async () => {
    const requesterId = randomUUID();
    const techUserId = randomUUID();
    const techId = randomUUID();
    seedTable('technicians', [{ id: techId, user_id: techUserId }]);
    await notifyStatusChange(
      { id: randomUUID(), request_number: 'SR-1', title: 'Leak', requester_id: requesterId, assigned_technician_id: techId, priority: 'CRITICAL' },
      'APPROVED',
      'ASSIGNED',
    );
    const rows = getTable('notifications');
    expect(rows.find((n) => n.user_id === requesterId)).toBeTruthy();
    const techNote = rows.find((n) => n.user_id === techUserId);
    expect(techNote).toBeTruthy();
    expect(techNote!.type).toBe('CRITICAL');
  });

  it('notifyStatusChange EXCEPTION notifies all ops managers + admins', async () => {
    const ops = randomUUID();
    const admin = randomUUID();
    seedTable('users', [
      { id: ops, role: 'OPS_MANAGER', email: 'o@x', full_name: 'O' },
      { id: admin, role: 'ADMIN', email: 'a@x', full_name: 'A' },
      { id: randomUUID(), role: 'CUSTOMER', email: 'c@x', full_name: 'C' },
    ]);
    await notifyStatusChange({ id: randomUUID(), request_number: 'SR-2' }, 'IN_PROGRESS', 'EXCEPTION');
    const rows = getTable('notifications');
    expect(rows.map((n) => n.user_id).sort()).toEqual([ops, admin].sort());
    expect(rows.every((n) => n.type === 'WARNING')).toBe(true);
  });

  it('notifyRequestCreated notifies ops + admins only', async () => {
    const ops = randomUUID();
    seedTable('users', [
      { id: ops, role: 'OPS_MANAGER', email: 'o@x', full_name: 'O' },
      { id: randomUUID(), role: 'CUSTOMER', email: 'c@x', full_name: 'C' },
    ]);
    await notifyRequestCreated({ id: randomUUID(), request_number: 'SR-3', title: 'New' });
    const rows = getTable('notifications');
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(ops);
  });

  it('createNotification returns null (never throws) when the insert errors', async () => {
    vi.spyOn(mockSupabase, 'from').mockReturnValueOnce({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'boom' } }) }) }),
    } as any);
    const r = await createNotification({ user_id: randomUUID(), title: 't', message: 'm' });
    expect(r).toBeNull();
  });
});
