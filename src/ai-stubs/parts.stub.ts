/**
 * Deterministic parts-sourcing fallback (cheapest acceptable source first).
 * Mirrors Python `/ai/parts-sourcing`.
 */
export interface PartsStubInput {
  required: Array<{ part_number: string; part_id?: string; quantity?: number }>;
  local?: Array<{ part_number: string; available: number }>;
  sites?: Array<{ part_number: string; site_name?: string; available: number; transfer_hours?: number }>;
  vendors?: Array<{ part_number: string; vendor_name?: string; price?: number; lead_time_hours?: number }>;
  compat?: Array<{ part_number: string; compatible_part_number: string; notes?: string }>;
}

export function partsStub(input: PartsStubInput) {
  const required = Array.isArray(input.required) ? input.required : [];
  const local = input.local ?? [];
  const sites = input.sites ?? [];
  const vendors = input.vendors ?? [];
  const compat = input.compat ?? [];

  let total_cost = 0;
  let ready_by = 0;

  const matrix = required.map((r) => {
    const qty = r.quantity ?? 1;
    const localRow = local.find((l) => l.part_number === r.part_number);
    const localAvail = localRow?.available ?? 0;
    const otherSites = sites.filter((s) => s.part_number === r.part_number && s.available > 0);
    const vendorRows = vendors.filter((v) => v.part_number === r.part_number);
    const subs = compat.filter((c) => c.part_number === r.part_number);

    let recommended: { source_type: string; detail: string; unit_cost: number; ready_in_hours: number };
    let unavailable = false;

    if (localAvail >= qty) {
      recommended = { source_type: 'LOCAL_SITE', detail: 'In local inventory', unit_cost: 0, ready_in_hours: 0 };
    } else if (otherSites.length) {
      const best = otherSites.sort((a, b) => (a.transfer_hours ?? 99) - (b.transfer_hours ?? 99))[0];
      recommended = { source_type: 'OTHER_SITE', detail: `Transfer from ${best.site_name ?? 'another site'}`, unit_cost: 0, ready_in_hours: best.transfer_hours ?? 8 };
    } else if (vendorRows.length) {
      const best = vendorRows.sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9))[0];
      recommended = { source_type: 'EXTERNAL_VENDOR', detail: `Order from ${best.vendor_name ?? 'vendor'}`, unit_cost: best.price ?? 0, ready_in_hours: best.lead_time_hours ?? 48 };
    } else if (subs.length) {
      recommended = { source_type: 'SUBSTITUTE', detail: `Use substitute ${subs[0].compatible_part_number}`, unit_cost: 0, ready_in_hours: 2 };
    } else {
      recommended = { source_type: 'EXTERNAL_VENDOR', detail: 'No source found — escalate', unit_cost: 0, ready_in_hours: 0 };
      unavailable = true;
    }

    total_cost += recommended.unit_cost * qty;
    ready_by = Math.max(ready_by, recommended.ready_in_hours);

    return {
      part_number: r.part_number,
      part_id: r.part_id ?? '',
      required_qty: qty,
      available_at_site: localAvail,
      available_other_sites: otherSites,
      external_vendors: vendorRows,
      compatible_substitutes: subs.map((s) => ({ part_number: s.compatible_part_number, notes: s.notes })),
      recommended,
      unavailable,
      estimated_delivery_hours: recommended.ready_in_hours,
    };
  });

  return {
    matrix,
    total_cost_inr: total_cost,
    ready_by_hours: ready_by,
    notes: 'Rule-based sourcing: cheapest acceptable source selected per part.',
  };
}
