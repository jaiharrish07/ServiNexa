from fastapi import APIRouter

import prompts.match as P
from routers._common import run_endpoint
from schemas.requests import MatchRequest, MatchResponse

router = APIRouter()


@router.post("/ai/match-technician", response_model=MatchResponse)
async def match_technician(req: MatchRequest) -> MatchResponse:
    return await run_endpoint("match-technician", P, req, MatchResponse)
