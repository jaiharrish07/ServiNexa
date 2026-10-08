import { supabase } from '../config/supabase';
import { callAIService } from './ai-client';
import { classifyStub } from '../ai-stubs/classify.stub';
import { predictStub } from '../ai-stubs/predict.stub';
import { matchStub } from '../ai-stubs/match.stub';
import { computeImpact } from './impact.service';
import { searchSimilar } from './knowledge.service';
import { hasTechnicianCapacity } from '../utils/technician';
import { createNotifications } from './notifications';

/**
 * AI Orchestration Pipeline — the intelligent core of ServiNexa.
 *
 * When a service request transitions to SUBMITTED, this pipeline auto-runs a
 * multi-step AI triage instead of requiring ops to manually click four separate
 * AI buttons:
 *
 *   Step 1 — Classify (category, priority, sub_category)
 *   Step 2 — Impact Analysis (cascading risk + INR exposure)
 *   Step 3 — Predictive Diagnosis (failure probability + recommended action)
 *   Step 4 — Knowledge Lookup (similar past cases)
 *   Step 5 — Technician Matching (ranked suggestions)
 *
 * Each step persists its results and feeds into the next. The whole pipeline is
 * fire-and-forget (non-fatal) — a failure in any step logs a warning and
 * continues with the remaining steps.
 */

export interface PipelineResult {
  request_id: string;
  steps_completed: string[];
  steps_failed: string[];
  classify?: any;
  impact?: any;
  predict?: any;
  knowledge?: any;
  match?: any;
}

