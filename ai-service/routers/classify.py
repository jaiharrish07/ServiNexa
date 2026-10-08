from fastapi import APIRouter

import prompts.classify as P
from routers._common import run_endpoint
from schemas.requests import ClassifyRequest, ClassifyResponse

router = APIRouter()


@router.post("/ai/classify-request", response_model=ClassifyResponse)
async def classify_request(req: ClassifyRequest) -> ClassifyResponse:
    return await run_endpoint("classify-request", P, req, ClassifyResponse)
