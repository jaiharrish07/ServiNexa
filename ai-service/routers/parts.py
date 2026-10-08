from fastapi import APIRouter

import prompts.parts as P
from routers._common import run_endpoint
from schemas.requests import PartsRequest, PartsResponse

router = APIRouter()


@router.post("/ai/parts-sourcing", response_model=PartsResponse)
async def parts_sourcing(req: PartsRequest) -> PartsResponse:
    return await run_endpoint("parts-sourcing", P, req, PartsResponse)
