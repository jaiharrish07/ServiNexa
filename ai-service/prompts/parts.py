"""System prompt + message builder for parts sourcing / availability."""
from __future__ import annotations

import json

from schemas.requests import PartsRequest

TEMPERATURE = 0.1
MAX_TOKENS = 650

SYSTEM = """You are a supply-chain analyst. For each required part choose the optimal source across:
local site inventory (instant), other company sites (transfer time), external vendors (lead time + cost).
Recommend the cheapest source that meets the urgency; if unavailable everywhere, propose compatible
substitutes (from the compatibility list) or flag a temporary fix. All money in INR.

Return {"matrix":[{part_number, part_id, required_qty, available_at_site, available_other_sites[],
external_vendors[], compatible_substitutes[], recommended:{source_type, detail, unit_cost, ready_in_hours},
unavailable, estimated_delivery_hours}], total_cost_inr, ready_by_hours, notes}.
source_type is one of LOCAL_SITE, OTHER_SITE, EXTERNAL_VENDOR, SUBSTITUTE.

Respond with ONE JSON object only. No markdown, no code fences."""

FEWSHOT = [
    {
        "role": "user",
        "content": (
            "Urgency: priority=HIGH, sla_remaining=6.\n"
            'Required: [{"part_number":"HS-100","quantity":2}]\n'
            'Local: [{"part_number":"HS-100","available":0}]\n'
            'Other sites: [{"part_number":"HS-100","site_name":"Site B","available":3,"transfer_hours":4}]\n'
            'Vendors: [{"part_number":"HS-100","vendor_name":"FastParts","price":61,"lead_time_hours":8,"min_order_qty":1}]\n'
            'Compatibility: [{"part_number":"HS-100","compatible_part_number":"HS-100X","notes":"OEM-equivalent"}]'
        ),
    },
    {
        "role": "assistant",
        "content": '{"matrix":[{"part_number":"HS-100","part_id":"","required_qty":2,"available_at_site":0,"available_other_sites":[{"site_name":"Site B","available":3,"transfer_hours":4}],"external_vendors":[{"vendor_name":"FastParts","price":61,"lead_time_hours":8}],"compatible_substitutes":[{"part_number":"HS-100X","notes":"OEM-equivalent"}],"recommended":{"source_type":"OTHER_SITE","detail":"Transfer 2 from Site B","unit_cost":45,"ready_in_hours":4},"unavailable":false,"estimated_delivery_hours":4}],"total_cost_inr":90,"ready_by_hours":4,"notes":"Cross-site transfer from Site B beats the vendor on both time and cost for this HIGH-priority job."}',
    },
]


def build_messages(req: PartsRequest) -> list[dict]:
    user = (
        f"Urgency: priority={req.priority}, sla_remaining={req.sla_remaining}.\n"
        f"Required: {json.dumps(req.required, default=str)}\n"
        f"Local: {json.dumps(req.local, default=str)}\n"
        f"Other sites: {json.dumps(req.sites, default=str)}\n"
        f"Vendors: {json.dumps(req.vendors, default=str)}\n"
        f"Compatibility: {json.dumps(req.compat, default=str)}"
    )
    return [*FEWSHOT, {"role": "user", "content": user}]
