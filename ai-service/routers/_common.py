"""Shared endpoint runner. Any failure → HTTP 502 so Express falls back to its stub."""
from __future__ import annotations

from types import ModuleType
from typing import Type, TypeVar

from fastapi import HTTPException
from pydantic import BaseModel

import cache as cache_mod
from pipeline import run_structured

T = TypeVar("T", bound=BaseModel)


async def run_endpoint(endpoint: str, prompt_module: ModuleType, req: BaseModel, response_model: Type[T]) -> T:
    try:
        cache_payload = req.model_dump() if cache_mod.is_cacheable(endpoint) else None
        return await run_structured(
            endpoint,
            prompt_module.SYSTEM,
            prompt_module.build_messages(req),
            response_model,
            prompt_module.MAX_TOKENS,
            prompt_module.TEMPERATURE,
            cache_payload,
        )
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 — translate everything to a stub-triggering 502
        raise HTTPException(status_code=502, detail=f"AI unavailable: {type(e).__name__}: {e}")
