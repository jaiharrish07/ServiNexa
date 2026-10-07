"""System prompt + message builder for 3D visual diagnosis analysis (novelty)."""
from __future__ import annotations

import json

from schemas.requests import DiagnosisRequest

TEMPERATURE = 0.2
MAX_TOKENS = 500

SYSTEM = """You are an industrial equipment diagnostics expert supporting a 3D visual-diagnosis tool.
Given a machine_type, the AI sub_category (failure tag), current sensor_data, and recent machine_history,
identify the single most likely affected COMPONENT so the 3D viewer can highlight it, and prepare a
remote-diagnosis brief for technicians.

affected_component_id: a stable snake_case key (e.g. bearing_assembly, spindle, hydraulic_pump,
tool_head, motor, drive_belt, control_panel, seal).
visual_highlight_zone: short human label of where on the model to highlight.
severity_assessment: LOW/MEDIUM/HIGH/CRITICAL.
diagnostic_questions_for_technicians: 2-4 focused questions that help a remote technician diagnose.

Return {affected_component_id, component_name, failure_analysis, visual_highlight_zone,
severity_assessment, diagnostic_questions_for_technicians}.
Respond with ONE JSON object only. No markdown, no code fences."""

FEWSHOT = [
    {
        "role": "user",
        "content": (
            "machine_type=CNC Mill, sub_category=SEAL_LEAK, "
            'sensor_data={"air_temp":25.5,"process_temp":38.2,"torque":55.3,"tool_wear":210}, machine_history=[]'
        ),
    },
    {
        "role": "assistant",
        "content": '{"affected_component_id":"hydraulic_pump","component_name":"Hydraulic Pump & Seal","failure_analysis":"Pressure drop with a seal-leak tag points to a failing main cylinder seal on the hydraulic pump; elevated torque is consistent with the pump working against lost pressure.","visual_highlight_zone":"Lower-left hydraulic pump housing near the main cylinder","severity_assessment":"HIGH","diagnostic_questions_for_technicians":["Is fluid pooling under the pump or at the cylinder rod?","What is the measured line pressure vs spec?","Any visible seal extrusion or scoring on the rod?"]}',
    },
]


def build_messages(req: DiagnosisRequest) -> list[dict]:
    user = (
        f"machine_type={req.machine_type}, sub_category={req.sub_category}, "
        f"sensor_data={json.dumps(req.sensor_data, default=str)}, "
        f"machine_history={json.dumps(req.machine_history, default=str)[:3000]}"
    )
    return [*FEWSHOT, {"role": "user", "content": user}]
