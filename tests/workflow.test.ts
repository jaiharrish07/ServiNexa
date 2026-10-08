import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});

import {
  transitionStatus,
  isTransitionAllowed,
  canRoleTransition,
  slaHoursFor,
  ALL_STATUSES,
} from '../src/services/workflow';
import { resetDb, seedTable, getTable } from './_mocks/supabase';

beforeEach(() => resetDb());

const srRow = (over: Record<string, any> = {}) => ({
  id: 'sr1',
  request_number: 'SR-20240101-001',
  site_id: 'siteA',
  requester_id: 'req1',
  title: 'Leak',
  description: 'Hydraulic leak',
  status: 'DRAFT',
  priority: 'MEDIUM',
  created_at: new Date().toISOString(),
  ...over,
});

describe('workflow pure helpers', () => {
  it('allows the canonical happy path', () => {
    const path: [string, string][] = [
      ['DRAFT', 'SUBMITTED'], ['SUBMITTED', 'VALIDATING'], ['VALIDATING', 'PENDING_APPROVAL'],
      ['PENDING_APPROVAL', 'APPROVED'], ['APPROVED', 'ASSIGNED'], ['ASSIGNED', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'COMPLETED'], ['COMPLETED', 'VERIFIED'], ['VERIFIED', 'CLOSED'],
    ];
    for (const [f, t] of path) expect(isTransitionAllowed(f, t)).toBe(true);
  });
  it('rejects illegal jumps and terminal exits', () => {
    expect(isTransitionAllowed('DRAFT', 'APPROVED')).toBe(false);
    expect(isTransitionAllowed('CLOSED', 'DRAFT')).toBe(false);
  });
  it('enforces role rules', () => {
    expect(canRoleTransition('DRAFT', 'SUBMITTED', 'CUSTOMER')).toBe(true);
    expect(canRoleTransition('PENDING_APPROVAL', 'APPROVED', 'CUSTOMER')).toBe(false);
    expect(canRoleTransition('EXCEPTION', 'CLOSED', 'OPS_MANAGER')).toBe(false);
    expect(canRoleTransition('EXCEPTION', 'CLOSED', 'ADMIN')).toBe(true);
    expect(canRoleTransition('DRAFT', 'SUBMITTED', 'INTRUDER')).toBe(false);
  });
  it('maps SLA windows and lists all statuses incl. bidding', () => {
    expect(slaHoursFor('CRITICAL')).toBe(4);
    expect(slaHoursFor('LOW')).toBe(72);
    expect(slaHoursFor('???')).toBeUndefined();
    expect(ALL_STATUSES).toHaveLength(14);
    expect(ALL_STATUSES).toContain('BIDDING');
    expect(ALL_STATUSES).toContain('BID_REVIEW');
    expect(ALL_STATUSES).toContain('BID_ACCEPTED');
  });

  it('supports the bidding detour (APPROVED→BIDDING→BID_REVIEW→BID_ACCEPTED→ASSIGNED)', () => {
    expect(isTransitionAllowed('APPROVED', 'BIDDING')).toBe(true);
    expect(isTransitionAllowed('APPROVED', 'ASSIGNED')).toBe(true); // direct-assign fallback kept
    expect(isTransitionAllowed('BIDDING', 'BID_REVIEW')).toBe(true);
    expect(isTransitionAllowed('BID_REVIEW', 'BID_ACCEPTED')).toBe(true);
    expect(isTransitionAllowed('BID_ACCEPTED', 'ASSIGNED')).toBe(true);
    expect(canRoleTransition('APPROVED', 'BIDDING', 'TECHNICIAN')).toBe(false);
    expect(canRoleTransition('BID_REVIEW', 'BID_ACCEPTED', 'OPS_MANAGER')).toBe(true);
  });
});

