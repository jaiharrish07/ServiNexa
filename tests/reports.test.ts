import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});

import reportsRouter from '../src/routes/reports.routes';
import { resetDb, seedTable } from './_mocks/supabase';
import { testApp, seedUser } from './_mocks/helpers';

const app = testApp((a) => a.use('/api/reports', reportsRouter));
beforeEach(() => resetDb());

const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe('reports auth', () => {
  it('401 without a token on dashboard', async () => {
    await request(app).get('/api/reports/dashboard').expect(401);
  });
  it('CUSTOMER is forbidden from privileged reports (403)', async () => {
    const u = seedUser('CUSTOMER');
    for (const r of ['sla', 'mttr', 'utilization', 'parts-rebalance']) {
      await request(app).get(`/api/reports/${r}`).set('Authorization', u.bearer).expect(403);
    }
  });
});

describe('dashboard', () => {
  it('aggregates SR status, machines, technicians, exceptions', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('service_requests', [
      { id: randomUUID(), status: 'SUBMITTED' },
      { id: randomUUID(), status: 'IN_PROGRESS' },
      { id: randomUUID(), status: 'CLOSED' },
    ]);
    seedTable('machines', [
      { id: randomUUID(), status: 'OPERATIONAL' },
      { id: randomUUID(), status: 'DOWN' },
    ]);
    seedTable('technicians', [
      { id: randomUUID(), is_available: true, current_job_count: 1 },
      { id: randomUUID(), is_available: false, current_job_count: 3 },
    ]);
    seedTable('exception_flags', [
      { id: randomUUID(), status: 'OPEN', type: 'SLA_BREACH', severity: 'CRITICAL' },
      { id: randomUUID(), status: 'OPEN', type: 'TECH_DROPOUT', severity: 'MEDIUM' },
    ]);
    const res = await request(app).get('/api/reports/dashboard').set('Authorization', u.bearer).expect(200);
    const d = res.body.dashboard;
    expect(d.service_requests.total).toBe(3);
    expect(d.service_requests.active).toBe(2); // SUBMITTED + IN_PROGRESS
    expect(d.machines.by_status).toMatchObject({ OPERATIONAL: 1, DOWN: 1 });
    expect(d.technicians.available).toBe(1);
    expect(d.technicians.avg_load).toBe(2); // (1 + 3) / 2
    expect(d.exceptions.open).toBe(2);
    expect(d.exceptions.critical).toBe(1);
  });
});

describe('SLA report', () => {
  it('classifies MET / BREACHED / AT_RISK / ON_TRACK and computes compliance', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('service_requests', [
      { id: randomUUID(), request_number: 'SR-MET', priority: 'HIGH', status: 'COMPLETED', sla_deadline: iso(-1 * HOUR), completed_at: iso(-2 * HOUR) },
      { id: randomUUID(), request_number: 'SR-BRCH', priority: 'HIGH', status: 'COMPLETED', sla_deadline: iso(-2 * HOUR), completed_at: iso(-1 * HOUR) },
      { id: randomUUID(), request_number: 'SR-RISK', priority: 'HIGH', status: 'ASSIGNED', sla_deadline: iso(1 * HOUR) },
      { id: randomUUID(), request_number: 'SR-OK', priority: 'HIGH', status: 'ASSIGNED', sla_deadline: iso(10 * HOUR) },
      { id: randomUUID(), request_number: 'SR-NONE', priority: 'LOW', status: 'DRAFT', sla_deadline: null },
    ]);
    const res = await request(app).get('/api/reports/sla').set('Authorization', u.bearer).expect(200);
    const r = res.body.sla_report;
    expect(r.total).toBe(4); // the null-deadline one is excluded
    expect(r.met).toBe(2); // MET + ON_TRACK
    expect(r.breached).toBe(1);
    expect(r.at_risk).toBe(1);
    expect(r.compliance_rate).toBe(50);
  });
});

describe('MTTR report', () => {
  it('computes mean time to resolve', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('service_requests', [
      { id: randomUUID(), request_number: 'SR-A', priority: 'HIGH', category: 'HYDRAULIC', created_at: iso(-4 * HOUR), completed_at: iso(-2 * HOUR) }, // 2h
      { id: randomUUID(), request_number: 'SR-B', priority: 'CRITICAL', category: 'ELECTRICAL', created_at: iso(-8 * HOUR), completed_at: iso(-4 * HOUR) }, // 4h
      { id: randomUUID(), request_number: 'SR-OPEN', priority: 'LOW', created_at: iso(-1 * HOUR), completed_at: null },
    ]);
    const res = await request(app).get('/api/reports/mttr').set('Authorization', u.bearer).expect(200);
    const r = res.body.mttr_report;
    expect(r.total_resolved).toBe(2);
    expect(r.mttr_hours).toBe(3);
    expect(r.by_priority.HIGH).toMatchObject({ count: 1, mttr_hours: 2 });
    expect(r.by_priority.CRITICAL).toMatchObject({ count: 1, mttr_hours: 4 });
    expect(r.fastest.hours).toBe(2);
    expect(r.slowest.hours).toBe(4);
  });
});

describe('utilization report', () => {
  it('computes per-technician utilization + summary', async () => {
    const u = seedUser('ADMIN');
    seedTable('technicians', [
      { id: randomUUID(), employee_code: 'T-50', current_job_count: 2, max_concurrent_jobs: 4, is_available: true, users: { full_name: 'Half' } },
      { id: randomUUID(), employee_code: 'T-100', current_job_count: 4, max_concurrent_jobs: 4, is_available: false, users: { full_name: 'Full' } },
      { id: randomUUID(), employee_code: 'T-0', current_job_count: 0, max_concurrent_jobs: 3, is_available: true, users: { full_name: 'Idle' } },
    ]);
    const res = await request(app).get('/api/reports/utilization').set('Authorization', u.bearer).expect(200);
    const r = res.body.utilization_report;
    expect(r.technicians[0].utilization_pct).toBe(100); // sorted desc
    expect(r.technicians.find((t: any) => t.employee_code === 'T-50').utilization_pct).toBe(50);
    expect(r.summary).toMatchObject({ total: 3, overloaded: 1, idle: 1 });
  });
});

describe('parts rebalance', () => {
  it('suggests a transfer from a surplus site to a deficit site', async () => {
    const u = seedUser('OPS_MANAGER');
    seedTable('spare_parts', [
      { id: randomUUID(), part_number: 'HS-100', name: 'Seal Kit', quantity_available: 15, quantity_reserved: 0, reorder_level: 5, site_id: 'a', sites: { code: 'SITE-A' } },
      { id: randomUUID(), part_number: 'HS-100', name: 'Seal Kit', quantity_available: 3, quantity_reserved: 0, reorder_level: 5, site_id: 'b', sites: { code: 'SITE-B' } },
    ]);
    const res = await request(app).get('/api/reports/parts-rebalance').set('Authorization', u.bearer).expect(200);
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0]).toMatchObject({ part_number: 'HS-100', from_site: 'SITE-A', to_site: 'SITE-B', suggested_quantity: 2 });
  });
});
