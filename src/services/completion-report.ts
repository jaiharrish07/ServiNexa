import { supabase } from '../config/supabase';

export async function generateCompletionReport(serviceRequestId: string) {
  const { data: sr, error: srErr } = await supabase
    .from('service_requests')
    .select(`
      *,
      sites(name, code),
      machines(name, code, type, status),
      requester:users!requester_id(full_name, email),
      technician:technicians!assigned_technician_id(employee_code, users(full_name, email)),
      work_orders(*),
      documents(*)
    `)
    .eq('id', serviceRequestId)
    .single();

  if (srErr || !sr) throw new Error('Service request not found');

  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('action, old_status, new_status, created_at, performed_by_email')
    .eq('entity_id', serviceRequestId)
    .order('created_at', { ascending: true });

  const { data: bids } = await supabase
    .from('bids')
    .select('*, technicians(employee_code, users(full_name))')
    .eq('service_request_id', serviceRequestId);

  const { data: staging } = await supabase
    .from('staging')
    .select('*, spare_parts(name, part_number)')
    .eq('service_request_id', serviceRequestId);

  const photos = (sr.documents ?? []).filter((d: any) =>
    d.file_type?.startsWith('image/'),
  );

  const totalWorkHours = (sr.work_orders ?? []).reduce(
    (sum: number, wo: any) => sum + (wo.actual_hours ?? wo.estimated_hours ?? 0),
    0,
  );

  const partsCost = (staging ?? []).reduce(
    (sum: number, s: any) => sum + (s.quantity ?? 0) * (s.unit_cost ?? 0),
    0,
  );

  const createdAt = new Date(sr.created_at);
  const completedAt = sr.completed_at ? new Date(sr.completed_at) : new Date();
  const resolutionHours = Math.round(
    (completedAt.getTime() - createdAt.getTime()) / 3_600_000 * 10,
  ) / 10;

  const slaDeadline = sr.sla_deadline ? new Date(sr.sla_deadline) : null;
  const slaStatus = !slaDeadline
    ? 'N/A'
    : completedAt <= slaDeadline
      ? 'MET'
      : 'BREACHED';

  return {
    report: {
      generated_at: new Date().toISOString(),
      service_request: {
        id: sr.id,
        request_number: sr.request_number,
        title: sr.title,
        description: sr.description,
        category: sr.category,
        sub_category: sr.sub_category,
        priority: sr.priority,
        status: sr.status,
        created_at: sr.created_at,
        completed_at: sr.completed_at,
        resolution_hours: resolutionHours,
        sla_status: slaStatus,
        sla_deadline: sr.sla_deadline,
      },
      machine: sr.machines
        ? {
            name: sr.machines.name,
            code: sr.machines.code,
            type: sr.machines.type,
            current_status: sr.machines.status,
          }
        : null,
      site: sr.sites ? { name: sr.sites.name, code: sr.sites.code } : null,
      requester: sr.requester
        ? { name: sr.requester.full_name, email: sr.requester.email }
        : null,
      technician: sr.technician
        ? {
            employee_code: sr.technician.employee_code,
            name: sr.technician.users?.full_name,
            email: sr.technician.users?.email,
          }
        : null,
      work_summary: {
        total_work_orders: (sr.work_orders ?? []).length,
        completed_work_orders: (sr.work_orders ?? []).filter(
          (wo: any) => wo.status === 'COMPLETED',
        ).length,
        total_hours: totalWorkHours,
        work_orders: (sr.work_orders ?? []).map((wo: any) => ({
          id: wo.id,
          title: wo.title,
          status: wo.status,
          estimated_hours: wo.estimated_hours,
          actual_hours: wo.actual_hours,
          notes: wo.notes,
        })),
      },
      parts_used: {
        total_items: (staging ?? []).length,
        total_cost: partsCost,
        items: (staging ?? []).map((s: any) => ({
          part_number: s.spare_parts?.part_number,
          part_name: s.spare_parts?.name,
          quantity: s.quantity,
          status: s.status,
        })),
      },
      bidding_summary: {
        total_bids: (bids ?? []).length,
        selected_bid: (bids ?? []).find((b: any) => b.status === 'ACCEPTED'),
        bids: (bids ?? []).map((b: any) => ({
          technician: b.technicians?.users?.full_name ?? b.technicians?.employee_code,
          estimated_hours: b.estimated_hours,
          estimated_cost: b.estimated_cost,
          status: b.status,
        })),
      },
      timeline: (auditLogs ?? []).map((log: any) => ({
        action: log.action,
        from_status: log.old_status,
        to_status: log.new_status,
        at: log.created_at,
        by: log.performed_by_email,
      })),
      photos: photos.map((p: any) => ({
        name: p.name,
        url: p.file_url,
        uploaded_at: p.created_at,
      })),
      ai_classification: sr.ai_category
        ? {
            category: sr.ai_category,
            sub_category: sr.ai_sub_category,
            priority: sr.ai_priority,
            confidence: sr.ai_confidence,
            source: sr.ai_triage_source,
          }
        : null,
    },
  };
}