export async function runTriagePipeline(serviceRequestId: string): Promise<PipelineResult> {
  const result: PipelineResult = {
    request_id: serviceRequestId,
    steps_completed: [],
    steps_failed: [],
  };

  // Load the service request with its machine
  const { data: sr } = await supabase
    .from('service_requests')
    .select('*, machines(id, code, name, type, site_id, air_temp, process_temp, rotational_speed, torque, tool_wear)')
    .eq('id', serviceRequestId)
    .single();

  if (!sr) {
    result.steps_failed.push('LOAD');
    return result;
  }

  // ── Step 1: Classify ──────────────────────────────────────────────────────
  let classification: any = null;
  try {
    const aiResult = await callAIService<any>('/ai/classify-request', {
      description: sr.description ?? '',
    });
    classification = aiResult.data ?? classifyStub(sr.description ?? '');
    const source = aiResult.data ? 'ai' : 'stub';

    // Persist classification onto the service request
    const updatePayload: Record<string, any> = {
      ai_category: classification.category,
      ai_sub_category: classification.sub_category,
      ai_priority: classification.priority,
      ai_confidence: classification.confidence,
      ai_urgency_score: classification.urgency_score,
      ai_triage_source: source,
      ai_triage_at: new Date().toISOString(),
    };

    // If AI suggests higher priority than user-submitted, elevate it
    const PRIORITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    const aiRank = PRIORITY_RANK[classification.priority] ?? 0;
    const userRank = PRIORITY_RANK[sr.priority] ?? 0;
    if (aiRank > userRank) {
      updatePayload.priority = classification.priority;
      // Recalculate SLA with elevated priority
      const SLA_HOURS: Record<string, number> = { CRITICAL: 4, HIGH: 8, MEDIUM: 24, LOW: 72 };
      if (SLA_HOURS[classification.priority]) {
        updatePayload.sla_deadline = new Date(
          Date.now() + SLA_HOURS[classification.priority] * 60 * 60 * 1000
        ).toISOString();
      }
    }

    // Persist category if the request didn't already have one
    if (!sr.category || sr.category === 'OTHER') {
      updatePayload.category = classification.category;
    }

    await supabase
      .from('service_requests')
      .update(updatePayload)
      .eq('id', serviceRequestId);

    result.classify = { ...classification, source };
    result.steps_completed.push('CLASSIFY');
  } catch (err: any) {
    console.error('[orchestrator] classify failed:', err?.message);
    result.steps_failed.push('CLASSIFY');
  }

  // ── Step 2: Impact Analysis ───────────────────────────────────────────────
  if (sr.machine_id) {
    try {
      const impact = await computeImpact(sr.machine_id, serviceRequestId);

      // If impact is critical (score >= 70), elevate priority to at least HIGH
      if ((impact.cascading_impact_score ?? 0) >= 70) {
        const PRIORITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        const currentPriority = classification?.priority ?? sr.priority;
        if ((PRIORITY_RANK[currentPriority] ?? 0) < 3) {
          await supabase
            .from('service_requests')
            .update({ priority: 'HIGH' })
            .eq('id', serviceRequestId);
        }
      }

      result.impact = impact;
      result.steps_completed.push('IMPACT');
    } catch (err: any) {
      console.error('[orchestrator] impact failed:', err?.message);
      result.steps_failed.push('IMPACT');
    }
  }

  // ── Step 3: Predictive Diagnosis ──────────────────────────────────────────
  const machine = sr.machines;
  if (machine) {
    try {
      const sensorData = {
        air_temp: machine.air_temp ?? 25,
        process_temp: machine.process_temp ?? 35,
        rotational_speed: machine.rotational_speed ?? 1500,
        torque: machine.torque ?? 40,
        tool_wear: machine.tool_wear ?? 100,
      };

      const aiResult = await callAIService<any>('/ai/predict-health', sensorData);
      const prediction = aiResult.data ?? predictStub(sensorData);
      const source = aiResult.data ? 'ai' : 'stub';

      // Persist prediction linked to this request
      await supabase.from('ai_predictions').insert({
        service_request_id: serviceRequestId,
        machine_id: sr.machine_id,
        failure_probability: prediction.failure_probability ?? prediction.risk_score ?? 0,
        risk_level: prediction.risk_level ?? 'UNKNOWN',
        predicted_failure_mode: prediction.predicted_failure_mode ?? '',
        recommended_action: prediction.recommended_action ?? '',
        confidence: prediction.confidence ?? 0,
        source,
        created_at: new Date().toISOString(),
      }).single();

      result.predict = { ...prediction, source };
      result.steps_completed.push('PREDICT');
    } catch (err: any) {
      console.error('[orchestrator] predict failed:', err?.message);
      result.steps_failed.push('PREDICT');
    }
  }

  // ── Step 4: Knowledge Base Lookup ─────────────────────────────────────────
  try {
    const category = classification?.category ?? sr.category;
    const sub_category = classification?.sub_category ?? sr.ai_sub_category;
    const machine_type = machine?.type;

    const knowledge = await searchSimilar({
      category,
      sub_category,
      machine_type,
      description: sr.description,
    });

    // Persist the top matches as a reference on the SR
    const topMatches = knowledge.matches ?? knowledge.top_matches ?? [];
    if (topMatches.length > 0) {
      await supabase
        .from('service_requests')
        .update({
          ai_knowledge_matches: topMatches.slice(0, 3),
          ai_knowledge_source: knowledge.source,
        })
        .eq('id', serviceRequestId);
    }

    result.knowledge = { matches: topMatches, source: knowledge.source };
    result.steps_completed.push('KNOWLEDGE');
  } catch (err: any) {
    console.error('[orchestrator] knowledge failed:', err?.message);
    result.steps_failed.push('KNOWLEDGE');
  }

  // ── Step 5: Technician Matching ───────────────────────────────────────────
  try {
    const { data: technicians } = await supabase
      .from('technicians')
      .select('*, users(full_name)')
      .eq('is_available', true);

    const eligible = (technicians ?? []).filter(hasTechnicianCapacity);

    if (eligible.length > 0) {
      // Rebuild SR with latest AI-enriched data
      const { data: enrichedSr } = await supabase
        .from('service_requests')
        .select('*')
        .eq('id', serviceRequestId)
        .single();

      const payload = {
        request: enrichedSr ?? sr,
        technicians: eligible.map((t: any) => ({
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

      const aiResult = await callAIService<any>('/ai/match-technician', payload);
      const matchResult = aiResult.data ?? matchStub(eligible, enrichedSr ?? sr);
      const source = aiResult.data ? 'ai' : 'stub';

      // Persist the top 3 recommended technicians
      const ranked = matchResult.ranked_technicians ?? [];
      await supabase
        .from('service_requests')
        .update({
          ai_recommended_technicians: ranked.slice(0, 3),
          ai_match_source: source,
        })
        .eq('id', serviceRequestId);

      result.match = { ranked_technicians: ranked, source };
      result.steps_completed.push('MATCH');
    }
  } catch (err: any) {
    console.error('[orchestrator] match failed:', err?.message);
    result.steps_failed.push('MATCH');
  }

  // ── Persist pipeline summary ──────────────────────────────────────────────
  try {
    await supabase
      .from('service_requests')
      .update({
        ai_pipeline_status: result.steps_failed.length === 0 ? 'COMPLETE' : 'PARTIAL',
        ai_pipeline_completed_at: new Date().toISOString(),
        ai_pipeline_steps: {
          completed: result.steps_completed,
          failed: result.steps_failed,
        },
      })
      .eq('id', serviceRequestId);

    // Notify ops managers that AI triage is complete
    const { data: opsUsers } = await supabase
      .from('users')
      .select('id')
      .in('role', ['OPS_MANAGER', 'ADMIN']);

    if (opsUsers?.length) {
      const rn = sr.request_number ?? serviceRequestId.slice(0, 8);
      const stepsMsg = result.steps_completed.join(' → ');
      await createNotifications(
        opsUsers.map((u: any) => ({
          user_id: u.id,
          title: `AI Triage Complete: ${rn}`,
          message: `Pipeline finished (${result.steps_completed.length}/${result.steps_completed.length + result.steps_failed.length} steps): ${stepsMsg}`,
          type: 'INFO' as const,
          related_entity_type: 'service_request',
          related_entity_id: serviceRequestId,
        }))
      );
    }
  } catch (err: any) {
    console.error('[orchestrator] summary persist failed:', err?.message);
  }

  console.log(
    `[orchestrator] pipeline for ${serviceRequestId}: ` +
    `completed=[${result.steps_completed}] failed=[${result.steps_failed}]`
  );

  return result;
}
