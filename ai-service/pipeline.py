"""Shared LLM call pipeline: cache → rate-limit → Groq → parse → cache.

Routers call `run_structured` so the cross-cutting concerns live in one place.
On ANY failure it raises; routers translate that into HTTP 502 so the Express
backend falls back to its TypeScript stub (the live==stub contract).
"""
from __future__ import annotations

from typing import Optional, Type, TypeVar

from pydantic import BaseModel

import cache as cache_mod
from config import PRIORITY
from groq_client import chat_json
from json_utils import parse_json_or_raise
from rate_limiter import limiter

T = TypeVar("T", bound=BaseModel)


def _estimate_tokens(system: str, messages: list[dict], max_tokens: int) -> int:
    chars = len(system) + sum(len(str(m.get("content", ""))) for m in messages)
    return max_tokens + chars // 4  # ~4 chars/token heuristic


async def run_structured(
    endpoint: str,
    system: str,
    messages: list[dict],
    response_model: Type[T],
    max_tokens: int,
    temperature: float,
    cache_payload: Optional[dict] = None,
) -> T:
    # 1. Cache hit?
    if cache_payload is not None and cache_mod.is_cacheable(endpoint):
        cached = cache_mod.get(endpoint, cache_payload)
        if cached is not None:
            return response_model.model_validate(cached)

    # 2. Budget / priority gate (raises BudgetExceeded → 502 → Express stub).
    priority = PRIORITY.get(endpoint, "P1")
    await limiter.acquire(priority, _estimate_tokens(system, messages, max_tokens))

    # 3. Call Groq (JSON mode) + validate.
    raw = await chat_json(system, messages, max_tokens=max_tokens, temperature=temperature)
    obj = parse_json_or_raise(raw, response_model)

    # 4. Cache.
    if cache_payload is not None and cache_mod.is_cacheable(endpoint):
        cache_mod.set(endpoint, cache_payload, obj.model_dump())

    return obj
