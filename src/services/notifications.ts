import { supabase } from '../config/supabase';

export interface NotificationParams {
  user_id: string;
  title: string;
  message: string;
  type?: 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
  related_entity_type?: string;
  related_entity_id?: string;
}

export async function createNotification(params: NotificationParams) {
  const { data, error } = await supabase
    .from('notifications')
    .insert(params)
    .select()
    .single();

  if (error) console.error('[Notification Error]', error.message);
  return data;
}

// Notify relevant users based on a workflow status change.
// Fire-and-forget: a notification failure must never break a workflow transition.
export async function notifyStatusChange(
  serviceRequest: any,
  oldStatus: string,
  newStatus: string
) {
  try {
    const notifications: NotificationParams[] = [];

    // Notify requester on key transitions.
    if (
      ['APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CLOSED'].includes(
        newStatus
      ) &&
      serviceRequest?.requester_id
    ) {
      notifications.push({
        user_id: serviceRequest.requester_id,
        title: `Request ${serviceRequest.request_number} updated`,
        message: `Status changed from ${oldStatus} to ${newStatus}`,
        type: newStatus === 'COMPLETED' ? 'SUCCESS' : 'INFO',
        related_entity_type: 'service_request',
        related_entity_id: serviceRequest.id,
      });
    }

    // Notify technician on assignment.
    if (newStatus === 'ASSIGNED' && serviceRequest?.assigned_technician_id) {
      const { data: tech } = await supabase
        .from('technicians')
        .select('user_id')
        .eq('id', serviceRequest.assigned_technician_id)
        .single();

      if (tech) {
        notifications.push({
          user_id: tech.user_id,
          title: 'New assignment',
          message: `You've been assigned to ${serviceRequest.request_number}: ${serviceRequest.title}`,
          type: serviceRequest.priority === 'CRITICAL' ? 'CRITICAL' : 'INFO',
          related_entity_type: 'service_request',
          related_entity_id: serviceRequest.id,
        });
      }
    }

    // Notify ops managers + admins on exceptions.
    if (newStatus === 'EXCEPTION') {
      const { data: managers } = await supabase
        .from('users')
        .select('id')
        .in('role', ['OPS_MANAGER', 'ADMIN']);

      if (managers) {
        for (const mgr of managers) {
          notifications.push({
            user_id: mgr.id,
            title: `Exception on ${serviceRequest.request_number}`,
            message: 'Request requires attention',
            type: 'WARNING',
            related_entity_type: 'service_request',
            related_entity_id: serviceRequest.id,
          });
        }
      }
    }

    await Promise.all(notifications.map((n) => createNotification(n)));
  } catch (err: any) {
    console.error('[notifyStatusChange] failed (non-fatal):', err?.message || err);
  }
}
