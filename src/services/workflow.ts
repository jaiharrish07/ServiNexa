import { supabase } from '../config/supabase';
import { createAuditLog } from './audit';
import { notifyStatusChange } from './notifications';
import { resolveTechnicianId } from '../utils/technician';

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
  code?: 'NOT_FOUND' | 'INVALID_TRANSITION' | 'FORBIDDEN' | 'CONFLICT' | 'DB_ERROR';
}

// Pure helper — exported so it can be unit-tested without a database.
export function isTransitionAllowed(from: string, to: string): boolean {
  return (TRANSITIONS[from] || []).includes(to);
}

// Pure helper — role checks fail closed if a transition is missing a policy.
export function canRoleTransition(from: string, to: string, role: string): boolean {
  const allowed = TRANSITION_ROLES[`${from}->${to}`];
  return Boolean(allowed?.includes(role));
}

export function slaHoursFor(priority: string): number | undefined {
  return SLA_HOURS[priority];
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

  // A role check alone is insufficient: customers and technicians are limited to
  // requests they own or are assigned to.
  if (userRole === 'CUSTOMER' && sr.requester_id !== userId) {
    return { success: false, error: 'You cannot change another customer\'s request', code: 'FORBIDDEN' };
  }
  if (userRole === 'TECHNICIAN') {
    const technicianId = await resolveTechnicianId(userId);
    if (!technicianId || sr.assigned_technician_id !== technicianId) {
      return { success: false, error: 'You are not assigned to this request', code: 'FORBIDDEN' };
    }
  }

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
  }
  if (newStatus === 'ASSIGNED' && !metadata?.technician_id) {
    return { success: false, error: 'technician_id is required for assignment', code: 'INVALID_TRANSITION' };
  }

  if (newStatus === 'IN_PROGRESS') {
    updatePayload.started_at = new Date().toISOString();
  }

  if (newStatus === 'COMPLETED') {
    updatePayload.completed_at = new Date().toISOString();
    if (metadata?.resolution_notes) updatePayload.resolution_notes = metadata.resolution_notes;
  }

  if (newStatus === 'VERIFIED') {
    updatePayload.verified_at = new Date().toISOString();
  }

  if (newStatus === 'CLOSED') {
    updatePayload.closed_at = new Date().toISOString();
  }

  // 5. Apply the update.
  const { data: updated, error: updateError } = await supabase.rpc('transition_service_request', {
    p_request_id: requestId,
    p_expected_status: currentStatus,
    p_payload: updatePayload,
  });

  if (updateError) {
    if (updateError.code === '40001' || updateError.code === 'P0002') {
      return { success: false, error: 'Request status changed concurrently; reload and retry', code: 'INVALID_TRANSITION' };
    }
    if (updateError.code === '23514') return { success: false, error: updateError.message, code: 'CONFLICT' };
    return { success: false, error: updateError.message, code: 'DB_ERROR' };
  }
  const updatedRequest = Array.isArray(updated) ? updated[0] : updated;
  if (!updatedRequest) return { success: false, error: 'Transition returned no updated request', code: 'DB_ERROR' };

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
    await notifyStatusChange(updatedRequest, currentStatus, newStatus);
  } catch (err: any) {
    console.error('[workflow] notification failed (non-fatal):', err?.message || err);
  }

  // AI Orchestration: auto-run the triage pipeline on submission (fire-and-forget).
  if (newStatus === 'SUBMITTED') {
    try {
      const { runTriagePipeline } = await import('./ai-orchestrator');
      // Mark pipeline as running
      await supabase
        .from('service_requests')
        .update({ ai_pipeline_status: 'RUNNING' })
        .eq('id', requestId);
      // Fire-and-forget: don't await — the pipeline runs in the background
      runTriagePipeline(requestId).catch((err: any) => {
        console.error('[workflow] AI pipeline failed (non-fatal):', err?.message || err);
        supabase
          .from('service_requests')
          .update({ ai_pipeline_status: 'FAILED' })
          .eq('id', requestId)
          .then(() => {});
      });
    } catch (err: any) {
      console.error('[workflow] AI pipeline launch failed (non-fatal):', err?.message || err);
    }
  }

  // Machine status sync: reflect service lifecycle on the machine's status.
  if (sr.machine_id) {
    const machineStatusUpdate: Record<string, string> = {};
    if (newStatus === 'ASSIGNED' || newStatus === 'IN_PROGRESS') {
      machineStatusUpdate.status = 'MAINTENANCE';
    } else if (newStatus === 'VERIFIED' || newStatus === 'CLOSED') {
      machineStatusUpdate.status = 'OPERATIONAL';
    } else if (newStatus === 'EXCEPTION') {
      machineStatusUpdate.status = 'DOWN';
    }
    if (machineStatusUpdate.status) {
      const { error: machErr } = await supabase
        .from('machines')
        .update(machineStatusUpdate)
        .eq('id', sr.machine_id);
      if (machErr) console.error('[workflow] machine status sync failed (non-fatal):', machErr.message);
    }
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

  return { success: true, service_request: updatedRequest };
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
