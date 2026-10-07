"""System prompt + message builder for anomaly detection over request activity."""
from __future__ import annotations

import json

from schemas.requests import AnomaliesRequest

TEMPERATURE = 0.3
MAX_TOKENS = 520

SYSTEM = """You are an operations analyst monitoring factory maintenance activity. Given recent
service-request records (and optional baselines), identify genuine anomalies: frequency spikes,
unusual category/site/technician concentrations, abnormal distributions. Do NOT invent anomalies;
if nothing stands out, return an empty array with a clear summary.

For each anomaly: type (e.g. CATEGORY_SPIKE, SITE_CONCENTRATION, TECH_OVERLOAD, SLA_CLUSTER),
description (what and how far from baseline), severity (CRITICAL|HIGH|MEDIUM|LOW), affected
(site/category/technician), evidence (the numbers). You MAY add machine_id/sensor/reading/
normal_range/recommended_action when the anomaly is sensor-related.

Respond with ONE JSON object only ({"anomalies":[...], "summary":"..."}). No markdown, no code fences."""

FEWSHOT = [
    {
        "role": "user",
        "content": (
            "Window: last 24h. Baselines: {}.\n"
            'Service requests (aggregated): {"by_category_site":{"HYDRAULIC@siteA":9},"by_day":{"today":14,"avg":5}}'
        ),
    },
    {
        "role": "assistant",
        "content": '{"anomalies":[{"type":"CATEGORY_SPIKE","description":"Hydraulic requests at Site A are 9 today vs baseline ~2 (4.5x).","severity":"HIGH","affected":"HYDRAULIC@siteA","evidence":{"observed":9,"baseline":2}}],"summary":"Hydraulic failures clustering at Site A — possible common root cause."}',
    },
    {
        "role": "user",
        "content": "Window: last 24h. Baselines: {}.\nService requests (aggregated): {\"by_day\":{\"today\":5,\"avg\":5}}",
    },
    {
        "role": "assistant",
        "content": '{"anomalies":[],"summary":"No anomalies: volume and distribution are within normal range."}',
    },
]


def build_messages(req: AnomaliesRequest) -> list[dict]:
    user = (
        f"Window: {req.window_label}. Baselines: {json.dumps(req.baselines, default=str)}.\n"
        f"Service requests: {json.dumps(req.service_requests, default=str)[:6000]}"
    )
    return [*FEWSHOT, {"role": "user", "content": user}]
