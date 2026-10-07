import { supabase } from '../config/supabase';
import { createAuditLog } from './audit';
import { notifyStatusChange } from './notifications';

/**
 * Workflow engine — the heart of the platform.
 *
 * Enforces the service-request state machine: which transitions are legal,
 * which roles may trigger each one, and the side effects (timestamps, SLA
 * deadline, technician job-count) that accompany a transition. Every applied
 * transition is recorded in the tamper-evident audit chain and fans out
 * notifications. Audit + notification failures are deliberately non-fatal so a
 * logging/notification hiccup can never strand a request mid-transition.
 */

// Canonical list of all valid states (used to reject unknown targets early).
export const ALL_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'VALIDATING',
  'PENDING_APPROVAL',
  'APPROVED',
  'BIDDING',
  'BID_REVIEW',
  'BID_ACCEPTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'VERIFIED',
  'CLOSED',
  'EXCEPTION',
] as const;

// Valid state transitions.
const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['VALIDATING'],
  VALIDATING: ['PENDING_APPROVAL', 'DRAFT'], // can bounce back
  PENDING_APPROVAL: ['APPROVED', 'DRAFT'], // can reject
  APPROVED: ['BIDDING', 'ASSIGNED'], // BIDDING = collaborative bidding; ASSIGNED = direct-assign fallback
  BIDDING: ['BID_REVIEW', 'EXCEPTION'],
  BID_REVIEW: ['BID_ACCEPTED', 'BIDDING'], // can reopen bidding
  BID_ACCEPTED: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS', 'EXCEPTION'],
  IN_PROGRESS: ['COMPLETED', 'EXCEPTION'],
  COMPLETED: ['VERIFIED', 'IN_PROGRESS'], // can reopen
  VERIFIED: ['CLOSED'],
  EXCEPTION: ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
  CLOSED: [], // terminal
};

// Who can trigger each transition (key: "FROM->TO").
const TRANSITION_ROLES: Record<string, string[]> = {
  'DRAFT->SUBMITTED': ['CUSTOMER', 'OPS_MANAGER', 'ADMIN'],
  'SUBMITTED->VALIDATING': ['OPS_MANAGER', 'ADMIN'],
  'VALIDATING->PENDING_APPROVAL': ['OPS_MANAGER', 'ADMIN'],
  'VALIDATING->DRAFT': ['OPS_MANAGER', 'ADMIN'],
  'PENDING_APPROVAL->APPROVED': ['OPS_MANAGER', 'ADMIN'],
  'PENDING_APPROVAL->DRAFT': ['OPS_MANAGER', 'ADMIN'],
  'APPROVED->ASSIGNED': ['OPS_MANAGER', 'ADMIN'],
  'APPROVED->BIDDING': ['OPS_MANAGER', 'ADMIN'],
  'BIDDING->BID_REVIEW': ['OPS_MANAGER', 'ADMIN'],
  'BIDDING->EXCEPTION': ['TECHNICIAN', 'OPS_MANAGER', 'ADMIN'],
  'BID_REVIEW->BID_ACCEPTED': ['OPS_MANAGER', 'ADMIN'],
  'BID_REVIEW->BIDDING': ['OPS_MANAGER', 'ADMIN'],
  'BID_ACCEPTED->ASSIGNED': ['OPS_MANAGER', 'ADMIN'],
  'ASSIGNED->IN_PROGRESS': ['TECHNICIAN', 'OPS_MANAGER', 'ADMIN'],
  'ASSIGNED->EXCEPTION': ['TECHNICIAN', 'OPS_MANAGER', 'ADMIN'],
  'IN_PROGRESS->COMPLETED': ['TECHNICIAN', 'OPS_MANAGER', 'ADMIN'],
  'IN_PROGRESS->EXCEPTION': ['TECHNICIAN', 'OPS_MANAGER', 'ADMIN'],
  'COMPLETED->VERIFIED': ['OPS_MANAGER', 'ADMIN'],
  'COMPLETED->IN_PROGRESS': ['OPS_MANAGER', 'ADMIN'],
  'VERIFIED->CLOSED': ['OPS_MANAGER', 'ADMIN'],
  'EXCEPTION->ASSIGNED': ['OPS_MANAGER', 'ADMIN'],
  'EXCEPTION->IN_PROGRESS': ['OPS_MANAGER', 'ADMIN'],
  'EXCEPTION->CLOSED': ['ADMIN'],
};

// SLA deadlines by priority (hours from submission).
const SLA_HOURS: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
};

export interface TransitionResult {
  success: boolean;
  service_request?: any;
  error?: string;
  code?: 'NOT_FOUND' | 'INVALID_TRANSITION' | 'FORBIDDEN' | 'DB_ERROR';
}

// Pure helper — exported so it can be unit-tested without a database.
export function isTransitionAllowed(from: string, to: string): boolean {
  return (TRANSITIONS[from] || []).includes(to);
}

// Pure helper — role check for a given transition. Returns true if no explicit
// restriction exists for the transition (fail-open only for undefined keys).
export function canRoleTransition(from: string, to: string, role: string): boolean {
  const allowed = TRANSITION_ROLES[`${from}->${to}`];
  return !allowed || allowed.includes(role);
}

export function slaHoursFor(priority: string): number | undefined {
  return SLA_HOURS[priority];
}

/**
 * Atomically adjust a technician's job count. Prefers the DB-side RPC
 * (increment_job_count / decrement_job_count) to avoid a read-modify-write
 * race under concurrency; falls back to a manual update if the RPC is absent.
 */
