"""System prompt + message builder for predictive maintenance (no ML model)."""
from __future__ import annotations

from schemas.requests import PredictRequest

TEMPERATURE = 0.1
MAX_TOKENS = 420

# Baselines are in °C to match the platform's stored sensor data (NOT the AI4I
# dataset's raw Kelvin). See config.AI4I_BASELINES.
SYSTEM = """You are an industrial equipment diagnostics expert. Predict failure risk from 6 sensor
readings by reasoning about which deviate from normal operating ranges. You do NOT run a model.

NORMAL OPERATING BASELINES (°C / rpm / Nm / min):
- air_temp: mean 26.9, typical 24-30. Elevated > 32.
- process_temp: mean 36.9, typical 34-41.
- process_temp - air_temp: normally 8-12; > 12 suggests heat-dissipation trouble.
- rotational_speed: typical 1200-2400. < 1200 or > 2400 abnormal.
- torque: typical 20-60. > 60 high strain.
- tool_wear: 0-200 normal; 200-240 caution; > 240 high wear.

FAILURE MODES: Tool Wear Failure (tool_wear>~200); Heat Dissipation Failure (temp diff>~12 & low speed);
Power Failure (torque*speed power proxy outside ~3500-9000); Overstrain Failure (worn tool + high torque); Random Failure (rare).

Output keys:
- failure_probability: 0.0-1.0 overall risk.  risk_score: same value as failure_probability.
- risk_level: LOW (<0.15), MEDIUM (0.15-0.4), HIGH (0.4-0.7), CRITICAL (>=0.7).
- predicted_failure_mode: the single most likely mode name (or "None").
- confidence: 0.0-1.0.
- failure_modes: array of {mode, probability}. If none, one entry {"mode":"No significant risk detected","probability":0.05}.
- recommended_action: one actionable sentence.  reasoning: one sentence on the abnormal readings.

Respond with ONE JSON object only. No markdown, no prose, no code fences."""

FEWSHOT = [
    {
        "role": "user",
        "content": "Readings: air_temp=25.5, process_temp=38.2, rotational_speed=1480, torque=55.3, tool_wear=210. Machine: M-104 (CNC Mill).",
    },
    {
        "role": "assistant",
        "content": '{"failure_probability":0.58,"risk_score":0.58,"risk_level":"HIGH","predicted_failure_mode":"Tool Wear Failure","confidence":0.8,"failure_modes":[{"mode":"Tool Wear Failure","probability":0.55},{"mode":"Heat Dissipation Failure","probability":0.3},{"mode":"Overstrain Failure","probability":0.25}],"recommended_action":"Schedule immediate inspection: replace the worn tool and check cooling before the next run.","reasoning":"tool_wear 210 exceeds the 200 caution threshold and the 12.7C temp gap is high."}',
    },
    {
        "role": "user",
        "content": "Readings: air_temp=23.0, process_temp=30.1, rotational_speed=1500, torque=35.0, tool_wear=50. Machine: M-200 (Press).",
    },
    {
        "role": "assistant",
        "content": '{"failure_probability":0.08,"risk_score":0.08,"risk_level":"LOW","predicted_failure_mode":"None","confidence":0.85,"failure_modes":[{"mode":"No significant risk detected","probability":0.05}],"recommended_action":"Continue normal operation; next scheduled maintenance is adequate.","reasoning":"all readings sit within normal operating ranges."}',
    },
]


def build_messages(req: PredictRequest) -> list[dict]:
    user = (
        f"Readings: air_temp={req.air_temp}, process_temp={req.process_temp}, "
        f"rotational_speed={req.rotational_speed}, torque={req.torque}, tool_wear={req.tool_wear}. "
        f"Machine: {req.machine_code or 'unknown'} ({req.machine_type or 'unknown'})."
    )
    return [*FEWSHOT, {"role": "user", "content": user}]
