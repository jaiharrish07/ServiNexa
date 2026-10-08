import { supabase } from '../config/supabase';

const round = (n: number, dp = 2) => +n.toFixed(dp);
const ACTIVE_STATUSES = ['SUBMITTED', 'VALIDATING', 'PENDING_APPROVAL', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS'];
const CLOSED_STATUSES = new Set(['COMPLETED', 'VERIFIED', 'CLOSED']);

// `any` here is deliberate: the Supabase builder's generic `.eq` chain triggers a
// "type instantiation excessively deep" error when captured in a generic helper.
function withSite(q: any, siteId?: string): any {
  return siteId ? q.eq('site_id', siteId) : q;
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export async function getDashboardStats(siteId?: string) {
  const [srRows, machineRows, techRows, exRows] = await Promise.all([
    (async () => {
      const { data } = await withSite(supabase.from('service_requests').select('status, priority, category'), siteId);
      return data ?? [];
    })(),
    (async () => {
      const { data } = await withSite(supabase.from('machines').select('status'), siteId);
      return data ?? [];
    })(),
    (async () => {
      const { data } = await withSite(
        supabase.from('technicians').select('is_available, current_job_count'),
        siteId,
      );
      return data ?? [];
    })(),
    (async () => {
      const { data } = await supabase.from('exception_flags').select('type, severity').eq('status', 'OPEN');
      return data ?? [];
    })(),
  ]);

  const statusCounts: Record<string, number> = {};
  const priorityCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  srRows.forEach((r: any) => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    if (r.priority) priorityCounts[r.priority] = (priorityCounts[r.priority] || 0) + 1;
    if (r.category) categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
  });

  const machineCounts: Record<string, number> = {};
  machineRows.forEach((m: any) => (machineCounts[m.status] = (machineCounts[m.status] || 0) + 1));

  const byType: Record<string, number> = {};
  exRows.forEach((e: any) => (byType[e.type] = (byType[e.type] || 0) + 1));

  const totalLoad = techRows.reduce((s: number, t: any) => s + (t.current_job_count || 0), 0);

  return {
    service_requests: {
      total: srRows.length,
      by_status: statusCounts,
      by_priority: priorityCounts,
      by_category: categoryCounts,
      active: ACTIVE_STATUSES.reduce((sum, s) => sum + (statusCounts[s] || 0), 0),
    },
    machines: { total: machineRows.length, by_status: machineCounts },
    technicians: {
      total: techRows.length,
      available: techRows.filter((t: any) => t.is_available).length,
      avg_load: techRows.length ? round(totalLoad / techRows.length, 1) : 0,
    },
    exceptions: {
      open: exRows.length,
      by_type: byType,
      critical: exRows.filter((e: any) => e.severity === 'CRITICAL').length,
    },
  };
}

// ── SLA compliance ───────────────────────────────────────────────────────────
export async function getSLAReport(siteId?: string) {
  const { data: requests } = await withSite(
    supabase
      .from('service_requests')
      .select('id, request_number, priority, sla_deadline, status, created_at, completed_at')
      .not('sla_deadline', 'is', null),
    siteId,
  );
  const rows = requests ?? [];
  const now = Date.now();
  let met = 0;
  let breached = 0;
  let atRisk = 0;

  const details = rows.map((sr: any) => {
    const deadline = new Date(sr.sla_deadline).getTime();
    const completed = sr.completed_at ? new Date(sr.completed_at).getTime() : null;
    const isClosed = CLOSED_STATUSES.has(sr.status);
    let slaStatus: string;

    if (isClosed && completed !== null && completed <= deadline) {
      slaStatus = 'MET';
      met++;
    } else if (isClosed && completed !== null && completed > deadline) {
      slaStatus = 'BREACHED';
      breached++;
    } else if (!isClosed && now > deadline) {
      slaStatus = 'BREACHED';
      breached++;
    } else if (!isClosed && deadline - now < 2 * 60 * 60 * 1000) {
      slaStatus = 'AT_RISK';
      atRisk++;
    } else {
      slaStatus = 'ON_TRACK';
      met++;
    }
    return { request_number: sr.request_number, priority: sr.priority, sla_status: slaStatus, deadline: sr.sla_deadline };
  });

  return {
    total: rows.length,
    met,
    breached,
    at_risk: atRisk,
    compliance_rate: rows.length ? round((met / rows.length) * 100, 1) : 100,
    details,
  };
}

// ── MTTR (mean time to resolve) — NEW, deliverable #7 ─────────────────────────
export async function getMTTRReport(siteId?: string) {
  const { data } = await withSite(
    supabase
      .from('service_requests')
      .select('request_number, priority, category, created_at, completed_at')
      .not('completed_at', 'is', null),
    siteId,
  );
  const rows = (data ?? []).filter((r: any) => r.created_at && r.completed_at);

  const hoursOf = (r: any) => (new Date(r.completed_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000;

  const bucket = () => ({ count: 0, total: 0 });
  const byPriority: Record<string, { count: number; total: number }> = {
    CRITICAL: bucket(),
    HIGH: bucket(),
    MEDIUM: bucket(),
    LOW: bucket(),
  };
  const byCategoryRaw: Record<string, { count: number; total: number }> = {};

  let totalHours = 0;
  let fastest: { request_number: string; hours: number } | null = null;
  let slowest: { request_number: string; hours: number } | null = null;

  for (const r of rows) {
    const h = hoursOf(r);
    totalHours += h;
    const p = byPriority[r.priority as string];
    if (p) {
      p.count++;
      p.total += h;
    }
    const cat = r.category || 'OTHER';
    (byCategoryRaw[cat] ??= bucket()).count++;
    byCategoryRaw[cat].total += h;
    if (!fastest || h < fastest.hours) fastest = { request_number: r.request_number, hours: round(h) };
    if (!slowest || h > slowest.hours) slowest = { request_number: r.request_number, hours: round(h) };
  }

  const finalize = (b: { count: number; total: number }) => ({
    count: b.count,
    mttr_hours: b.count ? round(b.total / b.count) : 0,
  });

  const by_category: Record<string, { count: number; mttr_hours: number }> = {};
  for (const [k, v] of Object.entries(byCategoryRaw)) by_category[k] = finalize(v);

  return {
    total_resolved: rows.length,
    mttr_hours: rows.length ? round(totalHours / rows.length) : 0,
    by_priority: {
      CRITICAL: finalize(byPriority.CRITICAL),
      HIGH: finalize(byPriority.HIGH),
      MEDIUM: finalize(byPriority.MEDIUM),
      LOW: finalize(byPriority.LOW),
    },
    by_category,
    fastest,
    slowest,
  };
}

// ── Technician utilization — NEW, deliverable #7 ──────────────────────────────
export async function getUtilizationReport(siteId?: string) {
  const { data } = await withSite(supabase.from('technicians').select('*, users(full_name)'), siteId);
  const rows = data ?? [];

  const technicians = rows
    .map((t: any) => {
      const max = t.max_concurrent_jobs || 0;
      const util = max ? round((t.current_job_count / max) * 100, 1) : 0;
      return {
        technician_id: t.id,
        employee_code: t.employee_code,
        name: t.users?.full_name ?? null,
        current_job_count: t.current_job_count ?? 0,
        max_concurrent_jobs: max,
        utilization_pct: util,
        avg_resolution_hours: t.avg_resolution_hours ?? null,
        rating: t.rating ?? null,
        is_available: t.is_available ?? false,
      };
    })
    .sort((a: any, b: any) => b.utilization_pct - a.utilization_pct);

  const total = technicians.length;
  const avgUtil = total ? round(technicians.reduce((s: number, t: any) => s + t.utilization_pct, 0) / total, 1) : 0;

  return {
    technicians,
    summary: {
      total,
      available: technicians.filter((t: any) => t.is_available).length,
      avg_utilization_pct: avgUtil,
      overloaded: technicians.filter((t: any) => t.utilization_pct >= 100).length,
      idle: technicians.filter((t: any) => t.current_job_count === 0).length,
    },
  };
}

// ── Cross-site parts rebalancing ──────────────────────────────────────────────
export async function getPartsRebalance() {
  const { data } = await supabase.from('spare_parts').select('*, sites(name, code)').order('part_number');
  const parts = data ?? [];

  const byPart: Record<string, any[]> = {};
  for (const p of parts) (byPart[p.part_number] ??= []).push(p);

  const siteCode = (e: any) => e.sites?.code ?? e.site_id;
  const avail = (e: any) => (e.quantity_available ?? 0) - (e.quantity_reserved ?? 0);

  const suggestions: any[] = [];
  for (const [partNumber, entries] of Object.entries(byPart)) {
    if (entries.length < 2) continue;
    const surplus = entries.filter((e) => avail(e) > (e.reorder_level ?? 0) * 2);
    const deficit = entries.filter((e) => avail(e) < (e.reorder_level ?? 0));
    if (surplus.length && deficit.length) {
      const s = surplus[0];
      const d = deficit[0];
      suggestions.push({
        part_number: partNumber,
        part_name: s.name,
        from_site: siteCode(s),
        to_site: siteCode(d),
        suggested_quantity: Math.min(
          avail(s) - (s.reorder_level ?? 0),
          (d.reorder_level ?? 0) - avail(d),
        ),
      });
    }
  }
  return suggestions;
}
