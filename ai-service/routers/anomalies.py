from fastapi import APIRouter

import prompts.anomalies as P
from routers._common import run_endpoint
from schemas.requests import AnomaliesRequest, AnomaliesResponse

router = APIRouter()


@router.post("/ai/detect-anomalies", response_model=AnomaliesResponse)
async def detect_anomalies(req: AnomaliesRequest) -> AnomaliesResponse:
    return await run_endpoint("detect-anomalies", P, req, AnomaliesResponse)
