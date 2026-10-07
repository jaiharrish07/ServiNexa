import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler, badRequest, notFound, forbidden } from '../middleware/error-handler';
import { ok, created } from '../utils/api-response';
import { createVisualDiagnosis, get3dData } from '../services/visual-diagnosis.service';
import { resolveTechnicianId } from '../utils/technician';
import { createAuditLog } from '../services/audit';

// Mounted at /api (Feature 1: 3D visual diagnosis + remote expert review).
const router = Router();

// POST /api/visual-diagnoses  { service_request_id }
router.post(
  '/visual-diagnoses',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { service_request_id } = req.body ?? {};
    if (!service_request_id) throw badRequest('service_request_id is required');
    const { data: sr } = await supabase
      .from('service_requests')
      .select('*')
      .eq('id', service_request_id)
      .maybeSingle();
    if (!sr) throw notFound('Service request not found');
    const result = await createVisualDiagnosis(sr);
    created(res, { visual_diagnosis: result });
  })
);

// GET /api/visual-diagnoses/:requestId  (by service request)
router.get(
  '/visual-diagnoses/:requestId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data } = await supabase
      .from('visual_diagnoses')
      .select('*')
      .eq('service_request_id', req.params.requestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    ok(res, { visual_diagnosis: data });
  })
);

// GET /api/visual-diagnoses/:id/3d-data
router.get(
  '/visual-diagnoses/:id/3d-data',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await get3dData(req.params.id);
    if (!data) throw notFound('Visual diagnosis not found');
    ok(res, data);
  })
);

// POST /api/technician-diagnoses  (technician submits a remote diagnosis)
router.post(
  '/technician-diagnoses',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const techId = await resolveTechnicianId(req.user!.id);
    if (!techId) throw forbidden('Only technicians can submit a diagnosis');

    const b = req.body ?? {};
    if (!b.visual_diagnosis_id || !b.diagnosis_text || !b.proposed_solution) {
      throw badRequest('visual_diagnosis_id, diagnosis_text and proposed_solution are required');
    }

    const { data, error } = await supabase
      .from('technician_diagnoses')
      .insert({
        visual_diagnosis_id: b.visual_diagnosis_id,
        technician_id: techId,
        diagnosis_text: b.diagnosis_text,
        proposed_solution: b.proposed_solution,
        parts_needed: b.parts_needed ?? [],
        estimated_cost: b.estimated_cost ?? null,
        estimated_hours: b.estimated_hours ?? null,
        confidence_level: b.confidence_level ?? 'MEDIUM',
      })
      .select()
      .single();
    if (error) throw badRequest(error.message);

    await createAuditLog({
      entity_type: 'technician_diagnosis',
      entity_id: data.id,
      action: 'CREATE',
      performed_by: req.user!.id,
      metadata: { visual_diagnosis_id: b.visual_diagnosis_id },
    });
    await supabase
      .from('visual_diagnoses')
      .update({ status: 'REVIEWING' })
      .eq('id', b.visual_diagnosis_id);

    created(res, { technician_diagnosis: data });
  })
);

// GET /api/technician-diagnoses/:visualDiagnosisId  (all submissions — for review)
router.get(
  '/technician-diagnoses/:visualDiagnosisId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data } = await supabase
      .from('technician_diagnoses')
      .select('*, technicians(employee_code, users(full_name))')
      .eq('visual_diagnosis_id', req.params.visualDiagnosisId)
      .order('submitted_at');
    ok(res, { technician_diagnoses: data ?? [] });
  })
);

// PUT /api/technician-diagnoses/:id/select  (ops picks the winning diagnosis)
router.put(
  '/technician-diagnoses/:id/select',
  authenticate,
  authorize('OPS_MANAGER', 'ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data: diag } = await supabase
      .from('technician_diagnoses')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!diag) throw notFound('Diagnosis not found');

    // Deselect siblings, select this one, close the visual diagnosis.
    await supabase
      .from('technician_diagnoses')
      .update({ is_selected: false })
      .eq('visual_diagnosis_id', diag.visual_diagnosis_id);
    await supabase.from('technician_diagnoses').update({ is_selected: true }).eq('id', diag.id);
    await supabase
      .from('visual_diagnoses')
      .update({ status: 'DIAGNOSIS_COMPLETE' })
      .eq('id', diag.visual_diagnosis_id);

    await createAuditLog({
      entity_type: 'technician_diagnosis',
      entity_id: diag.id,
      action: 'SELECT',
      performed_by: req.user!.id,
    });
    ok(res, { technician_diagnosis: { ...diag, is_selected: true } });
  })
);

export default router;
