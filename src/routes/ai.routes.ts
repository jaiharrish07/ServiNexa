import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { callAIService } from '../services/ai-client';
import { classifyStub } from '../ai-stubs/classify.stub';
import { predictStub } from '../ai-stubs/predict.stub';
import { matchStub } from '../ai-stubs/match.stub';
import { diagnosisStub } from '../ai-stubs/diagnosis.stub';
import { validate } from '../middleware/validate';
import { aiAnomaliesSchema, aiClassifySchema, aiDiagnosisSchema, aiMatchSchema, aiPredictSchema } from '../schemas/features';
import { canAccessSite } from '../utils/access';
import { hasTechnicianCapacity } from '../utils/technician';

const router = Router();

/**
 * POST /classify
 * Classify a service-request description into category + priority.
 * Tries the live AI service, falls back to the rule-based stub.
 */
router.post(
  '/classify',
  authenticate,
  validate({ body: aiClassifySchema }),
  async (req: AuthRequest, res: Response) => {
    try {
      const { description } = req.body ?? {};
      if (!description) {
        return res.status(400).json({ error: 'description is required' });
      }

      const aiResult = await callAIService<Record<string, unknown>>(
        '/ai/classify-request',
        { description }
      );
      if (aiResult.data) {
        return res.json({ ...aiResult.data, source: 'ai' });
      }

      const stub = classifyStub(description);
      return res.json({ ...stub, source: 'stub' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /predict
 * Predict machine health / failure risk from stored sensor readings.
 */
router.post(
  '/predict',
  authenticate,
  validate({ body: aiPredictSchema }),
  async (req: AuthRequest, res: Response) => {
    try {
      const { machine_id } = req.body ?? {};
      if (!machine_id) {
        return res.status(400).json({ error: 'machine_id is required' });
      }

      const { data: machine, error } = await supabase
        .from('machines')
        .select(
          'air_temp, process_temp, rotational_speed, torque, tool_wear, code, name, site_id'
        )
        .eq('id', machine_id)
        .single();

      if (error || !machine) {
        return res.status(404).json({ error: 'Machine not found' });
      }
      if (!await canAccessSite(machine.site_id, req.user!)) return res.status(404).json({ error: 'Machine not found' });

      const sensorData = {
        air_temp: machine.air_temp ?? 25,
        process_temp: machine.process_temp ?? 35,
        rotational_speed: machine.rotational_speed ?? 1500,
        torque: machine.torque ?? 40,
        tool_wear: machine.tool_wear ?? 100,
      };

      const aiResult = await callAIService<Record<string, unknown>>(
        '/ai/predict-health',
        sensorData
      );
      if (aiResult.data) {
        return res.json({
          ...aiResult.data,
          machine_code: machine.code,
          source: 'ai',
        });
      }

      const stub = predictStub(sensorData);
      return res.json({
        ...stub,
        machine_code: machine.code,
        source: 'stub',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /match
 * Rank available technicians for a given service request.
 */
router.post('/match', authenticate, authorize('ADMIN', 'OPS_MANAGER'), validate({ body: aiMatchSchema }), async (req: AuthRequest, res: Response) => {
  try {
    const { service_request_id } = req.body ?? {};
    if (!service_request_id) {
      return res.status(400).json({ error: 'service_request_id is required' });
    }

    const { data: sr, error: srError } = await supabase
      .from('service_requests')
      .select('*')
      .eq('id', service_request_id)
      .single();

    if (srError || !sr) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    const { data: technicians, error: techError } = await supabase
      .from('technicians')
      .select('*, users(full_name)')
      .eq('is_available', true);

    if (techError) {
      return res.status(500).json({ error: techError.message });
    }

    const eligibleTechnicians = (technicians ?? []).filter(hasTechnicianCapacity);
    if (eligibleTechnicians.length === 0) {
      return res.json({
        ranked_technicians: [],
        message: 'No available technicians',
      });
    }

    const payload = {
      request: sr,
      technicians: eligibleTechnicians.map((t: any) => ({
        id: t.id,
        employee_code: t.employee_code,
        name: t.users?.full_name,
        specializations: t.specializations,
        certifications: t.certifications,
        current_job_count: t.current_job_count,
        max_concurrent_jobs: t.max_concurrent_jobs,
        avg_resolution_hours: t.avg_resolution_hours,
        rating: t.rating,
        site_id: t.site_id,
        is_available: t.is_available,
      })),
    };

    const aiResult = await callAIService<Record<string, unknown>>(
      '/ai/match-technician',
      payload
    );
    const techMap = new Map(eligibleTechnicians.map((t: any) => [t.id, t]));
    const enrichRanked = (ranked: any[]) =>
      ranked.map((r: any) => {
        const tech = techMap.get(r.technician_id);
        return {
          ...r,
          name: r.name ?? tech?.users?.full_name ?? tech?.employee_code ?? 'Technician',
          specializations: r.specializations ?? tech?.specializations ?? [],
        };
      });

    if (aiResult.data) {
      const enriched = {
        ...aiResult.data,
        source: 'ai',
        ranked_technicians: enrichRanked((aiResult.data as any).ranked_technicians ?? []),
      };
      return res.json(enriched);
    }

    const stub = matchStub(eligibleTechnicians, sr);
    return res.json({ ...stub, source: 'stub' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /anomalies
 * Detect anomalies across recent service requests (optionally site-scoped).
 */
router.post(
  '/anomalies',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  validate({ body: aiAnomaliesSchema }),
  async (req: AuthRequest, res: Response) => {
    try {
      const { site_id } = req.body ?? {};

      // Apply filters before transforms so the builder stays a FilterBuilder
      // (type-correct) and the query reads naturally.
      let query = supabase.from('service_requests').select('*');

      if (site_id) {
        query = query.eq('site_id', site_id);
      }

      const { data: requests, error } = await query
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const aiResult = await callAIService<Record<string, unknown>>(
        '/ai/detect-anomalies',
        { service_requests: requests || [] }
      );
      if (aiResult.data) {
        return res.json({ ...aiResult.data, source: 'ai' });
      }

      return res.json({
        anomalies: [],
        summary: 'No anomalies detected (stub mode)',
        source: 'stub',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /analyze-diagnosis
 * 3D visual-diagnosis analysis — identify the affected component + a remote
 * diagnostic brief. Live-first with a rule-based stub fallback.
 */
router.post('/analyze-diagnosis', authenticate, validate({ body: aiDiagnosisSchema }), async (req: AuthRequest, res: Response) => {
  try {
    const { machine_type, sub_category, sensor_data, machine_history } = req.body ?? {};
    if (!machine_type) {
      return res.status(400).json({ error: 'machine_type is required' });
    }

    const aiResult = await callAIService<Record<string, unknown>>('/ai/analyze-diagnosis', {
      machine_type,
      sub_category,
      sensor_data,
      machine_history,
    });
    if (aiResult.data) {
      return res.json({ ...aiResult.data, source: 'ai' });
    }

    const stub = diagnosisStub({ machine_type, sub_category, sensor_data });
    return res.json({ ...stub, source: 'stub' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /pipeline/:id
 * Retrieve the AI triage pipeline results for a service request.
 */
router.get(
  '/pipeline/:id',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from('service_requests')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Service request not found' });
      }
      const sr = data as any;

      // Fetch the prediction if one exists
      const { data: prediction } = await supabase
        .from('ai_predictions' as any)
        .select('*')
        .eq('service_request_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fetch the impact analysis if one exists
      const { data: impact } = await supabase
        .from('impact_analyses')
        .select('*')
        .eq('service_request_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return res.json({
        pipeline_status: sr.ai_pipeline_status ?? 'PENDING',
        completed_at: sr.ai_pipeline_completed_at,
        steps: sr.ai_pipeline_steps ?? {},
        classification: sr.ai_category ? {
          category: sr.ai_category,
          sub_category: sr.ai_sub_category,
          priority: sr.ai_priority,
          confidence: sr.ai_confidence,
          urgency_score: sr.ai_urgency_score,
          source: sr.ai_triage_source,
          classified_at: sr.ai_triage_at,
        } : null,
        impact: impact ? {
          cascading_impact_score: sr.cascading_impact_score,
          impact_inr: sr.impact_inr,
          cascade_depth: (impact as any).cascade_depth,
          affected_machines: (impact as any).affected_machines,
          source: (impact as any).source,
        } : null,
        prediction: prediction ?? null,
        knowledge_matches: sr.ai_knowledge_matches ?? [],
        recommended_technicians: sr.ai_recommended_technicians ?? [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /pipeline/:id/rerun
 * Manually re-trigger the AI triage pipeline for a service request.
 */
router.post(
  '/pipeline/:id/rerun',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { data: sr } = await supabase
        .from('service_requests')
        .select('id')
        .eq('id', id)
        .single();

      if (!sr) {
        return res.status(404).json({ error: 'Service request not found' });
      }

      await supabase
        .from('service_requests')
        .update({ ai_pipeline_status: 'RUNNING' } as any)
        .eq('id', id);

      const { runTriagePipeline } = await import('../services/ai-orchestrator');
      const result = await runTriagePipeline(id);

      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  }
);

export default router;
