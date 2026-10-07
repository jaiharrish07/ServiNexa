"""Pydantic v2 request/response models for every AI endpoint.

The 4 pre-existing endpoints (classify/predict/match/anomalies) are SUPERSETS of
the TypeScript stub shapes already shipped in the Express backend, so a live Groq
response and the stub fallback are interchangeable (same keys the frontend reads).
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

_ignore = ConfigDict(extra="ignore")


# ─────────────────────────── classify-request ───────────────────────────
class ClassifyRequest(BaseModel):
    model_config = _ignore
    description: str


class ClassifyResponse(BaseModel):
    model_config = _ignore
    category: str
    sub_category: str = "OTHER"
    priority: str
    confidence: float = 0.6
    urgency_score: float = 0.5
    estimated_complexity: str = "MEDIUM"
    suggested_sla_hours: int = 24
    reasoning: str = ""


# ─────────────────────────── predict-health ───────────────────────────
class PredictRequest(BaseModel):
    model_config = _ignore
    air_temp: float = 25.0
    process_temp: float = 35.0
    rotational_speed: float = 1500.0
    torque: float = 40.0
    tool_wear: float = 100.0
    machine_code: str = ""
    machine_type: str = ""


class FailureMode(BaseModel):
    model_config = _ignore
    mode: str
    probability: float


class PredictResponse(BaseModel):
    model_config = _ignore
    failure_probability: float
    risk_level: str
    risk_score: float = 0.0  # alias of failure_probability for the new spec
    predicted_failure_mode: str = ""
    confidence: float = 0.6
    failure_modes: list[FailureMode] = Field(default_factory=list)
    recommended_action: str = ""
    reasoning: str = ""


# ─────────────────────────── match-technician ───────────────────────────
class MatchRequest(BaseModel):
    model_config = _ignore
    request: dict[str, Any] = Field(default_factory=dict)
    technicians: list[dict[str, Any]] = Field(default_factory=list)


class MatchFactors(BaseModel):
    model_config = _ignore
    skill_match: float = 0.0
    proximity: float = 0.0
    workload: float = 0.0
    experience: float = 0.0
    certification: float = 0.0


class RankedTechnician(BaseModel):
    model_config = _ignore
    technician_id: str
    score: float
    match_score: float = 0.0
    reasoning: str = ""
    factors: MatchFactors = Field(default_factory=MatchFactors)


class MatchResponse(BaseModel):
    model_config = _ignore
    ranked_technicians: list[RankedTechnician] = Field(default_factory=list)


# ─────────────────────────── detect-anomalies ───────────────────────────
class AnomaliesRequest(BaseModel):
    model_config = _ignore
    service_requests: list[dict[str, Any]] = Field(default_factory=list)
    window_label: str = "recent"
    baselines: dict[str, Any] = Field(default_factory=dict)


class Anomaly(BaseModel):
    model_config = _ignore
    type: str
    description: str
    severity: str
    affected: str = ""
    evidence: dict[str, Any] = Field(default_factory=dict)
    # Optional richer fields (sensor-style anomalies).
    machine_id: Optional[str] = None
    sensor: Optional[str] = None
    reading: Optional[float] = None
    normal_range: Optional[str] = None
    recommended_action: Optional[str] = None


class AnomaliesResponse(BaseModel):
    model_config = _ignore
    anomalies: list[Anomaly] = Field(default_factory=list)
    summary: str = ""


# ─────────────────────────── impact-analyze (2-step) ───────────────────────────
class ImpactRequest(BaseModel):
    model_config = _ignore
    machine_id: str
    machine_code: str = ""
    edges: list[dict[str, Any]] = Field(default_factory=list)
    production_orders: list[dict[str, Any]] = Field(default_factory=list)
    hours: float = 1.0


class DepsResponse(BaseModel):
    """Internal — output of impact step 1 (dependency ordering)."""
    model_config = _ignore
    ordered_chain: list[dict[str, Any]] = Field(default_factory=list)


class OrderAtRisk(BaseModel):
    model_config = _ignore
    order_code: str
    deadline: str = ""
    penalty_inr: float = 0.0


class ImpactNode(BaseModel):
    model_config = _ignore
    machine_id: str
    machine_code: str = ""
    depth: int = 0
    units_lost_per_hour: float = 0.0
    inr_per_hour: float = 0.0
    orders_at_risk: list[OrderAtRisk] = Field(default_factory=list)
    children: list["ImpactNode"] = Field(default_factory=list)


class ImpactResponse(BaseModel):
    model_config = _ignore
    root_machine_id: str
    downstream_count: int = 0
    cascade_depth: int = 0
    affected_machines: list[str] = Field(default_factory=list)
    production_lines: list[str] = Field(default_factory=list)
    total_units_lost_per_hour: float = 0.0
    total_hourly_impact_inr: float = 0.0
    total_penalty_at_risk_inr: float = 0.0
    cascading_impact_score: float = 0.0
    sla_risk_level: str = "LOW"
    recommended_priority_override: str = ""
    breakdown_by_machine: list[dict[str, Any]] = Field(default_factory=list)
    tree: Optional[ImpactNode] = None


ImpactNode.model_rebuild()


# ─────────────────────────── score-bids ───────────────────────────
class BidsRequest(BaseModel):
    model_config = _ignore
    category: str = ""
    priority: str = ""
    machine_code: str = ""
    knowledge: Optional[dict[str, Any]] = None
    bids: list[dict[str, Any]] = Field(default_factory=list)


class ScoredBid(BaseModel):
    model_config = _ignore
    bid_id: str
    completeness: float = 0.0
    cost_efficiency: float = 0.0
    track_record_score: float = 0.0
    parts_availability_score: float = 0.0
    overall_score: float
    recommendation: str = ""
    justification: str = ""


class BidsResponse(BaseModel):
    model_config = _ignore
    ranked_bids: list[ScoredBid] = Field(default_factory=list)
    winner_bid_id: str = ""


# ─────────────────────────── parts-sourcing ───────────────────────────
class PartsRequest(BaseModel):
    model_config = _ignore
    priority: str = "MEDIUM"
    sla_remaining: float = 24.0
    required: list[dict[str, Any]] = Field(default_factory=list)
    local: list[dict[str, Any]] = Field(default_factory=list)
    sites: list[dict[str, Any]] = Field(default_factory=list)
    vendors: list[dict[str, Any]] = Field(default_factory=list)
    compat: list[dict[str, Any]] = Field(default_factory=list)


class PartRecommendation(BaseModel):
    model_config = _ignore
    part_id: str = ""
    part_number: str
    required_qty: int = 1
    available_at_site: int = 0
    available_other_sites: list[dict[str, Any]] = Field(default_factory=list)
    external_vendors: list[dict[str, Any]] = Field(default_factory=list)
    compatible_substitutes: list[dict[str, Any]] = Field(default_factory=list)
    recommended: dict[str, Any] = Field(default_factory=dict)
    unavailable: bool = False
    estimated_delivery_hours: float = 0.0


class PartsResponse(BaseModel):
    model_config = _ignore
    matrix: list[PartRecommendation] = Field(default_factory=list)
    total_cost_inr: float = 0.0
    ready_by_hours: float = 0.0
    notes: str = ""


# ─────────────────────────── knowledge-match ───────────────────────────
class KnowledgeRequest(BaseModel):
    model_config = _ignore
    category: str = ""
    machine_type: str = ""
    sub_category: str = ""
    description: str = ""
    cases: list[dict[str, Any]] = Field(default_factory=list)


class KnowledgeHit(BaseModel):
    model_config = _ignore
    entry_id: str
    solution_summary: str = ""
    resolution_hours: float = 0.0
    cost: float = 0.0
    success: bool = True
    relevance: float = 0.0
    match_reason: str = ""


class KnowledgeResponse(BaseModel):
    model_config = _ignore
    similar_cases: list[KnowledgeHit] = Field(default_factory=list)
    suggested_solutions: list[str] = Field(default_factory=list)
    avg_resolution_time: float = 0.0


# ─────────────────────────── analyze-diagnosis (3D novelty) ───────────────────────────
class DiagnosisRequest(BaseModel):
    model_config = _ignore
    machine_type: str
    sub_category: str = "OTHER"
    sensor_data: dict[str, Any] = Field(default_factory=dict)
    machine_history: list[dict[str, Any]] = Field(default_factory=list)


class DiagnosisResponse(BaseModel):
    model_config = _ignore
    affected_component_id: str
    component_name: str
    failure_analysis: str = ""
    visual_highlight_zone: str = ""
    severity_assessment: str = "MEDIUM"
    diagnostic_questions_for_technicians: list[str] = Field(default_factory=list)
