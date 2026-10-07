"""ServiNexa AI service — FastAPI + GroqCloud (GPT-OSS 20B). LLM-only, no ML models."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS, GROQ_MODEL, PORT
from groq_client import is_configured
from rate_limiter import limiter
from routers import (
    anomalies,
    bids,
    classify,
    diagnosis,
    impact,
    knowledge,
    match,
    parts,
    predict,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    print(f"[ai-service] up — model={GROQ_MODEL} groq_configured={is_configured()}")
    yield


app = FastAPI(title="ServiNexa AI Service", version="1.0.0", lifespan=lifespan)

_origins = ["*"] if CORS_ORIGINS.strip() == "*" else [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (classify, predict, match, anomalies, impact, bids, parts, knowledge, diagnosis):
    app.include_router(module.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "servinexa-ai", "model": GROQ_MODEL, "groq_configured": is_configured()}


@app.get("/health/ready")
async def ready() -> dict:
    return {"status": "ok", "groq_configured": is_configured(), "budget": limiter.snapshot()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
