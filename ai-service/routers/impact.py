"""Cascading impact — a 2-step LLM chain (order dependencies → monetize)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

import prompts.impact as P
from pipeline import run_structured
from schemas.requests import DepsResponse, ImpactRequest, ImpactResponse

router = APIRouter()

ENDPOINT = "impact-analyze"


@router.post("/ai/impact-analyze", response_model=ImpactResponse)
async def impact_analyze(req: ImpactRequest) -> ImpactResponse:
    base = req.model_dump()
    try:
        # Step A — order the downstream dependency chain.
        deps = await run_structured(
            ENDPOINT,
            P.DEPS_SYSTEM,
            P.build_deps_messages(req),
            DepsResponse,
            P.DEPS_MAX_TOKENS,
            P.DEPS_TEMPERATURE,
            cache_payload={"step": "A", **base},
        )

        # Step B — monetize the chain into an impact tree + totals.
        result = await run_structured(
            ENDPOINT,
            P.IMPACT_SYSTEM,
            P.build_impact_messages(req, deps.ordered_chain),
            ImpactResponse,
            P.IMPACT_MAX_TOKENS,
            P.IMPACT_TEMPERATURE,
            cache_payload={"step": "B", "chain": deps.ordered_chain, **base},
        )
        if not result.root_machine_id:
            result.root_machine_id = req.machine_id
        return result
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"AI unavailable: {type(e).__name__}: {e}")
