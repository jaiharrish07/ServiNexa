"""Two-step cascading-impact prompts: (A) order dependencies, (B) monetize."""
from __future__ import annotations

import json

from schemas.requests import ImpactRequest

# ─── Step A: dependency ordering ───
DEPS_TEMPERATURE = 0.1
DEPS_MAX_TOKENS = 400
DEPS_SYSTEM = """You are a production-systems analyst. Given a failed machine and directed dependency
edges (upstream FEEDS downstream, with throughput_rate units/hr, unit_value INR/unit, buffer_hours),
produce the ordered list of downstream machines that lose production if the failed machine stays down,
with the hour each is affected (accounting for buffer_hours). Detect and ignore cycles.

Return {"ordered_chain":[{"machine_id","machine_code","depth","affected_after_hours","throughput_rate","unit_value","production_line"}]}.
Respond with ONE JSON object only. No markdown, no code fences."""

# ─── Step B: monetization ───
IMPACT_TEMPERATURE = 0.1
IMPACT_MAX_TOKENS = 800
IMPACT_SYSTEM = """You are a production-systems analyst. Given an ordered downstream chain and active
production orders (deadline, penalty), compute per node: units_lost_per_hour (= throughput_rate once
its buffer is exhausted), inr_per_hour (= units_lost_per_hour * unit_value), and orders_at_risk
(orders whose deadline cannot be met while down). Build a nested tree (root = failed machine) and
totals. All money in INR.

Also return: affected_machines (codes), production_lines, cascade_depth, downstream_count,
total_units_lost_per_hour, total_hourly_impact_inr, total_penalty_at_risk_inr,
cascading_impact_score (0-100: more downstream machines + more INR/hr + more penalties => higher),
sla_risk_level (LOW/MEDIUM/HIGH/CRITICAL), recommended_priority_override (CRITICAL/HIGH/MEDIUM/LOW or ""),
breakdown_by_machine (flat list of {machine_code, inr_per_hour}).

Respond with ONE JSON object only. No markdown, no code fences."""

DEPS_FEWSHOT = [
    {
        "role": "user",
        "content": (
            "failed_machine=M-104 (id m104). Edges: "
            '[{"upstream":"m104","downstream":"m200","machine_code":"M-200","throughput_rate":40,"unit_value":1200,"buffer_hours":1},'
            '{"upstream":"m200","downstream":"m300","machine_code":"M-300","throughput_rate":35,"unit_value":1800,"buffer_hours":0.5}]'
        ),
    },
    {
        "role": "assistant",
        "content": '{"ordered_chain":[{"machine_id":"m200","machine_code":"M-200","depth":1,"affected_after_hours":1,"throughput_rate":40,"unit_value":1200,"production_line":"Line 1"},{"machine_id":"m300","machine_code":"M-300","depth":2,"affected_after_hours":1.5,"throughput_rate":35,"unit_value":1800,"production_line":"Line 1"}]}',
    },
]


def build_deps_messages(req: ImpactRequest) -> list[dict]:
    user = (
        f"failed_machine={req.machine_code or 'unknown'} (id {req.machine_id}). "
        f"Edges: {json.dumps(req.edges, default=str)}"
    )
    return [*DEPS_FEWSHOT, {"role": "user", "content": user}]


def build_impact_messages(req: ImpactRequest, ordered_chain: list[dict]) -> list[dict]:
    user = (
        f"root_machine={req.machine_code or req.machine_id}. hours_down={req.hours}.\n"
        f"ordered_chain={json.dumps(ordered_chain, default=str)}.\n"
        f"production_orders={json.dumps(req.production_orders, default=str)}"
    )
    return [{"role": "user", "content": user}]
