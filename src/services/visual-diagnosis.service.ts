import { supabase } from '../config/supabase';
import { callAIService } from './ai-client';
import { diagnosisStub } from '../ai-stubs/diagnosis.stub';

/**
 * 3D visual diagnosis (Feature 1). Determines the affected component from the AI
 * sub-category + sensor data (stub fallback), creates a visual_diagnoses record,
 * and links it onto the service request.
 */
export async function createVisualDiagnosis(sr: any) {
  const { data: machine } = await supabase
    .from('machines')
    .select('id, type, air_temp, process_temp, torque, tool_wear, rotational_speed')
    .eq('id', sr.machine_id)
    .maybeSingle();

  const machine_type = machine?.type || 'CNC Mill';
  const sub_category = sr.ai_sub_category || sr.category || 'OTHER';
  const sensor_data = machine
    ? {
        air_temp: machine.air_temp,
        process_temp: machine.process_temp,
        torque: machine.torque,
        tool_wear: machine.tool_wear,
        rotational_speed: machine.rotational_speed,
      }
    : {};

  const payload = { machine_type, sub_category, sensor_data, machine_history: [] };
  const ai = await callAIService<any>('/ai/analyze-diagnosis', payload);
  const analysis = ai.data
    ? { ...ai.data, source: 'ai' as const }
    : { ...diagnosisStub({ machine_type, sub_category, sensor_data }), source: 'stub' as const };

  const { data: vd, error } = await supabase
    .from('visual_diagnoses')
    .insert({
      service_request_id: sr.id,
      machine_id: sr.machine_id,
      machine_type,
      affected_component_id: analysis.affected_component_id,
      component_name: analysis.component_name,
      ai_analysis: analysis,
    })
    .select()
    .single();

  if (error) {
    console.error('[visual-diagnosis] insert failed (non-fatal):', error.message);
    return { analysis };
  }

  await supabase
    .from('service_requests')
    .update({ visualization_id: vd.id, ai_sub_category: sub_category })
    .eq('id', sr.id);

  return { ...vd, analysis };
}

/** 3D model data for the viewer: component catalog + which one to highlight. */
export async function get3dData(visualDiagnosisId: string) {
  const { data: vd } = await supabase
    .from('visual_diagnoses')
    .select('*')
    .eq('id', visualDiagnosisId)
    .maybeSingle();
  if (!vd) return null;

  const { data: components } = await supabase
    .from('machine_model_components')
    .select('*')
    .eq('machine_type', vd.machine_type);

  return {
    visual_diagnosis: vd,
    components: components ?? [],
    highlight: {
      component_id: vd.affected_component_id,
      component_name: vd.component_name,
    },
  };
}