async function adjustTechnicianJobCount(techId: string, delta: 1 | -1): Promise<void> {
  const fn = delta === 1 ? 'increment_job_count' : 'decrement_job_count';
  const { error } = await supabase.rpc(fn, { tech_id: techId });
  if (!error) return;

  // Fallback: read-modify-write (best-effort; used only if the RPC isn't deployed).
  const { data } = await supabase
    .from('technicians')
    .select('current_job_count')
    .eq('id', techId)
    .single();

  if (data) {
    const current = data.current_job_count || 0;
    const next = delta === 1 ? current + 1 : Math.max(0, current - 1);
    await supabase.from('technicians').update({ current_job_count: next }).eq('id', techId);
  }
}

export async function transitionStatus(
  requestId: string,
  newStatus: string,
  userId: string,
  userRole: string,
  metadata?: Record<string, any>
): Promise<TransitionResult> {
  // 0. Reject unknown target states before touching the DB.
  if (!ALL_STATUSES.includes(newStatus as any)) {
    return { success: false, error: `Unknown status "${newStatus}"`, code: 'INVALID_TRANSITION' };
  }

  // 1. Fetch current state.
  const { data: sr, error: fetchError } = await supabase
    .from('service_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError || !sr) {
    return { success: false, error: 'Service request not found', code: 'NOT_FOUND' };
  }

  const currentStatus = sr.status;

  // 2. Validate the transition is legal.
  if (!isTransitionAllowed(currentStatus, newStatus)) {
    const allowed = TRANSITIONS[currentStatus];
    return {
      success: false,
      code: 'INVALID_TRANSITION',
      error: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${
        allowed && allowed.length ? allowed.join(', ') : 'none'
      }`,
    };
  }

  // 3. Check role permission.
  if (!canRoleTransition(currentStatus, newStatus, userRole)) {
    return {
      success: false,
      code: 'FORBIDDEN',
      error: `Role ${userRole} cannot perform transition ${currentStatus}->${newStatus}`,
    };
  }

  // 4. Build the update payload + per-transition side effects.
  const updatePayload: Record<string, any> = { status: newStatus };

  if (newStatus === 'SUBMITTED' && sr.priority && SLA_HOURS[sr.priority]) {
    updatePayload.sla_deadline = new Date(
      Date.now() + SLA_HOURS[sr.priority] * 60 * 60 * 1000
    ).toISOString();
  }

  if (newStatus === 'APPROVED') {
    updatePayload.approved_by = userId;
    updatePayload.approved_at = new Date().toISOString();
  }

  if (newStatus === 'ASSIGNED' && metadata?.technician_id) {
    updatePayload.assigned_technician_id = metadata.technician_id;
    updatePayload.assigned_at = new Date().toISOString();
    await adjustTechnicianJobCount(metadata.technician_id, 1);
  }

  if (newStatus === 'IN_PROGRESS') {
    updatePayload.started_at = new Date().toISOString();
  }

  if (newStatus === 'COMPLETED') {
    updatePayload.completed_at = new Date().toISOString();
    if (metadata?.resolution_notes) updatePayload.resolution_notes = metadata.resolution_notes;
    // Free up the assigned technician.
    if (sr.assigned_technician_id) {
      await adjustTechnicianJobCount(sr.assigned_technician_id, -1);
    }
  }

  if (newStatus === 'VERIFIED') {
    updatePayload.verified_at = new Date().toISOString();
  }

  if (newStatus === 'CLOSED') {
    updatePayload.closed_at = new Date().toISOString();
  }

  // 5. Apply the update.
  const { data: updated, error: updateError } = await supabase
    .from('service_requests')
    .update(updatePayload)
    .eq('id', requestId)
    .select()
    .single();

  if (updateError) {
    return { success: false, error: updateError.message, code: 'DB_ERROR' };
  }

  // 6. Side effects — audit + notify. Non-fatal: never fail a committed transition.
  try {
    await createAuditLog({
      entity_type: 'service_request',
      entity_id: requestId,
      action: 'STATUS_CHANGE',
      field_changed: 'status',
      old_value: currentStatus,
      new_value: newStatus,
      performed_by: userId,
      metadata: metadata || {},
    });
  } catch (err: any) {
    console.error('[workflow] audit log failed (non-fatal):', err?.message || err);
  }

  try {
    await notifyStatusChange(updated, currentStatus, newStatus);
  } catch (err: any) {
    console.error('[workflow] notification failed (non-fatal):', err?.message || err);
  }

  // Feature 7: auto-index the solution into the knowledge base on verification.
  if (newStatus === 'VERIFIED') {
    try {
      const { indexFromRequest } = await import('./knowledge.service');
      await indexFromRequest(requestId);
    } catch (err: any) {
      console.error('[workflow] knowledge index failed (non-fatal):', err?.message || err);
    }
  }

  return { success: true, service_request: updated };
}

/**
 * Raise an exception on a request: transition to EXCEPTION, then record a flag.
 */
export async function raiseException(
  requestId: string,
  type: string,
  description: string,
  userId: string,
  userRole: string,
  severity: string = 'MEDIUM'
): Promise<TransitionResult> {
  const result = await transitionStatus(requestId, 'EXCEPTION', userId, userRole, {
    exception_type: type,
  });
  if (!result.success) return result;

  const { data: flag, error } = await supabase
    .from('exception_flags')
    .insert({
      service_request_id: requestId,
      type,
      description,
      severity,
      raised_by: userId,
    })
    .select()
    .single();

  if (error) {
    // The transition already committed; surface the flag-insert failure but
    // report the (now-EXCEPTION) request so the caller sees consistent state.
    return {
      success: false,
      code: 'DB_ERROR',
      error: `Transitioned to EXCEPTION but failed to record flag: ${error.message}`,
      service_request: result.service_request,
    };
  }

  return { success: true, service_request: { ...result.service_request, exception: flag } };
}
