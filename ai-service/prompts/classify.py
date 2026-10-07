"""System prompt + message builder for service-request classification."""
from __future__ import annotations

from schemas.requests import ClassifyRequest

TEMPERATURE = 0.1
MAX_TOKENS = 220

SYSTEM = """You are an industrial equipment maintenance intake expert at a multi-site factory.
Classify a free-text service request and assess urgency.

category MUST be exactly one of:
MECHANICAL, ELECTRICAL, HYDRAULIC, PNEUMATIC, SOFTWARE, CALIBRATION, SAFETY, PREVENTIVE, OTHER
priority MUST be exactly one of: CRITICAL, HIGH, MEDIUM, LOW
sub_category: SHORT UPPER_SNAKE_CASE failure tag (e.g. SEAL_LEAK, BEARING_THERMAL, WIRING_FAULT, TOOL_WEAR, OVERHEAT, CALIBRATION_DRIFT); use OTHER if unclear.
estimated_complexity: one of LOW, MEDIUM, HIGH.
urgency_score: 0.0-1.0.  confidence: 0.0-1.0.
suggested_sla_hours: integer (CRITICAL~4, HIGH~8, MEDIUM~24, LOW~72).

Priority rules: injury/fire/safety = CRITICAL; production-stopping or rapidly worsening = HIGH; degraded but running = MEDIUM; routine/preventive = LOW.
reasoning: one short sentence citing the key phrase.

Respond with ONE JSON object only. No markdown, no prose, no code fences."""

FEWSHOT = [
    {
        "role": "user",
        "content": 'Service request:\n"""The hydraulic system on CNC Mill M-104 is leaking fluid near the main cylinder and pressure is dropping with grinding noises."""',
    },
    {
        "role": "assistant",
        "content": '{"category":"HYDRAULIC","sub_category":"SEAL_LEAK","priority":"HIGH","confidence":0.88,"urgency_score":0.8,"estimated_complexity":"MEDIUM","suggested_sla_hours":8,"reasoning":"\'leaking fluid\' and \'pressure dropping\' indicate a hydraulic seal failure degrading operation."}',
    },
    {
        "role": "user",
        "content": 'Service request:\n"""Smoke coming from the control panel of the welding robot, smells like burning plastic."""',
    },
    {
        "role": "assistant",
        "content": '{"category":"SAFETY","sub_category":"ELECTRICAL_FIRE","priority":"CRITICAL","confidence":0.95,"urgency_score":0.98,"estimated_complexity":"HIGH","suggested_sla_hours":4,"reasoning":"\'smoke\' and \'burning\' from an electrical panel is an immediate fire hazard."}',
    },
]


def build_messages(req: ClassifyRequest) -> list[dict]:
    return [*FEWSHOT, {"role": "user", "content": f'Service request:\n"""{req.description}"""'}]
