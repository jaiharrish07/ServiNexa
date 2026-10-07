import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';

vi.mock('../src/config/supabase', async () => {
  const mock = await import('./_mocks/supabase');
  return { supabase: mock.mockSupabase, supabaseAnonUrl: 'http://x', supabaseAnonKey: 'anon' };
});

import { createAuditLog, verifyAuditChain } from '../src/services/audit';
import { resetDb, seedTable, getTable } from './_mocks/supabase';

beforeEach(() => resetDb());

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

let t = 0;
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
    created_at: `2024-01-01T00:00:${String(++t).padStart(2, '0')}.000Z`,
    ...partial,
    prev_hash: prevHash,
  };
  return { ...base, hash: sha(canonical(base, prevHash)) };
}

describe('createAuditLog', () => {
  it('chains onto GENESIS when the table is empty', async () => {
    const entry = { entity_type: 'service_request', entity_id: 'sr1', action: 'CREATE', performed_by: 'u1' };
    await createAuditLog(entry);
    const inserted = getTable('audit_logs')[0];
    expect(inserted.prev_hash).toBe('GENESIS');
    expect(inserted.hash).toBe(sha(canonical(entry, 'GENESIS')));
  });

  it('links onto the previous entry hash', async () => {
    seedTable('audit_logs', [row({ id: 'e1', action: 'CREATE' }, 'GENESIS')]);
    const prev = getTable('audit_logs')[0];
    const entry = { entity_type: 'service_request', entity_id: 'sr1', action: 'STATUS_CHANGE', performed_by: 'u1' };
    await createAuditLog(entry);
    const e2 = getTable('audit_logs').find((r) => r.action === 'STATUS_CHANGE' && r.hash !== prev.hash);
    expect(e2!.prev_hash).toBe(prev.hash);
    expect(e2!.hash).toBe(sha(canonical(entry, prev.hash)));
  });
});

describe('verifyAuditChain', () => {
  it('is valid for an empty chain', async () => {
    const r = await verifyAuditChain();
    expect(r.valid).toBe(true);
    expect(r.total_checked).toBe(0);
  });

  it('validates an intact 3-entry chain', async () => {
    t = 0;
    const e1 = row({ id: 'e1', action: 'CREATE' }, 'GENESIS');
    const e2 = row({ id: 'e2' }, e1.hash);
    const e3 = row({ id: 'e3', new_value: 'VALIDATING' }, e2.hash);
    seedTable('audit_logs', [e1, e2, e3]);
    const r = await verifyAuditChain();
    expect(r.valid).toBe(true);
    expect(r.total_checked).toBe(3);
  });

  it('detects content tampering', async () => {
    t = 0;
    const e1 = row({ id: 'e1', action: 'CREATE' }, 'GENESIS');
    const e2 = row({ id: 'e2' }, e1.hash);
    seedTable('audit_logs', [e1, e2]);
    getTable('audit_logs')[1].new_value = 'HACKED'; // mutate stored content, keep old hash
    const r = await verifyAuditChain();
    expect(r.valid).toBe(false);
    expect(r.broken_at).toBe('e2');
    expect(r.reason).toMatch(/content hash mismatch/);
  });

  it('detects a broken link', async () => {
    t = 0;
    const e1 = row({ id: 'e1', action: 'CREATE' }, 'GENESIS');
    const e2 = row({ id: 'e2' }, 'WRONG_PREV'); // internally consistent, wrong link
    seedTable('audit_logs', [e1, e2]);
    const r = await verifyAuditChain();
    expect(r.valid).toBe(false);
    expect(r.broken_at).toBe('e2');
    expect(r.reason).toMatch(/broken hash link/);
  });

  it('does not assert GENESIS when filtered by entity', async () => {
    t = 0;
    const e1 = row({ id: 'e1' }, 'SOME_EARLIER_HASH');
    const e2 = row({ id: 'e2' }, e1.hash);
    seedTable('audit_logs', [e1, e2]);
    const r = await verifyAuditChain('service_request', 'sr1');
    expect(r.valid).toBe(true);
  });
});
