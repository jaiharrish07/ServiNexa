"""Central configuration for the ServiNexa AI service.

All AI is LLM-orchestrated via GroqCloud (GPT-OSS 20B). No trained ML models.
"""
from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


# ─── GroqCloud (OpenAI-compatible) ───
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")

# ─── Free-tier limits (enforced by rate_limiter) ───
GROQ_RPM = _int("GROQ_RPM", 30)
GROQ_TPM = _int("GROQ_TPM", 8000)
GROQ_DAILY_REQUESTS = _int("GROQ_DAILY_REQUESTS", 1000)
GROQ_DAILY_TOKENS = _int("GROQ_DAILY_TOKENS", 200_000)

PORT = _int("PORT", 8000)
# Comma-separated allowlist; "*" (default) is fine because the only caller is the
# trusted Express backend on a private network.
CORS_ORIGINS = os.environ.get("AI_CORS_ORIGINS", "*")

# ─── Priority tiers (see rate_limiter) ───
# P0: user-blocking, never dropped.  P1: ops action.  P2: background → serve stub
# (HTTP 502 so Express falls back) when the per-minute budget is exhausted.
PRIORITY = {
    "classify-request": "P0",
    "predict-health": "P0",
    "match-technician": "P1",
    "impact-analyze": "P1",
    "score-bids": "P1",
    "parts-sourcing": "P1",
    "analyze-diagnosis": "P1",
    "detect-anomalies": "P2",
    "knowledge-match": "P2",
}

# ─── Cache TTLs (seconds); 0 / absent = not cached ───
CACHE_TTL = {
    "classify-request": 3600,
    "predict-health": 600,
    "detect-anomalies": 600,
    "impact-analyze": 300,
    "parts-sourcing": 300,
    "knowledge-match": 3600,
    # match / score-bids / analyze-diagnosis: not cached (context varies every call)
}

# ─── AI4I 2020 statistical baselines ───
# IMPORTANT: expressed in °C to match the platform's stored machine sensor data
# (seed stores air_temp≈25.5, process_temp≈38.2 — Celsius, NOT the raw dataset's Kelvin).
# Means below are the Kelvin dataset values converted to Celsius.
AI4I_BASELINES = {
    "air_temp_c": {"mean": 26.9, "std": 2.0, "normal": (24.0, 30.0)},
    "process_temp_c": {"mean": 36.9, "std": 1.5, "normal": (34.0, 41.0)},
    # process_temp - air_temp normally 8-12 °C; >12 suggests heat-dissipation trouble.
    "temp_diff_c": {"normal_max": 12.0},
    "rotational_speed_rpm": {"mean": 1539, "std": 179, "normal": (1200, 2400)},
    "torque_nm": {"mean": 40.0, "std": 10.0, "normal": (20.0, 60.0)},
    "tool_wear_min": {"caution": 200, "max": 240},
}

FAILURE_MODES = {
    "TWF": "Tool Wear Failure — tool_wear beyond ~200 min",
    "HDF": "Heat Dissipation Failure — (process_temp - air_temp) > ~12 °C with low speed",
    "PWF": "Power Failure — torque*speed power proxy outside ~3500-9000 W",
    "OSF": "Overstrain Failure — worn tool under high torque",
    "RNF": "Random Failure — rare baseline",
}
