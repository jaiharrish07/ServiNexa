from fastapi import APIRouter

import prompts.diagnosis as P
from routers._common import run_endpoint
from schemas.requests import DiagnosisRequest, DiagnosisResponse

router = APIRouter()


@router.post("/ai/analyze-diagnosis", response_model=DiagnosisResponse)
async def analyze_diagnosis(req: DiagnosisRequest) -> DiagnosisResponse:
    return await run_endpoint("analyze-diagnosis", P, req, DiagnosisResponse)
