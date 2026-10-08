from fastapi import APIRouter

import prompts.predict as P
from routers._common import run_endpoint
from schemas.requests import PredictRequest, PredictResponse

router = APIRouter()


@router.post("/ai/predict-health", response_model=PredictResponse)
async def predict_health(req: PredictRequest) -> PredictResponse:
    return await run_endpoint("predict-health", P, req, PredictResponse)
