import { supabase } from '../config/supabase';
import { callAIService } from './ai-client';
import { partsStub } from '../ai-stubs/parts.stub';

interface SourceOpts {
  priority?: string;
  sla_remaining?: number;
  quantities?: Record<string, number>;
}

/**
 * Parts sourcing (Feature 3). Gathers availability across the local site, other
 * sites, external vendors, and compatible substitutes, then asks the AI service
 * for the optimal sourcing matrix (stub fallback). Reuses the existing
 * `spare_parts` table as per-site inventory (no duplicate inventory table).
 */
export async function sourceParts(partNumbers: string[], siteId: string, opts: SourceOpts = {}) {
  const [localRes, otherRes, vendorRes, subRes] = await Promise.all([
    supabase
      .from('spare_parts')
      .select('id, part_number, quantity_available, quantity_reserved')
      .eq('site_id', siteId)
      .in('part_number', partNumbers),
    supabase
      .from('spare_parts')
      .select('part_number, quantity_available, quantity_reserved, site_id, sites(name)')
      .neq('site_id', siteId)
      .in('part_number', partNumbers),
    supabase
      .from('vendor_parts')
      .select('part_number, unit_price_inr, lead_time_hours, external_vendors(name)')
      .in('part_number', partNumbers),
    supabase
      .from('part_substitutes')
      .select('original_part_number, substitute_part_number, notes')
      .in('original_part_number', partNumbers),
  ]);

  const local = (localRes.data ?? []).map((p: any) => ({
    part_number: p.part_number,
    available: (p.quantity_available ?? 0) - (p.quantity_reserved ?? 0),
  }));
  const sites = (otherRes.data ?? []).map((p: any) => ({
    part_number: p.part_number,
    site_name: p.sites?.name,
    available: (p.quantity_available ?? 0) - (p.quantity_reserved ?? 0),
    transfer_hours: 6,
  }));
  const vendors = (vendorRes.data ?? []).map((v: any) => ({
    part_number: v.part_number,
    vendor_name: v.external_vendors?.name,
    price: Number(v.unit_price_inr ?? 0),
    lead_time_hours: v.lead_time_hours ?? 48,
  }));
  const compat = (subRes.data ?? []).map((s: any) => ({
    part_number: s.original_part_number,
    compatible_part_number: s.substitute_part_number,
    notes: s.notes ?? '',
  }));

  const required = partNumbers.map((pn) => ({ part_number: pn, quantity: opts.quantities?.[pn] ?? 1 }));
  const payload = {
    priority: opts.priority ?? 'MEDIUM',
    sla_remaining: opts.sla_remaining ?? 24,
    required,
    local,
    sites,
    vendors,
    compat,
  };

  const ai = await callAIService<any>('/ai/parts-sourcing', payload);
  return ai.data ? { ...ai.data, source: 'ai' as const } : { ...partsStub(payload), source: 'stub' as const };
}
