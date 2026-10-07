jest.mock('../src/config/supabase', () => require('./helpers/supabase-mock'));

import crypto from 'crypto';
import { createAuditLog, verifyAuditChain } from '../src/services/audit';
import { setResponses, resetMock, inserts } from './helpers/supabase-mock';

beforeEach(() => resetMock());

// Replica of audit.ts's private canonicalPayload — must match byte-for-byte.
function canonical(e: any, prevHash: string): string {
  return JSON.stringify({
    entity_type: e.entity_type,
    entity_id: e.entity_id,
    action: e.action,
    field_changed: e.field_changed || null,
    old_value: e.old_value || null,
    new_value: e.new_value || null,
    performed_by: e.performed_by,
    metadata: e.metadata || {},
    prev_hash: prevHash,
  });
}
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function row(partial: any, prevHash: string) {
  const base = {
    entity_type: 'service_request',
    entity_id: 'sr1',
    action: 'STATUS_CHANGE',
    field_changed: 'status',
    old_value: 'DRAFT',
    new_value: 'SUBMITTED',
    performed_by: 'u1',
    metadata: {},
    created_at: new Date().toISOString(),
    ...partial,
    prev_hash: prevHash,
  };
  return { ...base, hash: sha(canonical(base, prevHash)) };
}

describe('createAuditLog', () => {
  it('chains onto GENESIS when the table is empty', async () => {
    setResponses({
      'audit_logs:select': { data: null, error: null },
      'audit_logs:insert': { data: { id: 'a1' }, error: null },
    });
    const entry = {
      entity_type: 'service_request',
      entity_id: 'sr1',
      action: 'CREATE',
      performed_by: 'u1',
    };
    await createAuditLog(entry);
    expect(inserts[0].payload.prev_hash).toBe('GENESIS');
    expect(inserts[0].payload.hash).toBe(sha(canonical(entry, 'GENESIS')));
  });

  it('links onto the previous hash', async () => {
    setResponses({
      'audit_logs:select': { data: { hash: 'PREVHASH' }, error: null },
      'audit_logs:insert': { data: { id: 'a2' }, error: null },
    });
    const entry = {
      entity_type: 'service_request',
      entity_id: 'sr1',
      action: 'STATUS_CHANGE',
      performed_by: 'u1',
    };
    await createAuditLog(entry);
    expect(inserts[0].payload.prev_hash).toBe('PREVHASH');
    expect(inserts[0].payload.hash).toBe(sha(canonical(entry, 'PREVHASH')));
  });

  it('never throws — returns null on DB error', async () => {
    setResponses({ 'audit_logs:select': { data: null, error: { message: 'boom' } } });
    await expect(createAuditLog({ entity_type: 'x', entity_id: 'y', action: 'Z', performed_by: 'u' })).resolves.toBeNull();
  });
});

describe('verifyAuditChain', () => {
  it('returns valid for an empty chain', async () => {
    setResponses({ 'audit_logs:select': { data: [], error: null } });
    const r = await verifyAuditChain();
    expect(r.valid).toBe(true);
    expect(r.total_checked).toBe(0);
  });

  it('validates an intact 3-entry chain', async () => {
    const e1 = row({ id: 'e1', action: 'CREATE' }, 'GENESIS');
    const e2 = row({ id: 'e2' }, e1.hash);
    const e3 = row({ id: 'e3', new_value: 'VALIDATING' }, e2.hash);
    setResponses({ 'audit_logs:select': { data: [e1, e2, e3], error: null } });
    const r = await verifyAuditChain();
    expect(r.valid).toBe(true);
    expect(r.total_checked).toBe(3);
  });

  it('detects content tampering (hash no longer matches the row)', async () => {
    const e1 = row({ id: 'e1', action: 'CREATE' }, 'GENESIS');
    const e2 = row({ id: 'e2' }, e1.hash);
    // Tamper e2's content but keep its original hash.
    const tampered = { ...e2, new_value: 'HACKED' };
    setResponses({ 'audit_logs:select': { data: [e1, tampered], error: null } });
    const r = await verifyAuditChain();
    expect(r.valid).toBe(false);
    expect(r.broken_at).toBe('e2');
    expect(r.reason).toMatch(/content hash mismatch/);
  });

  it('detects a broken link (prev_hash does not match predecessor)', async () => {
    const e1 = row({ id: 'e1', action: 'CREATE' }, 'GENESIS');
    // e2 is internally consistent but points at the wrong previous hash.
    const e2 = row({ id: 'e2' }, 'WRONG_PREV');
    setResponses({ 'audit_logs:select': { data: [e1, e2], error: null } });
    const r = await verifyAuditChain();
    expect(r.valid).toBe(false);
    expect(r.broken_at).toBe('e2');
    expect(r.reason).toMatch(/broken hash link/);
  });

  it('does not assert GENESIS when filtered by entity', async () => {
    // First filtered row legitimately links to an earlier global entry.
    const e1 = row({ id: 'e1' }, 'SOME_EARLIER_HASH');
    const e2 = row({ id: 'e2' }, e1.hash);
    setResponses({ 'audit_logs:select': { data: [e1, e2], error: null } });
    const r = await verifyAuditChain('service_request', 'sr1');
    expect(r.valid).toBe(true);
  });
});
