// Mock the DB + side-effect modules BEFORE importing the unit under test.
jest.mock('../src/config/supabase', () => require('./helpers/supabase-mock'));
jest.mock('../src/services/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue({ id: 'audit-1' }) }));
jest.mock('../src/services/notifications', () => ({ notifyStatusChange: jest.fn().mockResolvedValue(undefined) }));

import { transitionStatus } from '../src/services/workflow';
import { createAuditLog } from '../src/services/audit';
import { notifyStatusChange } from '../src/services/notifications';
import {
  setResponses,
  setRpc,
  resetMock,
  rpcCalls,
  updates,
} from './helpers/supabase-mock';

beforeEach(() => resetMock());

function mockSR(sr: any, updated?: any) {
  setResponses({
    'service_requests:select': { data: sr, error: null },
    'service_requests:update': { data: updated ?? { ...sr, status: 'CHANGED' }, error: null },
    'technicians:select': { data: { current_job_count: 1 }, error: null },
  });
}

describe('transitionStatus', () => {
  it('rejects an unknown target status without hitting the DB', async () => {
    const r = await transitionStatus('sr1', 'WAT', 'u1', 'ADMIN');
    expect(r.success).toBe(false);
    expect(r.code).toBe('INVALID_TRANSITION');
  });

  it('returns NOT_FOUND when the request does not exist', async () => {
    setResponses({ 'service_requests:select': { data: null, error: { message: 'no rows' } } });
    const r = await transitionStatus('sr1', 'SUBMITTED', 'u1', 'ADMIN');
    expect(r.success).toBe(false);
    expect(r.code).toBe('NOT_FOUND');
  });

  it('rejects an illegal transition (DRAFT->APPROVED)', async () => {
    mockSR({ id: 'sr1', status: 'DRAFT', priority: 'HIGH' });
    const r = await transitionStatus('sr1', 'APPROVED', 'u1', 'ADMIN');
    expect(r.success).toBe(false);
    expect(r.code).toBe('INVALID_TRANSITION');
    expect(updates.length).toBe(0); // never wrote
  });

  it('forbids a CUSTOMER from approving', async () => {
    mockSR({ id: 'sr1', status: 'PENDING_APPROVAL', priority: 'HIGH' });
    const r = await transitionStatus('sr1', 'APPROVED', 'u1', 'CUSTOMER');
    expect(r.success).toBe(false);
    expect(r.code).toBe('FORBIDDEN');
  });

  it('applies SUBMITTED and sets an SLA deadline', async () => {
    mockSR({ id: 'sr1', status: 'DRAFT', priority: 'CRITICAL' }, { id: 'sr1', status: 'SUBMITTED' });
    const r = await transitionStatus('sr1', 'SUBMITTED', 'u1', 'CUSTOMER');
    expect(r.success).toBe(true);
    const payload = updates[0].payload;
    expect(payload.status).toBe('SUBMITTED');
    expect(payload.sla_deadline).toBeDefined();
    expect(createAuditLog).toHaveBeenCalledTimes(1);
    expect(notifyStatusChange).toHaveBeenCalledTimes(1);
  });

  it('on APPROVED records approver + timestamp', async () => {
    mockSR({ id: 'sr1', status: 'PENDING_APPROVAL', priority: 'HIGH' }, { id: 'sr1', status: 'APPROVED' });
    const r = await transitionStatus('sr1', 'APPROVED', 'ops1', 'OPS_MANAGER');
    expect(r.success).toBe(true);
    expect(updates[0].payload.approved_by).toBe('ops1');
    expect(updates[0].payload.approved_at).toBeDefined();
  });

  it('on ASSIGNED calls the atomic increment RPC and sets technician', async () => {
    mockSR({ id: 'sr1', status: 'APPROVED', priority: 'HIGH' }, { id: 'sr1', status: 'ASSIGNED' });
    setRpc({ error: null });
    const r = await transitionStatus('sr1', 'ASSIGNED', 'ops1', 'OPS_MANAGER', {
      technician_id: 'tech1',
    });
    expect(r.success).toBe(true);
    expect(updates[0].payload.assigned_technician_id).toBe('tech1');
    expect(rpcCalls.find((c) => c.fn === 'increment_job_count')).toBeTruthy();
  });

  it('on COMPLETED decrements the technician job count', async () => {
    mockSR(
      { id: 'sr1', status: 'IN_PROGRESS', priority: 'HIGH', assigned_technician_id: 'tech1' },
      { id: 'sr1', status: 'COMPLETED' }
    );
    setRpc({ error: null });
    const r = await transitionStatus('sr1', 'COMPLETED', 'tech1', 'TECHNICIAN', {
      resolution_notes: 'fixed',
    });
    expect(r.success).toBe(true);
    expect(updates[0].payload.resolution_notes).toBe('fixed');
    expect(rpcCalls.find((c) => c.fn === 'decrement_job_count')).toBeTruthy();
  });

  it('still succeeds when the audit log throws (non-fatal)', async () => {
    (createAuditLog as jest.Mock).mockRejectedValueOnce(new Error('audit down'));
    mockSR({ id: 'sr1', status: 'DRAFT', priority: 'LOW' }, { id: 'sr1', status: 'SUBMITTED' });
    const r = await transitionStatus('sr1', 'SUBMITTED', 'u1', 'CUSTOMER');
    expect(r.success).toBe(true);
  });
});
