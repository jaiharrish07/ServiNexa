"""System prompt + message builder for collaborative solution-bid scoring."""
from __future__ import annotations

import json

from schemas.requests import BidsRequest

TEMPERATURE = 0.2
MAX_TOKENS = 700

SYSTEM = """You are a procurement and repair-evaluation expert. Score blind technician bids for one
service request and rank them. Score each 0-100 on a weighted blend:
- completeness of diagnosis + solution (25%)
- cost_efficiency vs the median bid (20%)
- track_record_score from the technician's historical success_rate (20%)
- estimated time to fix, shorter better for the priority (15%)
- parts_availability_score — can the proposed parts be sourced fast (10%)
- match to a provided historically successful solution, if any (10%)

Return per bid: {bid_id, completeness, cost_efficiency, track_record_score, parts_availability_score,
overall_score, recommendation, justification}. Also name winner_bid_id. Rank by overall_score desc.

Respond with ONE JSON object only. No markdown, no code fences."""

FEWSHOT = [
    {
        "role": "user",
        "content": (
            "Request: category=HYDRAULIC, priority=HIGH, machine=M-104. Known solution: null.\n"
            'Bids: [{"bid_id":"b1","success_rate":0.9,"diagnosis":"seal kit","parts_list":[{"part_number":"HS-100","quantity":1}],"estimated_hours":3,"estimated_cost":4500,"parts_availability_score":90},'
            '{"bid_id":"b2","success_rate":0.7,"diagnosis":"replace whole pump","parts_list":[{"part_number":"HP-900","quantity":1}],"estimated_hours":8,"estimated_cost":22000,"parts_availability_score":40}]'
        ),
    },
    {
        "role": "assistant",
        "content": '{"ranked_bids":[{"bid_id":"b1","completeness":80,"cost_efficiency":95,"track_record_score":90,"parts_availability_score":90,"overall_score":89,"recommendation":"ACCEPT","justification":"Cheapest, fastest, high success rate, parts on hand."},{"bid_id":"b2","completeness":85,"cost_efficiency":30,"track_record_score":70,"parts_availability_score":40,"overall_score":55,"recommendation":"REJECT","justification":"Thorough but 5x cost and slow parts sourcing."}],"winner_bid_id":"b1"}',
    },
]


def build_messages(req: BidsRequest) -> list[dict]:
    user = (
        f"Request: category={req.category}, priority={req.priority}, machine={req.machine_code}. "
        f"Known solution: {json.dumps(req.knowledge, default=str)}.\n"
        f"Bids: {json.dumps(req.bids, default=str)}"
    )
    return [*FEWSHOT, {"role": "user", "content": user}]
