import { supabase } from '../config/supabase';

/** Resolve the technicians.id for an authenticated user (req.user.id = users.id). */
export async function resolveTechnicianId(userId: string): Promise<string | null> {
  const { data } = await supabase.from('technicians').select('id').eq('user_id', userId).maybeSingle();
  return data?.id ?? null;
}
