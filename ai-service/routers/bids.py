from fastapi import APIRouter

import prompts.bids as P
from routers._common import run_endpoint
from schemas.requests import BidsRequest, BidsResponse

router = APIRouter()


@router.post("/ai/score-bids", response_model=BidsResponse)
async def score_bids(req: BidsRequest) -> BidsResponse:
    return await run_endpoint("score-bids", P, req, BidsResponse)
