"""Contract tests for the AI service.

Two kinds:
  1. Without Groq configured → every endpoint returns 502 (so Express falls back to its stub).
  2. With pipeline.chat_json monkeypatched to canned JSON → the full prompt→parse→schema
     pipeline produces a valid, schema-correct response for each endpoint.

Run from ai-service/:  python -m pytest -q
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

import cache as cache_mod
import pipeline
from main import app
from rate_limiter import limiter

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset():
    # Isolate rate-limiter + caches between tests.
    limiter._req_times.clear()
    limiter._tok_events.clear()
    limiter._day_req = 0
    limiter._day_tok = 0
    for c in cache_mod._caches.values():
        c.clear()
    yield


def _patch_llm(monkeypatch, payload: dict):
    async def fake_chat_json(system, messages, max_tokens, temperature=0.2):
        return json.dumps(payload)

    monkeypatch.setattr(pipeline, "chat_json", fake_chat_json)


# ─────────────────────────── health ───────────────────────────
def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "servinexa-ai"


def test_ready_reports_budget():
    r = client.get("/health/ready")
    assert r.status_code == 200
    assert "budget" in r.json()


# ─────────────────────────── stub-fallback contract ───────────────────────────
def test_endpoint_502_on_llm_failure(monkeypatch):
    # Any LLM failure → 502 so Express falls back to its TS stub. Deterministic
    # (forced failure) so it holds whether or not a GROQ_API_KEY is configured.
    async def boom(*_a, **_k):
        raise RuntimeError("groq down")

    monkeypatch.setattr(pipeline, "chat_json", boom)
    r = client.post("/ai/classify-request", json={"description": "hydraulic leak"})
    assert r.status_code == 502


# ─────────────────────────── full pipeline with mocked LLM ───────────────────────────
def test_classify_ok(monkeypatch):
    _patch_llm(monkeypatch, {
        "category": "HYDRAULIC", "sub_category": "SEAL_LEAK", "priority": "HIGH",
        "confidence": 0.9, "urgency_score": 0.8, "estimated_complexity": "MEDIUM",
        "suggested_sla_hours": 8, "reasoning": "leak",
    })
    r = client.post("/ai/classify-request", json={"description": "hydraulic leak, pressure drop"})
    assert r.status_code == 200
    body = r.json()
    assert body["category"] == "HYDRAULIC"
    assert body["sub_category"] == "SEAL_LEAK"
    assert body["priority"] == "HIGH"


def test_predict_ok(monkeypatch):
    _patch_llm(monkeypatch, {
        "failure_probability": 0.58, "risk_score": 0.58, "risk_level": "HIGH",
        "predicted_failure_mode": "Tool Wear Failure", "confidence": 0.8,
        "failure_modes": [{"mode": "Tool Wear Failure", "probability": 0.55}],
        "recommended_action": "inspect", "reasoning": "worn",
    })
    r = client.post("/ai/predict-health", json={
        "air_temp": 25.5, "process_temp": 38.2, "rotational_speed": 1480, "torque": 55.3, "tool_wear": 210,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["risk_level"] == "HIGH"
    assert body["failure_probability"] == 0.58
    assert body["failure_modes"][0]["mode"] == "Tool Wear Failure"


def test_match_ok(monkeypatch):
    _patch_llm(monkeypatch, {
        "ranked_technicians": [
            {"technician_id": "t1", "score": 94, "match_score": 94, "reasoning": "best",
             "factors": {"skill_match": 95, "proximity": 100, "workload": 67, "experience": 90, "certification": 80}}
        ]
    })
    r = client.post("/ai/match-technician", json={
        "request": {"category": "HYDRAULIC", "site_id": "A"},
        "technicians": [{"id": "t1", "is_available": True}],
    })
    assert r.status_code == 200
    assert r.json()["ranked_technicians"][0]["technician_id"] == "t1"


def test_anomalies_ok(monkeypatch):
    _patch_llm(monkeypatch, {"anomalies": [], "summary": "nothing unusual"})
    r = client.post("/ai/detect-anomalies", json={"service_requests": []})
    assert r.status_code == 200
    assert r.json()["summary"] == "nothing unusual"


def test_bids_ok(monkeypatch):
    _patch_llm(monkeypatch, {
        "ranked_bids": [{"bid_id": "b1", "overall_score": 89, "recommendation": "ACCEPT", "justification": "cheap+fast"}],
        "winner_bid_id": "b1",
    })
    r = client.post("/ai/score-bids", json={"bids": [{"bid_id": "b1"}]})
    assert r.status_code == 200
    assert r.json()["winner_bid_id"] == "b1"


def test_parts_ok(monkeypatch):
    _patch_llm(monkeypatch, {
        "matrix": [{"part_number": "HS-100", "required_qty": 2, "recommended": {"source_type": "OTHER_SITE"}, "unavailable": False, "substitutes": []}],
        "total_cost_inr": 90, "ready_by_hours": 4, "notes": "transfer",
    })
    r = client.post("/ai/parts-sourcing", json={"required": [{"part_number": "HS-100", "quantity": 2}]})
    assert r.status_code == 200
    assert r.json()["matrix"][0]["part_number"] == "HS-100"


def test_knowledge_ok(monkeypatch):
    _patch_llm(monkeypatch, {
        "similar_cases": [{"entry_id": "k1", "solution_summary": "seal kit", "success": True, "relevance": 0.95}],
        "suggested_solutions": ["Replace seal"], "avg_resolution_time": 3,
    })
    r = client.post("/ai/knowledge-match", json={"category": "HYDRAULIC", "description": "leak"})
    assert r.status_code == 200
    assert r.json()["similar_cases"][0]["entry_id"] == "k1"


def test_diagnosis_ok(monkeypatch):
    _patch_llm(monkeypatch, {
        "affected_component_id": "hydraulic_pump", "component_name": "Hydraulic Pump",
        "failure_analysis": "seal", "visual_highlight_zone": "pump", "severity_assessment": "HIGH",
        "diagnostic_questions_for_technicians": ["Where is the fluid pooling?"],
    })
    r = client.post("/ai/analyze-diagnosis", json={"machine_type": "CNC Mill", "sub_category": "SEAL_LEAK"})
    assert r.status_code == 200
    assert r.json()["affected_component_id"] == "hydraulic_pump"


def test_impact_two_step_ok(monkeypatch):
    # Step A returns ordered_chain; Step B returns the full tree. Same patched fn
    # returns both keys; each model ignores the extras it doesn't declare.
    _patch_llm(monkeypatch, {
        "ordered_chain": [{"machine_id": "m200", "machine_code": "M-200", "depth": 1, "throughput_rate": 40, "unit_value": 1200}],
        "root_machine_id": "m104", "downstream_count": 1, "cascade_depth": 1,
        "affected_machines": ["M-200"], "production_lines": ["Line 1"],
        "total_units_lost_per_hour": 40, "total_hourly_impact_inr": 48000,
        "total_penalty_at_risk_inr": 0, "cascading_impact_score": 70,
        "sla_risk_level": "HIGH", "recommended_priority_override": "HIGH",
        "breakdown_by_machine": [{"machine_code": "M-200", "inr_per_hour": 48000}],
        "tree": {"machine_id": "m104", "machine_code": "M-104", "depth": 0, "children": []},
    })
    r = client.post("/ai/impact-analyze", json={"machine_id": "m104", "machine_code": "M-104", "edges": []})
    assert r.status_code == 200
    body = r.json()
    assert body["total_hourly_impact_inr"] == 48000
    assert body["root_machine_id"] == "m104"


# ─────────────────────────── json_utils + rate limiter units ───────────────────────────
def test_json_recovery_and_failure():
    from json_utils import parse_json_or_raise
    from schemas.requests import ClassifyResponse

    ok = parse_json_or_raise('noise {"category":"OTHER","priority":"LOW"} tail', ClassifyResponse)
    assert ok.category == "OTHER"
    with pytest.raises(ValueError):
        parse_json_or_raise("totally not json", ClassifyResponse)


@pytest.mark.asyncio
async def test_p2_sheds_before_p0():
    from rate_limiter import RateLimiter, BudgetExceeded
    rl = RateLimiter()
    # Fill to 80% of a 30 rpm budget → P2 should shed, P0 should still pass.
    for _ in range(24):
        await rl.acquire("P1", 1)
    with pytest.raises(BudgetExceeded):
        await rl.acquire("P2", 1)
    await rl.acquire("P0", 1)  # must not raise
