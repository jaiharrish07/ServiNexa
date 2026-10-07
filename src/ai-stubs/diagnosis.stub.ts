/**
 * Rule-based fallback for the 3D visual-diagnosis analysis (Feature 1).
 * Output matches the Python `/ai/analyze-diagnosis` response so live AI and this
 * stub are interchangeable for the 3D viewer + remote-diagnosis flow.
 */
export interface DiagnosisResult {
  affected_component_id: string;
  component_name: string;
  failure_analysis: string;
  visual_highlight_zone: string;
  severity_assessment: string;
  diagnostic_questions_for_technicians: string[];
}

// sub_category → component to highlight on the generic 3D model.
const COMPONENT_MAP: Record<string, { id: string; name: string; zone: string }> = {
  SEAL_LEAK: { id: 'hydraulic_pump', name: 'Hydraulic Pump & Seal', zone: 'Lower-left hydraulic pump housing' },
  BEARING_THERMAL: { id: 'bearing_assembly', name: 'Main Bearing Assembly', zone: 'Central bearing housing' },
  MECHANICAL_NOISE: { id: 'bearing_assembly', name: 'Main Bearing Assembly', zone: 'Central bearing housing' },
  WIRING_FAULT: { id: 'control_panel', name: 'Control Panel / Wiring', zone: 'Side electrical control panel' },
  ELECTRICAL_FIRE: { id: 'control_panel', name: 'Control Panel / Wiring', zone: 'Side electrical control panel' },
  TOOL_WEAR: { id: 'tool_head', name: 'Tool Head', zone: 'Upper tool head / spindle tip' },
  OVERHEAT: { id: 'motor', name: 'Drive Motor', zone: 'Rear drive motor' },
  CALIBRATION_DRIFT: { id: 'spindle', name: 'Spindle Assembly', zone: 'Upper spindle assembly' },
  AIR_PRESSURE: { id: 'pneumatic_valve', name: 'Pneumatic Valve', zone: 'Pneumatic manifold' },
};

const DEFAULT = { id: 'main_body', name: 'Main Assembly', zone: 'Machine body (component undetermined)' };

export function diagnosisStub(input: {
  machine_type?: string;
  sub_category?: string;
  sensor_data?: Record<string, unknown>;
}): DiagnosisResult {
  const key = (input.sub_category || 'OTHER').toUpperCase();
  const comp = COMPONENT_MAP[key] ?? DEFAULT;
  const sub = input.sub_category || 'the reported issue';

  return {
    affected_component_id: comp.id,
    component_name: comp.name,
    failure_analysis: `Rule-based: ${sub} on a ${input.machine_type || 'machine'} most likely originates at the ${comp.name.toLowerCase()}.`,
    visual_highlight_zone: comp.zone,
    severity_assessment: key.includes('FIRE') || key.includes('SAFETY') ? 'CRITICAL' : 'MEDIUM',
    diagnostic_questions_for_technicians: [
      `Is there any visible damage or wear at the ${comp.name.toLowerCase()}?`,
      'What do the current sensor readings indicate versus normal operating ranges?',
      'Has this component been serviced recently?',
    ],
  };
}
