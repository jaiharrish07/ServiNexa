from fastapi import APIRouter

import prompts.knowledge as P
from routers._common import run_endpoint
from schemas.requests import KnowledgeRequest, KnowledgeResponse

router = APIRouter()


@router.post("/ai/knowledge-match", response_model=KnowledgeResponse)
async def knowledge_match(req: KnowledgeRequest) -> KnowledgeResponse:
    return await run_endpoint("knowledge-match", P, req, KnowledgeResponse)
