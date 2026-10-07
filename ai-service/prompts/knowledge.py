"""System prompt + message builder for knowledge-base matching."""
from __future__ import annotations

import json

from schemas.requests import KnowledgeRequest

TEMPERATURE = 0.2
MAX_TOKENS = 520

SYSTEM = """You are a knowledge-management expert for industrial maintenance. Given a new problem
(description + category + machine_type + sub_category) and a list of past resolved cases, return the
TOP 3 most relevant past solutions ranked by similarity AND historical success. Prefer cases with
success=true and matching sub_category/machine_type.

Return {"similar_cases":[{entry_id, solution_summary, resolution_hours, cost, success, relevance(0-1),
match_reason}], "suggested_solutions":[short strings], "avg_resolution_time": number}.
If fewer than 3 relevant cases exist, return what matches (possibly empty).

Respond with ONE JSON object only. No markdown, no code fences."""

FEWSHOT = [
    {
        "role": "user",
        "content": (
            "New problem: category=HYDRAULIC, machine_type=CNC Mill, sub_category=SEAL_LEAK, description=\"hydraulic seal leak, pressure drop\".\n"
            'Past cases: [{"entry_id":"k1","category":"HYDRAULIC","machine_type":"CNC Mill","sub_category":"SEAL_LEAK","solution_summary":"Replaced HS-100 seal kit","resolution_hours":3,"cost":4500,"success":true},'
            '{"entry_id":"k2","category":"HYDRAULIC","machine_type":"Press","sub_category":"HOSE_BURST","solution_summary":"Replaced hose","resolution_hours":2,"cost":1500,"success":true}]'
        ),
    },
    {
        "role": "assistant",
        "content": '{"similar_cases":[{"entry_id":"k1","solution_summary":"Replaced HS-100 seal kit","resolution_hours":3,"cost":4500,"success":true,"relevance":0.95,"match_reason":"Exact sub_category + machine_type match; fix held."},{"entry_id":"k2","solution_summary":"Replaced hose","resolution_hours":2,"cost":1500,"success":true,"relevance":0.5,"match_reason":"Same HYDRAULIC category, different machine/sub_category."}],"suggested_solutions":["Replace the HS-100 hydraulic seal kit and pressure-test"],"avg_resolution_time":2.5}',
    },
]


def build_messages(req: KnowledgeRequest) -> list[dict]:
    user = (
        f"New problem: category={req.category}, machine_type={req.machine_type}, "
        f'sub_category={req.sub_category}, description="{req.description}".\n'
        f"Past cases: {json.dumps(req.cases, default=str)[:6000]}"
    )
    return [*FEWSHOT, {"role": "user", "content": user}]
