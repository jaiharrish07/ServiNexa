"""System prompt + message builder for technician matching."""
from __future__ import annotations

import json

from schemas.requests import MatchRequest

TEMPERATURE = 0.2
MAX_TOKENS = 650

SYSTEM = """You are a workforce-optimization expert dispatching technicians for industrial repairs.
Rank the AVAILABLE technicians for this service request. Score each 0-100 (score and match_score are the same value).

Weigh (highest first): skill/specialization match to the request category; current workload
(lower current_job_count / max_concurrent_jobs is better); same site as the request; track record
(higher rating, lower avg_resolution_hours); relevant certifications. Use nuanced cues when present
(e.g. a tech who recently handled this machine).

For each ranked technician also return a factors object with 0-100 sub-scores:
{skill_match, proximity, workload, experience, certification}.
Exclude unavailable technicians. Return at most 5, sorted by score descending.
reasoning: one short phrase per technician.

Respond with ONE JSON object only. No markdown, no prose, no code fences."""

FEWSHOT = [
    {
        "role": "user",
        "content": (
            "Service request: category=HYDRAULIC, priority=HIGH, site_id=siteA, machine=M-104.\n"
            'Technicians: [{"id":"t1","specializations":["hydraulic","cnc"],"current_job_count":1,"max_concurrent_jobs":3,"site_id":"siteA","rating":4.8,"avg_resolution_hours":3.2},'
            '{"id":"t2","specializations":["electrical"],"current_job_count":2,"max_concurrent_jobs":3,"site_id":"siteA","rating":4.5,"avg_resolution_hours":4.1}]'
        ),
    },
    {
        "role": "assistant",
        "content": '{"ranked_technicians":[{"technician_id":"t1","score":94,"match_score":94,"reasoning":"Hydraulic+CNC specialist, same site, light load.","factors":{"skill_match":95,"proximity":100,"workload":67,"experience":90,"certification":80}},{"technician_id":"t2","score":48,"match_score":48,"reasoning":"Same site but no hydraulic skill and busier.","factors":{"skill_match":10,"proximity":100,"workload":33,"experience":70,"certification":40}}]}',
    },
]


def build_messages(req: MatchRequest) -> list[dict]:
    r = req.request or {}
    user = (
        f"Service request: category={r.get('category')}, priority={r.get('priority')}, "
        f"site_id={r.get('site_id')}, machine={r.get('machine_code') or r.get('machine_id')}.\n"
        f"Technicians: {json.dumps(req.technicians, default=str)}"
    )
    return [*FEWSHOT, {"role": "user", "content": user}]
