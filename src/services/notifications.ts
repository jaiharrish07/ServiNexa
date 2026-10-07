import { supabase } from '../config/supabase';
import { NotificationInput } from '../schemas/notifications';

/**
 * Notification service. These functions MUST NEVER throw — a notification failure must
 * not roll back a business transaction. Errors are logged and swallowed.
 *
 * `notifyStatusChange` is the entrypoint Dev A's workflow engine imports on merge, so its
 * signature is fixed.
 */

export async function createNotification(params: NotificationInput) {
  try {
    const { data, error } = await supabase.from('notifications').insert(params).select().single();
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[notifications] create failed:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[notifications] create threw:', e);
    return null;
  }
}

export async function createNotifications(list: NotificationInput[]) {
  if (!list.length) return [];
  try {
    const { data, error } = await supabase.from('notifications').insert(list).select();
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[notifications] batch failed:', error.message);
      return [];
    }
    return data ?? [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[notifications] batch threw:', e);
    return [];
  }
}

const REQUESTER_NOTIFY_STATUSES = new Set([
  'APPROVED',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'VERIFIED',
  'CLOSED',
]);

async function opsManagersAndAdmins(): Promise<string[]> {
  const { data } = await supabase.from('users').select('id').in('role', ['OPS_MANAGER', 'ADMIN']);
  return (data ?? []).map((u: { id: string }) => u.id);
}

/** Workflow transition fan-out (requester, assigned technician, ops managers). */
export async function notifyStatusChange(serviceRequest: any, _oldStatus: string, newStatus: string) {
  const notifications: NotificationInput[] = [];
  const rn = serviceRequest?.request_number ?? 'request';

  if (serviceRequest?.requester_id && REQUESTER_NOTIFY_STATUSES.has(newStatus)) {
    notifications.push({
      user_id: serviceRequest.requester_id,
      title: `Request ${rn} updated`,
      message: `Status changed to ${newStatus}`,
      type: newStatus === 'COMPLETED' ? 'SUCCESS' : 'INFO',
      related_entity_type: 'service_request',
      related_entity_id: serviceRequest.id,
    });
  }

  if (newStatus === 'ASSIGNED' && serviceRequest?.assigned_technician_id) {
    const { data: tech } = await supabase
      .from('technicians')
      .select('user_id')
      .eq('id', serviceRequest.assigned_technician_id)
      .single();
    if (tech?.user_id) {
      notifications.push({
        user_id: tech.user_id,
        title: 'New assignment',
        message: `You've been assigned to ${rn}: ${serviceRequest.title ?? ''}`.trim(),
        type: serviceRequest.priority === 'CRITICAL' ? 'CRITICAL' : 'INFO',
        related_entity_type: 'service_request',
        related_entity_id: serviceRequest.id,
      });
    }
  }

  if (newStatus === 'EXCEPTION') {
    for (const uid of await opsManagersAndAdmins()) {
      notifications.push({
        user_id: uid,
        title: `Exception on ${rn}`,
        message: 'Request requires attention',
        type: 'WARNING',
        related_entity_type: 'service_request',
        related_entity_id: serviceRequest.id,
      });
    }
  }

  await createNotifications(notifications);
}

/** Fired when a new service request is created (Dev B producer). */
export async function notifyRequestCreated(serviceRequest: any) {
  const rn = serviceRequest?.request_number ?? 'request';
  const recipients = await opsManagersAndAdmins();
  await createNotifications(
    recipients.map((uid) => ({
      user_id: uid,
      title: `New request ${rn}`,
      message: serviceRequest?.title ?? 'A new service request was submitted',
      type: 'INFO' as const,
      related_entity_type: 'service_request',
      related_entity_id: serviceRequest?.id,
    })),
  );
}
