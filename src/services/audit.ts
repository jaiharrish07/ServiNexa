import crypto from 'crypto';
import { supabase } from '../config/supabase';

/**
 * TAMPER-EVIDENT AUDIT CHAIN
 * ==========================
 * Each audit log row is linked to the previous one via a SHA-256 hash chain
 * (blockchain-style). Every new entry stores:
 *   - prev_hash: the `hash` of the immediately preceding log (or 'GENESIS' for
 *     the very first entry in the table), and
 *   - hash:      sha256(canonicalPayload(entry, prev_hash)).
 *
 * HARDENING NOTE: the hash is computed over a DETERMINISTIC canonical payload
 * built ONLY from the persisted columns (entity_type, entity_id, action,
 * field_changed, old_value, new_value, performed_by, metadata, prev_hash).
 * No timestamp or random nonce participates in the hash. This is the key
 * improvement over a naive timestamp-based hash: because the payload is derived
 * entirely from stored columns, the entire chain can be re-verified later by
 * recomputation (see verifyAuditChain). Any mutation of a stored column, or any
 * reordering / deletion that breaks the prev_hash -> hash linkage, is detectable.
 *
 * Auditing is best-effort for the caller: createAuditLog never throws — on any
 * failure it logs and returns null so audit writes can't break business logic.
 */

export interface AuditEntry {
  entity_type: string;
  entity_id: string;
  action: string;
  field_changed?: string;
  old_value?: string;
  new_value?: string;
  performed_by: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
}

/**
 * Shape accepted by canonicalPayload. Both createAuditLog (insert) and
 * verifyAuditChain (recompute from a DB row) build this identically so that the
 * recomputed hash matches the stored hash byte-for-byte.
 */
interface CanonicalSource {
  entity_type: string;
  entity_id: string;
  action: string;
  field_changed?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  performed_by: string;
  metadata?: Record<string, any> | null;
}

/**
 * Deterministic canonical JSON payload with a FIXED key order. Must be
 * identical at write time and at verification time, otherwise verification
 * would always fail.
 */
function canonicalPayload(entry: CanonicalSource, prevHash: string): string {
  return JSON.stringify({
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    field_changed: entry.field_changed || null,
    old_value: entry.old_value || null,
    new_value: entry.new_value || null,
    performed_by: entry.performed_by,
    metadata: entry.metadata || {},
    prev_hash: prevHash,
  });
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * Appends a new entry to the tamper-evident audit chain.
 * Never throws — returns the inserted row, or null on failure.
 */
export async function createAuditLog(entry: AuditEntry): Promise<any> {
  try {
    const { data: lastLog, error: lastErr } = await supabase
      .from('audit_logs')
      .select('hash')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) {
      console.error('[Audit Error] failed to fetch previous hash', lastErr);
      return null;
    }

    const prevHash: string = lastLog?.hash || 'GENESIS';
    const hash = sha256(canonicalPayload(entry, prevHash));

    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        ...entry,
        metadata: entry.metadata || {},
        prev_hash: prevHash,
        hash,
      })
      .select()
      .single();

    if (error) {
      console.error('[Audit Error] failed to insert audit log', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[Audit Error]', err);
    return null;
  }
}

interface AuditRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  performed_by: string;
  metadata: Record<string, any> | null;
  prev_hash: string;
  hash: string;
  created_at: string;
}

/**
 * Verifies the integrity of the audit chain by recomputing every row's hash
 * from its persisted columns and checking link continuity between rows.
 *
 * - With no filters (whole chain): the first row's prev_hash must be 'GENESIS'.
 * - With a filter applied: the first filtered row links to some earlier global
 *   entry, so GENESIS is NOT asserted; only recomputed-hash integrity and
 *   row-to-row linkage are checked.
 */
export async function verifyAuditChain(
  entityType?: string,
  entityId?: string
): Promise<{ valid: boolean; broken_at?: string; total_checked: number; reason?: string }> {
  try {
    let query = supabase
      .from('audit_logs')
      .select(
        'id, entity_type, entity_id, action, field_changed, old_value, new_value, performed_by, metadata, prev_hash, hash, created_at'
      )
      .order('created_at', { ascending: true });

    if (entityType) {
      query = query.eq('entity_type', entityType);
    }
    if (entityId) {
      query = query.eq('entity_id', entityId);
    }

    const { data, error } = await query;

    if (error) {
      return { valid: false, total_checked: 0, reason: error.message };
    }

    const rows = (data || []) as AuditRow[];

    if (rows.length === 0) {
      return { valid: true, total_checked: 0 };
    }

    const assertGenesis = entityType === undefined && entityId === undefined;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // 1) Content integrity: recompute the hash from stored columns.
      const recomputed = sha256(canonicalPayload(row, row.prev_hash));
      if (recomputed !== row.hash) {
        return {
          valid: false,
          broken_at: row.id,
          total_checked: i + 1,
          reason: 'content hash mismatch (tampering)',
        };
      }

      // 2) Link continuity.
      if (i === 0) {
        if (assertGenesis && row.prev_hash !== 'GENESIS') {
          return {
            valid: false,
            broken_at: row.id,
            total_checked: i + 1,
            reason: 'broken hash link',
          };
        }
      } else {
        if (row.prev_hash !== rows[i - 1].hash) {
          return {
            valid: false,
            broken_at: row.id,
            total_checked: i + 1,
            reason: 'broken hash link',
          };
        }
      }
    }

    return { valid: true, total_checked: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, total_checked: 0, reason: message };
  }
}
