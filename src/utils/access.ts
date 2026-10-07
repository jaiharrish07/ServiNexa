import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';
import { resolveTechnicianId } from './technician';

type AppUser = NonNullable<AuthRequest['user']>;
const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';

export const isOperations = (user: AppUser) => user.role === 'ADMIN' || user.role === 'OPS_MANAGER';

/** Describes the mandatory ownership filter for a service-request query. */
export async function getServiceRequestScope(user: AppUser): Promise<{ field: string; value: string } | null> {
  if (isOperations(user)) return null;
  if (user.role === 'CUSTOMER') return { field: 'requester_id', value: user.id };
  if (user.role === 'TECHNICIAN') {
    const technicianId = await resolveTechnicianId(user.id);
    return { field: 'assigned_technician_id', value: technicianId ?? NO_MATCH_ID };
  }
  return { field: 'id', value: NO_MATCH_ID };
}

/** Returns a request only when the caller is permitted to see that request. */
export async function getAccessibleServiceRequest(requestId: string, user: AppUser) {
  let query = supabase
    .from('service_requests')
    .select('id, requester_id, assigned_technician_id, status, site_id, machine_id, priority')
    .eq('id', requestId);
  const scope = await getServiceRequestScope(user);
  if (scope) query = query.eq(scope.field, scope.value);
  const { data } = await query.maybeSingle();
  return data ?? null;
}

export async function canAccessSite(siteId: string, user: AppUser): Promise<boolean> {
  if (isOperations(user)) return true;
  if (user.role === 'TECHNICIAN') {
    const { data } = await supabase.from('technicians').select('site_id').eq('user_id', user.id).maybeSingle();
    return data?.site_id === siteId;
  }
  if (user.role === 'CUSTOMER') {
    const { data } = await supabase
      .from('service_requests')
      .select('id')
      .eq('requester_id', user.id)
      .eq('site_id', siteId)
      .limit(1);
    return Boolean(data?.length);
  }
  return false;
}
