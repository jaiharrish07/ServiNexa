import { supabase } from '../config/supabase';
import { sourceParts } from './parts.service';

/**
 * Pre-dispatch parts staging (Feature 5). Given a winning bid's parts list, uses
 * the sourcing engine (Feature 3) to pick the optimal source per part and creates
 * parts_staging records (status IDENTIFIED) to track them to ISSUED.
 */
export async function planStaging(
  serviceRequestId: string,
  siteId: string,
  partsList: Array<{ part_number: string; quantity?: number }>,
  workOrderId?: string
) {
  const parts = (partsList ?? []).filter((p) => p && p.part_number);
  if (!parts.length) return [];

  const partNumbers = parts.map((p) => p.part_number);
  const quantities: Record<string, number> = {};
  for (const p of parts) quantities[p.part_number] = p.quantity ?? 1;

  const sourcing = await sourceParts(partNumbers, siteId, { quantities });
  const matrix: any[] = sourcing.matrix ?? [];

  const rows = parts.map((p) => {
    const rec = matrix.find((m) => m.part_number === p.part_number);
    const sourceType = rec?.recommended?.source_type ?? 'LOCAL_SITE';
    const readyHours = rec?.estimated_delivery_hours ?? rec?.recommended?.ready_in_hours ?? 0;
    return {
      service_request_id: serviceRequestId,
      work_order_id: workOrderId ?? null,
      part_number: p.part_number,
      quantity: p.quantity ?? 1,
      source_type: sourceType,
      status: 'IDENTIFIED',
      eta: new Date(Date.now() + readyHours * 3600 * 1000).toISOString(),
    };
  });

  const { data, error } = await supabase.from('parts_staging').insert(rows).select();
  if (error) {
    console.error('[staging] insert failed (non-fatal):', error.message);
    return [];
  }
  return data ?? [];
}
