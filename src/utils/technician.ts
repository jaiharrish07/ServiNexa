import { supabase } from '../config/supabase';

/** A technician can be assigned only while below their configured workload cap. */
export function hasTechnicianCapacity(technician: {
  is_available?: boolean | null;
  current_job_count?: number | null;
  max_concurrent_jobs?: number | null;
}): boolean {
  const current = Number(technician.current_job_count ?? 0);
  const maximum = Number(technician.max_concurrent_jobs ?? 3);
  return technician.is_available !== false && Number.isFinite(current) && Number.isFinite(maximum) && current < maximum;
}

/** Resolve the technicians.id for an authenticated user (req.user.id = users.id). */
export async function resolveTechnicianId(userId: string): Promise<string | null> {
  const { data } = await supabase.from('technicians').select('id').eq('user_id', userId).maybeSingle();
  return data?.id ?? null;
}