describe('transitionStatus (against in-memory DB)', () => {
  it('rejects an unknown target status', async () => {
    const r = await transitionStatus('sr1', 'WAT', 'u1', 'ADMIN');
    expect(r.success).toBe(false);
    expect(r.code).toBe('INVALID_TRANSITION');
  });

  it('returns NOT_FOUND when the request is missing', async () => {
    const r = await transitionStatus('nope', 'SUBMITTED', 'u1', 'ADMIN');
    expect(r.code).toBe('NOT_FOUND');
  });

  it('rejects an illegal transition and does not mutate the row', async () => {
    seedTable('service_requests', [srRow({ status: 'DRAFT' })]);
    const r = await transitionStatus('sr1', 'APPROVED', 'u1', 'ADMIN');
    expect(r.code).toBe('INVALID_TRANSITION');
    expect(getTable('service_requests')[0].status).toBe('DRAFT');
  });

  it('forbids a CUSTOMER from approving', async () => {
    seedTable('service_requests', [srRow({ status: 'PENDING_APPROVAL' })]);
    const r = await transitionStatus('sr1', 'APPROVED', 'u1', 'CUSTOMER');
    expect(r.code).toBe('FORBIDDEN');
  });

  it('SUBMITTED sets an SLA deadline and writes an audit row', async () => {
    seedTable('service_requests', [srRow({ status: 'DRAFT', priority: 'CRITICAL' })]);
    const r = await transitionStatus('sr1', 'SUBMITTED', 'req1', 'CUSTOMER');
    expect(r.success).toBe(true);
    const row = getTable('service_requests')[0];
    expect(row.status).toBe('SUBMITTED');
    expect(row.sla_deadline).toBeTruthy();
    expect(getTable('audit_logs').length).toBe(1);
  });

  it('APPROVED stamps approver + time', async () => {
    seedTable('service_requests', [srRow({ status: 'PENDING_APPROVAL', priority: 'HIGH' })]);
    const r = await transitionStatus('sr1', 'APPROVED', 'ops1', 'OPS_MANAGER');
    expect(r.success).toBe(true);
    const row = getTable('service_requests')[0];
    expect(row.approved_by).toBe('ops1');
    expect(row.approved_at).toBeTruthy();
  });

  it('ASSIGNED increments the technician job count via RPC', async () => {
    seedTable('technicians', [{ id: 'tech1', current_job_count: 1, max_concurrent_jobs: 3, is_available: true, user_id: 'tu1' }]);
    seedTable('service_requests', [srRow({ status: 'APPROVED', priority: 'HIGH' })]);
    const r = await transitionStatus('sr1', 'ASSIGNED', 'ops1', 'OPS_MANAGER', { technician_id: 'tech1' });
    expect(r.success).toBe(true);
    expect(getTable('service_requests')[0].assigned_technician_id).toBe('tech1');
    expect(getTable('technicians')[0].current_job_count).toBe(2);
  });

  it('does not assign a technician who is at capacity', async () => {
    seedTable('technicians', [{ id: 'tech1', current_job_count: 3, max_concurrent_jobs: 3, is_available: true, user_id: 'tu1' }]);
    seedTable('service_requests', [srRow({ status: 'APPROVED', priority: 'HIGH' })]);
    const r = await transitionStatus('sr1', 'ASSIGNED', 'ops1', 'OPS_MANAGER', { technician_id: 'tech1' });
    expect(r.success).toBe(false);
    expect(r.code).toBe('CONFLICT');
    expect(getTable('service_requests')[0].status).toBe('APPROVED');
    expect(getTable('technicians')[0].current_job_count).toBe(3);
  });

  it('COMPLETED decrements the technician and records notes', async () => {
    seedTable('technicians', [{ id: 'tech1', current_job_count: 2, user_id: 'tu1' }]);
    seedTable('service_requests', [srRow({ status: 'IN_PROGRESS', priority: 'HIGH', assigned_technician_id: 'tech1' })]);
    const r = await transitionStatus('sr1', 'COMPLETED', 'tu1', 'TECHNICIAN', { resolution_notes: 'fixed' });
    expect(r.success).toBe(true);
    expect(getTable('service_requests')[0].resolution_notes).toBe('fixed');
    expect(getTable('technicians')[0].current_job_count).toBe(1);
  });

  it('reopening a completed request restores the active job count', async () => {
    seedTable('technicians', [{ id: 'tech1', current_job_count: 1, user_id: 'tu1' }]);
    seedTable('service_requests', [srRow({ status: 'COMPLETED', priority: 'HIGH', assigned_technician_id: 'tech1' })]);
    const r = await transitionStatus('sr1', 'IN_PROGRESS', 'ops1', 'OPS_MANAGER');
    expect(r.success).toBe(true);
    expect(getTable('technicians')[0].current_job_count).toBe(2);
  });

  it('closing an exception releases the active job count', async () => {
    seedTable('technicians', [{ id: 'tech1', current_job_count: 2, user_id: 'tu1' }]);
    seedTable('service_requests', [srRow({ status: 'EXCEPTION', priority: 'HIGH', assigned_technician_id: 'tech1' })]);
    const r = await transitionStatus('sr1', 'CLOSED', 'ops1', 'ADMIN');
    expect(r.success).toBe(true);
    expect(getTable('technicians')[0].current_job_count).toBe(1);
  });

  it('builds a growing audit chain across multiple transitions', async () => {
    seedTable('service_requests', [srRow({ status: 'DRAFT', priority: 'LOW' })]);
    await transitionStatus('sr1', 'SUBMITTED', 'req1', 'CUSTOMER');
    await transitionStatus('sr1', 'VALIDATING', 'ops1', 'OPS_MANAGER');
    expect(getTable('audit_logs').length).toBe(2);
  });
});
